import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, BusinessState } from "../src/lib/core/types";
import { seedBusiness, demoActor, setSeedPlan } from "../src/lib/core/seed";
import { integrationState } from "../src/lib/integrations/types";
import { encryptCredential } from "../src/lib/integrations/security";

const memory = vi.hoisted(() => ({
  states: new Map<string, BusinessState>(),
  assets: new Map<string, string>(),
  tail: Promise.resolve() as Promise<unknown>,
  sends: vi.fn(),
  reply: vi.fn(),
  image: vi.fn(),
}));
vi.mock("../src/lib/core/server", () => ({
  readBusiness: async (actor: Actor) => {
    const state = memory.states.get(actor.businessId);
    if (!state) throw new Error("tenant denied");
    return structuredClone(state);
  },
  transactBusiness: async <T>(
    actor: Actor,
    callback: (draft: BusinessState) => T | Promise<T>,
  ) => {
    const next = memory.tail.then(async () => {
      const before = memory.states.get(actor.businessId);
      if (!before) throw new Error("tenant denied");
      const state = structuredClone(before),
        result = await callback(state);
      memory.states.set(actor.businessId, state);
      return result;
    });
    memory.tail = next.catch(() => {});
    return next;
  },
  serviceActor: (businessId: string) => ({
    userId: "service",
    businessId,
    role: "owner",
    demo: true,
    csrfToken: "",
    service: true,
  }),
  assertManager: (actor: Actor) => {
    if (actor.role === "agent") throw new Error("manager required");
  },
  claimChannelAsset: async (actor: Actor, kind: string, id: string) => {
    const key = `${kind}:${id}`,
      owner = memory.assets.get(key);
    if (owner && owner !== actor.businessId)
      throw new Error("asset belongs to another tenant");
    memory.assets.set(key, actor.businessId);
  },
  releaseChannelAsset: async (actor: Actor, kind: string, id: string) => {
    const key = `${kind}:${id}`;
    if (memory.assets.get(key) === actor.businessId) memory.assets.delete(key);
  },
  lookupChannelAsset: async (kind: string, id: string) =>
    memory.assets.get(`${kind}:${id}`) || null,
  reserveGlobalSpend: vi.fn(),
  settleGlobalSpend: vi.fn(),
}));
vi.mock("../src/lib/integrations/ai", () => ({
  generateReply: (...args: unknown[]) => memory.reply(...args),
}));
vi.mock("../src/lib/core/assets", () => ({
  resolveApprovedProductImage: (...args: unknown[]) => memory.image(...args),
}));
vi.mock("../src/lib/integrations/channels", async (original) => ({
  ...(await original<typeof import("../src/lib/integrations/channels")>()),
  sendChannel: (...args: unknown[]) => memory.sends(...args),
}));
import {
  persistInbound,
  processInboundJob,
  prepareInbound,
  generateInbound,
  deliverOutbound,
  deliverResponse,
  queueStaffReply,
  reconcileOutbound,
  splitChannelText,
  maintainBusiness,
} from "../src/lib/integrations/pipeline";
import {
  configureWidget,
  createWidgetSession,
  widgetChat,
  widgetMessages,
} from "../src/lib/integrations/widget";
import {
  createImport,
  publishImport,
  reviewImport,
} from "../src/lib/integrations/service";
import { selectAsset } from "../src/lib/integrations/oauth";
import type { NormalizedEvent } from "../src/lib/integrations/types";

const actor = demoActor();
function current() {
  return memory.states.get(actor.businessId)!;
}
function inbound(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: "10001:message-1",
    assetId: "10001",
    channel: "messenger",
    customerId: "customer-1",
    providerMessageId: "message-1",
    timestamp: Date.now(),
    kind: "message",
    text: "Sage panjabi price",
    ...overrides,
  };
}
beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString(
    "base64",
  );
  process.env.META_GRAPH_VERSION = "v25.0";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  memory.states.clear();
  memory.assets.clear();
  memory.tail = Promise.resolve();
  memory.sends.mockReset();
  memory.reply.mockReset();
  memory.image.mockReset();
  memory.image.mockResolvedValue(
    "https://storage.example.test/signed-product.png",
  );
  const state = seedBusiness("retail");
  setSeedPlan(state, "starter");
  memory.states.set(state.business.id, state);
  memory.states.set(
    seedBusiness("service").business.id,
    seedBusiness("service"),
  );
  integrationState(state).connections.push({
    id: "channel-1",
    channel: "messenger",
    assetId: "10001",
    name: "Fixture Page",
    credential: encryptCredential(
      { accessToken: "fixture-token" },
      actor.businessId,
      "channel-1",
    ),
    state: "connected",
    active: true,
    permissions: ["pages_messaging"],
    verifiedAt: new Date().toISOString(),
    revision: 0,
  });
  memory.assets.set("messenger:10001", actor.businessId);
  memory.sends.mockResolvedValue({
    status: "accepted",
    providerId: "provider-1",
  });
  memory.reply.mockResolvedValue({
    text: "Sage Linen Panjabi — BDT 1850.",
    sourceIds: ["retail-product-1"],
    sources: [],
    handover: false,
    simulated: true,
    model: "deterministic-demo",
    usage: null,
    reason: "",
  });
});
describe("multi-part response delivery", () => {
  function instagram() {
    const connection = integrationState(current()).connections[0];
    connection.channel = "instagram";
    memory.assets.set("instagram:10001", actor.businessId);
  }
  function approvedImage() {
    const product = current().catalog[0],
      id = "11111111-1111-4111-8111-111111111111";
    product.image = `/api/assets/${id}`;
    product.imageApproved = true;
    current().integrations.fileAssets = [
      {
        id,
        businessId: actor.businessId,
        name: "product.png",
        mime: "image/png",
        size: 100,
        reservedBytes: 100,
        path: `${actor.businessId}/${id}`,
        status: "ready",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    ];
  }
  it("splits Bengali and emoji without exceeding Instagram UTF-8 bytes or breaking code points", () => {
    const text = "বাংলা 🌿".repeat(180),
      parts = splitChannelText(text, "instagram");
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.join("")).toBe(text);
    expect(
      parts.every(
        (part) =>
          Buffer.byteLength(part, "utf8") <= 1000 && !part.includes("\ufffd"),
      ),
    ).toBe(true);
  });
  it("bills one response only after every text bubble is accepted", async () => {
    instagram();
    memory.reply.mockResolvedValue({
      text: "বাংলা 🌿".repeat(180),
      sourceIds: ["retail-product-1"],
      handover: false,
      simulated: true,
    });
    let number = 0;
    memory.sends.mockImplementation(async () => ({
      status: "accepted",
      providerId: `bubble-${++number}`,
    }));
    const job = (await persistInbound(inbound({ channel: "instagram" })))!;
    await prepareInbound(job.businessId, job.jobId);
    await generateInbound(job.businessId, job.jobId);
    const root = integrationState(current()).outbox[0];
    await deliverOutbound(job.businessId, root.id);
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 1 });
    await deliverResponse(job.businessId, root.id);
    await deliverResponse(job.businessId, root.id);
    expect(memory.sends).toHaveBeenCalledTimes(
      integrationState(current()).outbox.length,
    );
    expect(current().billing.usage[0]).toMatchObject({ used: 1, reserved: 0 });
    expect(current().billing.reservations).toHaveLength(1);
  });
  it("stops later bubbles after uncertainty and reconciles a child against the original reservation", async () => {
    instagram();
    memory.reply.mockResolvedValue({
      text: "অ".repeat(1000),
      sourceIds: [],
      handover: false,
      simulated: true,
    });
    memory.sends
      .mockResolvedValueOnce({ status: "accepted", providerId: "first" })
      .mockResolvedValueOnce({
        status: "ambiguous",
        code: "timeout",
        retryable: false,
      });
    const job = (await persistInbound(inbound({ channel: "instagram" })))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.sends).toHaveBeenCalledTimes(2);
    const parts = integrationState(current()).outbox;
    expect(parts[2].status).toBe("prepared");
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 1 });
    await reconcileOutbound(actor, parts[1].id, "accepted", "confirmed-second");
    let number = 2;
    memory.sends.mockImplementation(async () => ({
      status: "accepted",
      providerId: `confirmed-${++number}`,
    }));
    await deliverResponse(job.businessId, parts[2].id);
    expect(current().billing.usage[0]).toMatchObject({ used: 1, reserved: 0 });
  });
  it("cancels unsent bubbles and releases the one reservation on definitive part failure", async () => {
    instagram();
    memory.reply.mockResolvedValue({
      text: "অ".repeat(1000),
      sourceIds: [],
      handover: false,
      simulated: true,
    });
    memory.sends
      .mockResolvedValueOnce({ status: "accepted", providerId: "first" })
      .mockResolvedValueOnce({
        status: "failed",
        code: "provider_rejected",
        retryable: false,
      });
    const job = (await persistInbound(inbound({ channel: "instagram" })))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.sends).toHaveBeenCalledTimes(2);
    expect(
      integrationState(current())
        .outbox.slice(2)
        .every((part) => part.status === "cancelled"),
    ).toBe(true);
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
  });
  it("sends a specifically requested approved image in the same billable response", async () => {
    approvedImage();
    memory.sends
      .mockResolvedValueOnce({ status: "accepted", providerId: "text" })
      .mockResolvedValueOnce({ status: "accepted", providerId: "image" });
    const job = (await persistInbound(
      inbound({ text: "Sage panjabi photo" }),
    ))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.sends).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(memory.sends.mock.calls[1][0].body).message.attachment.payload
        .url,
    ).toBe("https://storage.example.test/signed-product.png");
    expect(current().billing.usage[0]).toMatchObject({ used: 1, reserved: 0 });
    const failure = (await persistInbound(
      inbound({
        id: "image-failed",
        kind: "status",
        providerMessageId: "image",
        status: "failed",
      }),
    ))!;
    await processInboundJob(failure.businessId, failure.jobId);
    expect(current().billing.usage[0].used).toBe(0);
  });
  it("does not send an image whose approval was withdrawn before delivery", async () => {
    approvedImage();
    const job = (await persistInbound(
      inbound({ text: "Sage panjabi photo" }),
    ))!;
    await prepareInbound(job.businessId, job.jobId);
    await generateInbound(job.businessId, job.jobId);
    current().catalog[0].imageApproved = false;
    await deliverResponse(
      job.businessId,
      integrationState(current()).outbox[0].id,
    );
    expect(memory.sends).toHaveBeenCalledTimes(1);
    expect(integrationState(current()).outbox[1].status).toBe("cancelled");
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
  });
  it("does not treat demo SVG illustrations, WebP or unapproved images as social media uploads", async () => {
    const job = (await persistInbound(
      inbound({ text: "Sage panjabi photo" }),
    ))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.image).not.toHaveBeenCalled();
    expect(memory.sends).toHaveBeenCalledTimes(1);
  });
  it("drops generated replies if staff took over and resumed while generation was running", async () => {
    memory.reply.mockImplementation(async () => {
      const conversation = current().conversations.find(
        (item) => item.customerId === "customer-1",
      )!;
      conversation.generation += 2;
      return {
        text: "obsolete reply",
        sourceIds: [],
        handover: false,
        simulated: true,
      };
    });
    const job = (await persistInbound(inbound()))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.sends).not.toHaveBeenCalled();
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
  });
});
describe("durable message and tenant boundaries", () => {
  it("deduplicates concurrent events, sends once, charges once", async () => {
    const jobs = await Promise.all([
      persistInbound(inbound()),
      persistInbound(inbound()),
      persistInbound(inbound()),
    ]);
    expect(new Set(jobs.map((job) => job!.jobId)).size).toBe(1);
    expect(integrationState(current()).inbox).toHaveLength(1);
    await Promise.all(
      jobs.map((job) => processInboundJob(job!.businessId, job!.jobId)),
    );
    await processInboundJob(jobs[0]!.businessId, jobs[0]!.jobId);
    expect(memory.sends).toHaveBeenCalledTimes(1);
    expect(current().billing.usage[0].used).toBe(1);
    expect(current().billing.usage[0].reserved).toBe(0);
  });
  it("cancels an already generated AI reply after human takeover", async () => {
    const job = (await persistInbound(inbound()))!;
    await prepareInbound(job.businessId, job.jobId);
    await generateInbound(job.businessId, job.jobId);
    const data = integrationState(current()),
      record = data.outbox[0],
      conversation = current().conversations.find(
        (item) => item.id === record.conversationId,
      )!;
    conversation.status = "manual";
    conversation.generation++;
    await deliverOutbound(job.businessId, record.id);
    expect(memory.sends).not.toHaveBeenCalled();
    expect(integrationState(current()).outbox[0].status).toBe("cancelled");
    expect(current().billing.usage[0].reserved).toBe(0);
  });
  it("cancels delayed replies when restrictions change", async () => {
    const job = (await persistInbound(inbound()))!;
    await prepareInbound(job.businessId, job.jobId);
    await generateInbound(job.businessId, job.jobId);
    current().rules.push({
      ...current().rules[0],
      id: "new-rule",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60000).toISOString(),
    });
    await deliverOutbound(
      job.businessId,
      integrationState(current()).outbox[0].id,
    );
    expect(memory.sends).not.toHaveBeenCalled();
  });
  it("never blindly retries a transport-ambiguous send", async () => {
    memory.sends.mockResolvedValue({
      status: "ambiguous",
      code: "timeout",
      retryable: false,
    });
    const job = (await persistInbound(inbound()))!;
    await processInboundJob(job.businessId, job.jobId);
    const record = integrationState(current()).outbox[0];
    await deliverOutbound(job.businessId, record.id);
    expect(memory.sends).toHaveBeenCalledTimes(1);
    expect(record.status).toBe("ambiguous");
    expect(current().billing.usage[0].used).toBe(0);
    expect(current().billing.usage[0].reserved).toBe(1);
  });
  it("reverses definitive delivery failure at most once", async () => {
    const job = (await persistInbound(inbound()))!;
    await processInboundJob(job.businessId, job.jobId);
    const failure = inbound({
      id: "10001:provider-1:failed",
      kind: "status",
      providerMessageId: "provider-1",
      status: "failed",
    });
    const failJob = (await persistInbound(failure))!;
    await processInboundJob(failJob.businessId, failJob.jobId);
    await processInboundJob(failJob.businessId, failJob.jobId);
    expect(current().billing.usage[0].used).toBe(0);
    expect(current().billing.reservations[0].status).toBe("reversed");
  });
  it("requires verified mapping for background processing", async () => {
    const job = (await persistInbound(inbound()))!;
    memory.assets.set("messenger:10001", demoActor("service").businessId);
    await expect(prepareInbound(job.businessId, job.jobId)).rejects.toThrow(
      "mapping",
    );
    expect(memory.sends).not.toHaveBeenCalled();
  });
  it("does not create a job for an unknown asset", async () => {
    expect(
      await persistInbound(inbound({ assetId: "not-authorized" })),
    ).toBeNull();
  });
  it("hands unsupported attachments to staff without inference", async () => {
    const job = (await persistInbound(
      inbound({ kind: "unsupported", text: undefined }),
    ))!;
    await processInboundJob(job.businessId, job.jobId);
    expect(memory.reply).not.toHaveBeenCalled();
    expect(
      current().conversations.find((item) => item.customerId === "customer-1")
        ?.status,
    ).toBe("handover");
  });
  it("handles manual provider echoes as takeover but ignores its own accepted echo", async () => {
    const job = (await persistInbound(inbound()))!;
    await processInboundJob(job.businessId, job.jobId);
    const own = (await persistInbound(
      inbound({
        id: "own-echo",
        kind: "echo",
        providerMessageId: "provider-1",
      }),
    ))!;
    await processInboundJob(own.businessId, own.jobId);
    expect(
      current().conversations.find((item) => item.customerId === "customer-1")
        ?.status,
    ).toBe("ai");
    const manual = (await persistInbound(
      inbound({
        id: "manual-echo",
        kind: "echo",
        providerMessageId: "staff-provider-2",
      }),
    ))!;
    await processInboundJob(manual.businessId, manual.jobId);
    expect(
      current().conversations.find((item) => item.customerId === "customer-1")
        ?.status,
    ).toBe("manual");
  });
  it("manual staff replies still obey channel windows", async () => {
    const conversation = current().conversations[0];
    conversation.lastInboundAt = new Date(
      Date.now() - 25 * 3600_000,
    ).toISOString();
    await expect(
      queueStaffReply(actor, conversation.id, "Hello"),
    ).rejects.toThrow("window");
  });
  it("does not let agents select channel secrets or import data", async () => {
    const agent = { ...actor, role: "agent" as const };
    await expect(selectAsset(agent, "messenger", "x", "10001")).rejects.toThrow(
      "manager",
    );
    await expect(createImport(agent, [], "test.csv", "csv")).rejects.toThrow(
      "manager",
    );
  });
});

describe("real import review persistence", () => {
  const rows = [
    { id: "new-a", name: "First", price: "10.00", currency: "BDT", stock: "3" },
  ];
  it("requires review then upserts without duplicate products", async () => {
    const batch = await createImport(actor, rows, "test.csv", "csv");
    expect(
      current().catalog.some((item) => item.sourceRecordId === "new-a"),
    ).toBe(false);
    await publishImport(actor, batch.id);
    await publishImport(actor, batch.id);
    expect(
      current().catalog.filter((item) => item.sourceRecordId === "new-a"),
    ).toHaveLength(1);
    const second = await createImport(
      actor,
      [{ ...rows[0], price: "12.00" }],
      "replacement.csv",
      "csv",
      batch.sourceId,
      true,
    );
    await publishImport(actor, second.id);
    expect(
      current().catalog.find((item) => item.sourceRecordId === "new-a")
        ?.priceMinor,
    ).toBe(1200);
  });
  it("preserves explicit owner field overrides across source sync", async () => {
    const batch = await createImport(actor, rows, "test.csv", "csv");
    await publishImport(actor, batch.id);
    const product = current().catalog.find(
      (item) => item.sourceRecordId === "new-a",
    )!;
    product.priceMinor = 9900;
    product.overrides = ["priceMinor"];
    const updated = await createImport(
      actor,
      [{ ...rows[0], price: "12.00" }],
      "update.csv",
      "csv",
      batch.sourceId,
    );
    await publishImport(actor, updated.id);
    expect(
      current().catalog.find((item) => item.sourceRecordId === "new-a")
        ?.priceMinor,
    ).toBe(9900);
  });
  it("rejects invalid rows and partial deletions atomically", async () => {
    const batch = await createImport(
      actor,
      [{ ...rows[0], price: "maybe" }],
      "bad.csv",
      "csv",
    );
    await expect(publishImport(actor, batch.id)).rejects.toThrow("invalid row");
    expect(current().catalog).toHaveLength(4);
    const valid = await createImport(
      actor,
      rows,
      "valid.csv",
      "csv",
      batch.sourceId,
      false,
    );
    await expect(publishImport(actor, valid.id, true)).rejects.toThrow(
      "incomplete",
    );
    expect(current().catalog).toHaveLength(4);
  });
  it("cannot use another tenant import ID", async () => {
    const batch = await createImport(actor, rows, "test.csv", "csv");
    await expect(publishImport(demoActor("service"), batch.id)).rejects.toThrow(
      "not found",
    );
    await expect(
      reviewImport(demoActor("service"), batch.id, {}),
    ).rejects.toThrow("not found");
  });
});

describe("bounded business maintenance", () => {
  it("exposes a crashed send as ambiguous without repeating it or releasing its reservation", async () => {
    const job = (await persistInbound(inbound()))!;
    await prepareInbound(job.businessId, job.jobId);
    await generateInbound(job.businessId, job.jobId);
    const item = integrationState(current()).outbox[0];
    item.status = "sending";
    item.updatedAt = new Date(Date.now() - 180_000).toISOString();
    const result = await maintainBusiness(actor.businessId);
    expect(result.uncertain).toBe(1);
    expect(integrationState(current()).outbox[0].status).toBe("ambiguous");
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 1 });
    expect(memory.sends).not.toHaveBeenCalled();
  });
  it("releases an abandoned generation only after the deadline and hands it to staff", async () => {
    const job = (await persistInbound(inbound()))!;
    await prepareInbound(job.businessId, job.jobId);
    await maintainBusiness(actor.businessId);
    expect(current().billing.usage[0].reserved).toBe(1);
    current().billing.reservations[0].updatedAt = new Date(
      Date.now() - 31 * 60_000,
    ).toISOString();
    await maintainBusiness(actor.businessId);
    expect(current().billing.usage[0].reserved).toBe(0);
    expect(integrationState(current()).inbox[0].status).toBe("failed");
    expect(
      current().conversations.find((c) => c.customerId === "customer-1")
        ?.status,
    ).toBe("handover");
    expect(memory.reply).not.toHaveBeenCalled();
  });
  it("applies retention and period expiry without preserving old customer content or granting a paid plan", async () => {
    memory.sends.mockResolvedValue({
      status: "ambiguous",
      code: "timeout",
      retryable: false,
    });
    const job = (await persistInbound(inbound()))!;
    await processInboundJob(job.businessId, job.jobId);
    current().business.retentionDays = 7;
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    integrationState(current()).outbox[0].createdAt = old;
    current().conversations.find(
      (c) => c.customerId === "customer-1",
    )!.updatedAt = old;
    current().billing.subscription.periodEnd = old;
    await maintainBusiness(actor.businessId);
    expect(current().billing.subscription.planId).toBe("free");
    expect(current().billing.reservations[0].status).toBe("released");
    expect(integrationState(current()).outbox).toHaveLength(0);
    expect(
      current().conversations.some((c) => c.customerId === "customer-1"),
    ).toBe(false);
  });
});

describe("scoped public widget", () => {
  async function request() {
    const config = await configureWidget(actor, {
        active: true,
        allowedOrigins: ["https://shop.example.test"],
        title: "Sample assistant",
      }),
      session = await createWidgetSession(
        config.widget.id,
        "https://shop.example.test",
        "fixture-client",
      );
    return {
      widgetId: config.widget.id,
      sessionId: session.sessionId,
      token: session.token,
      origin: "https://shop.example.test",
      message: "Sage price",
      requestId: crypto.randomUUID(),
    };
  }
  it("replays a staff-mode acknowledgement without another customer message or a charge", async () => {
    const input = await request();
    const session = integrationState(current()).sessions[0];
    current().conversations.find(
      (conversation) => conversation.id === session.conversationId,
    )!.status = "manual";
    expect(await widgetChat(input)).toEqual(await widgetChat(input));
    expect(memory.reply).not.toHaveBeenCalled();
    expect(
      current().conversations.find(
        (conversation) => conversation.id === session.conversationId,
      )!.messages,
    ).toHaveLength(1);
    expect(current().billing.usage[0].used).toBe(0);
  });
  it("caches the acknowledgement when a takeover invalidates a generated answer", async () => {
    const input = await request();
    memory.reply.mockImplementation(async () => {
      const session = integrationState(current()).sessions[0],
        conversation = current().conversations.find(
          (conversation) => conversation.id === session.conversationId,
        )!;
      conversation.status = "manual";
      conversation.generation++;
      return {
        text: "obsolete",
        handover: false,
        simulated: true,
        sourceIds: [],
      };
    });
    const first = await widgetChat(input);
    expect(first.handover).toBe(true);
    expect(await widgetChat(input)).toEqual(first);
    expect(memory.reply).toHaveBeenCalledTimes(1);
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
  });
  it("caches a staff acknowledgement on inference failure so retry cannot repeat cost", async () => {
    const input = await request();
    memory.reply.mockRejectedValue(new Error("provider unavailable"));
    const first = await widgetChat(input);
    expect(first.handover).toBe(true);
    expect(await widgetChat(input)).toEqual(first);
    expect(memory.reply).toHaveBeenCalledTimes(1);
    expect(current().billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
  });
  it("binds session token to origin, tenant and session; charges duplicate request once", async () => {
    const config = await configureWidget(actor, {
        active: true,
        allowedOrigins: ["https://shop.example.test"],
        title: "Sample assistant",
      }),
      session = await createWidgetSession(
        config.widget.id,
        "https://shop.example.test",
        "fixture-client",
      ),
      request = {
        widgetId: config.widget.id,
        sessionId: session.sessionId,
        token: session.token,
        origin: "https://shop.example.test",
        message: "Sage price",
        requestId: crypto.randomUUID(),
      };
    await expect(
      widgetChat({ ...request, origin: "https://evil.example.test" }),
    ).rejects.toThrow("different website");
    await expect(
      widgetChat({ ...request, token: "A".repeat(43) }),
    ).rejects.toThrow("expired");
    const first = await widgetChat(request),
      second = await widgetChat(request);
    expect(first.text).toBe(second.text);
    expect(memory.reply).toHaveBeenCalledTimes(1);
    expect(current().billing.usage[0].used).toBe(1);
    const messages = await widgetMessages(request);
    expect(
      messages.messages.every((message) => !("sourceIds" in message)),
    ).toBe(true);
  });
  it("does not create sessions for unapproved origins and disconnect invalidates existing sessions", async () => {
    const config = await configureWidget(actor, {
      active: true,
      allowedOrigins: ["https://shop.example.test"],
      title: "Sample assistant",
    });
    await expect(
      createWidgetSession(
        config.widget.id,
        "https://evil.example.test",
        "client",
      ),
    ).rejects.toThrow("not allowed");
    const session = await createWidgetSession(
      config.widget.id,
      "https://shop.example.test",
      "client",
    );
    await configureWidget(actor, {
      active: false,
      allowedOrigins: ["https://shop.example.test"],
      title: "Sample assistant",
    });
    await expect(
      widgetMessages({
        widgetId: config.widget.id,
        sessionId: session.sessionId,
        token: session.token,
        origin: "https://shop.example.test",
      }),
    ).rejects.toThrow("paused");
  });
});
