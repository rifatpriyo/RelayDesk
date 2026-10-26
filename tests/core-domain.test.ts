import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedBusiness, demoActor } from "../src/lib/core/seed";
import { executeCommand } from "../src/lib/core/commands";
import {
  createCheckout,
  applyMockEvent,
  reserveReply,
  finalizeReply,
  releaseReply,
  reverseReply,
  reconcileSubscription,
} from "../src/lib/core/billing";
import { LocalStore } from "../src/lib/core/local-store";
import {
  validateFileBytes,
  assertCatalogImage,
} from "../src/lib/core/asset-policy";
const now = new Date("2026-10-21T06:00:00Z");
describe("tenant and permissions", () => {
  it("cannot mutate another business catalog or export foreign fields", () => {
    const a = seedBusiness("retail", now),
      b = seedBusiness("service", now);
    expect(() =>
      executeCommand(
        a,
        demoActor(),
        { action: "catalog.delete", id: b.catalog[0].id },
        now,
      ),
    ).toThrow("not found");
    const exported = executeCommand(
      a,
      demoActor(),
      { action: "data.export" },
      now,
    ) as { data: unknown };
    expect(JSON.stringify(exported.data)).not.toContain("Care & Repair");
    expect(exported.data).not.toHaveProperty("integrations");
  });
  it("denies agents billing, channels, catalog, export and team changes", () => {
    for (const input of [
      { action: "billing.cancel" },
      { action: "channel.toggle", id: "x", enabled: true },
      { action: "catalog.delete", id: "x" },
      { action: "data.export" },
      { action: "team.role", userId: "x", role: "admin" },
    ])
      expect(() =>
        executeCommand(
          seedBusiness("retail", now),
          demoActor("retail", "agent"),
          input,
          now,
        ),
      ).toThrow("Only an owner or admin");
  });
  it("never grants platform-admin via role mutation", () =>
    expect(() =>
      executeCommand(
        seedBusiness("retail", now),
        demoActor(),
        { action: "team.role", userId: "agent-demo", role: "platform-admin" },
        now,
      ),
    ).toThrow());
  it("takeover changes the generation so queued bot replies can be invalidated", () => {
    const s = seedBusiness("retail", now),
      id = s.conversations[0].id;
    executeCommand(
      s,
      demoActor("retail", "agent"),
      { action: "conversation.takeover", id },
      now,
    );
    expect(s.conversations[0]).toMatchObject({
      status: "manual",
      generation: 1,
    });
    executeCommand(s, demoActor(), { action: "conversation.resume", id }, now);
    expect(s.conversations[0]).toMatchObject({ status: "ai", generation: 2 });
  });
  it("rejects cross-business assignments and closed-window staff replies", () => {
    const s = seedBusiness("retail", now),
      id = s.conversations[0].id;
    expect(() =>
      executeCommand(
        s,
        demoActor(),
        { action: "conversation.assign", id, assignedTo: "foreign-member" },
        now,
      ),
    ).toThrow("member");
    expect(() =>
      executeCommand(
        s,
        demoActor(),
        { action: "conversation.reply", id, text: "hello" },
        new Date("2026-10-24"),
      ),
    ).toThrow("window");
  });
  it("keeps draft assistant changes separate until explicit publish", () => {
    const s = seedBusiness("retail", now);
    executeCommand(
      s,
      demoActor(),
      {
        action: "settings.save",
        settings: { ...s.settings.draft, tone: "professional" },
      },
      now,
    );
    expect(s.settings.published.tone).toBe("warm");
    executeCommand(s, demoActor(), { action: "settings.publish" }, now);
    expect(s.settings.published.tone).toBe("professional");
    expect(s.settings.version).toBe(2);
  });
  it("rejects ambiguous prices, unknown tenant fields and invalid intervals", () => {
    const s = seedBusiness("retail", now);
    expect(() =>
      executeCommand(
        s,
        demoActor(),
        {
          action: "catalog.save",
          product: { name: "Shirt", sku: "s", priceMinor: 1.5, stock: null },
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      executeCommand(
        s,
        demoActor(),
        {
          action: "catalog.save",
          product: {
            name: "Shirt",
            sku: "s",
            priceMinor: 100,
            stock: null,
            businessId: "foreign",
          },
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      executeCommand(
        s,
        demoActor(),
        {
          action: "rule.save",
          rule: {
            ...s.rules[0],
            businessId: undefined,
            endsAt: s.rules[0].startsAt,
          },
        },
        now,
      ),
    ).toThrow();
  });
});
describe("team, currency and approved assets", () => {
  it("enforces team quotas, account resolution, removal and stale membership rejection", () => {
    const s = seedBusiness("retail", now),
      owner = demoActor(),
      person = { userId: "member-2", name: "Mita", email: "mita@example.test" };
    expect(() =>
      executeCommand(
        s,
        owner,
        { action: "team.add", email: person.email, role: "agent" },
        now,
        person,
      ),
    ).toThrow("seat limit");
    executeCommand(
      s,
      owner,
      { action: "team.remove", userId: "agent-demo" },
      now,
    );
    expect(() =>
      executeCommand(
        s,
        owner,
        { action: "team.add", email: person.email, role: "agent" },
        now,
      ),
    ).toThrow("confirm");
    executeCommand(
      s,
      owner,
      { action: "team.add", email: person.email, role: "agent" },
      now,
      person,
    );
    expect(s.members).toHaveLength(2);
    expect(() =>
      executeCommand(
        s,
        owner,
        { action: "team.remove", userId: owner.userId },
        now,
      ),
    ).toThrow("non-owner");
    const member = { ...owner, userId: person.userId, role: "agent" as const };
    executeCommand(
      s,
      owner,
      { action: "team.remove", userId: person.userId },
      now,
    );
    expect(() =>
      executeCommand(
        s,
        member,
        { action: "conversation.takeover", id: s.conversations[0].id },
        now,
      ),
    ).toThrow("membership changed");
  });
  it("never relabels existing catalog money, and uses the selected currency for new records", () => {
    const s = seedBusiness("retail", now),
      {
        name,
        timezone,
        dashboardLanguage,
        retentionDays,
        allowedWidgetOrigins,
      } = s.business;
    const command = {
      action: "business.save",
      business: {
        name,
        timezone,
        dashboardLanguage,
        retentionDays,
        allowedWidgetOrigins,
        currency: "USD",
      },
    };
    expect(() => executeCommand(s, demoActor(), command, now)).toThrow(
      "never relabeled",
    );
    s.catalog = [];
    executeCommand(s, demoActor(), command, now);
    const p = executeCommand(
      s,
      demoActor(),
      {
        action: "catalog.save",
        product: { name: "Service", sku: "USA", priceMinor: 1500, stock: null },
      },
      now,
    );
    expect(p).toHaveProperty("currency", "USD");
    expect(s.billing.subscription.planId).toBe("free");
  });
  it("allows production website staff replies without consuming AI quota", () => {
    const s = seedBusiness("retail", now),
      cv = s.conversations[0];
    cv.channel = "website";
    executeCommand(
      s,
      { ...demoActor(), demo: false },
      {
        action: "conversation.reply",
        id: cv.id,
        text: "A team member is here.",
      },
      new Date("2026-12-01"),
    );
    expect(cv.messages.at(-1)).toMatchObject({ role: "staff", status: "sent" });
    expect(s.billing.usage[0].used).toBe(0);
    cv.channel = "messenger";
    expect(() =>
      executeCommand(
        s,
        { ...demoActor(), demo: false },
        { action: "conversation.reply", id: cv.id, text: "Hello" },
        now,
      ),
    ).toThrow("verified channel");
  });
  it("rejects foreign and unverified image references, path tricks and spoofed files", () => {
    const s = seedBusiness("retail", now);
    expect(() => assertCatalogImage(s, "/samples/../private")).toThrow(
      "verified",
    );
    expect(() =>
      assertCatalogImage(s, "/api/assets/11111111-1111-4111-8111-111111111111"),
    ).toThrow("verified");
    s.integrations.fileAssets = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        businessId: s.business.id,
        mime: "image/png",
        status: "ready",
      },
    ];
    expect(() =>
      assertCatalogImage(s, "/api/assets/11111111-1111-4111-8111-111111111111"),
    ).not.toThrow();
    expect(() =>
      validateFileBytes(
        { mime: "image/png", size: 14 },
        Buffer.from("<svg>bad</svg>"),
      ),
    ).toThrow();
    expect(() =>
      validateFileBytes(
        { mime: "text/plain", size: 2 },
        Buffer.from([255, 254]),
      ),
    ).toThrow();
    expect(() =>
      validateFileBytes({ mime: "text/plain", size: 5 }, Buffer.from("hello")),
    ).not.toThrow();
  });
});
describe("simulated billing and usage", () => {
  beforeEach(() => {
    process.env.BILLING_PROVIDER = "mock";
  });
  it("requires explicit server payment mode", () => {
    delete process.env.BILLING_PROVIDER;
    expect(() =>
      createCheckout(seedBusiness("retail", now), "starter", now),
    ).toThrow("explicitly");
  });
  it("validates snapshots and applies a successful checkout exactly once", () => {
    const s = seedBusiness("retail", now),
      c = createCheckout(s, "starter", now);
    for (const tamper of [
      { amountMinor: 1 },
      { currency: "USD" },
      { planId: "growth" },
      { businessId: "other" },
    ])
      expect(() =>
        applyMockEvent(
          s,
          {
            checkoutId: c.id,
            eventId: "event1",
            result: "succeeded",
            ...tamper,
          },
          now,
        ),
      ).toThrow("match");
    applyMockEvent(
      s,
      { checkoutId: c.id, eventId: "event1", result: "succeeded" },
      now,
    );
    applyMockEvent(
      s,
      { checkoutId: c.id, eventId: "event1", result: "succeeded" },
      now,
    );
    expect(s.billing.subscription.allowance).toBe(2000);
    expect(c.receipt).toMatch(/^SIM-/);
    expect(
      s.billing.events.filter((e) => e.kind === "checkout.succeeded"),
    ).toHaveLength(1);
  });
  it.each(["failed", "cancelled", "expired"] as const)(
    "terminal %s cannot become successful",
    (result) => {
      const s = seedBusiness("retail", now),
        c = createCheckout(s, "starter", now);
      applyMockEvent(s, { checkoutId: c.id, eventId: "e1", result }, now);
      expect(() =>
        applyMockEvent(
          s,
          { checkoutId: c.id, eventId: "e2", result: "succeeded" },
          now,
        ),
      ).toThrow("final");
      expect(s.billing.subscription.planId).toBe("free");
    },
  );
  it("expires abandoned checkout without granting an entitlement", () => {
    const s = seedBusiness("retail", now),
      c = createCheckout(s, "starter", now);
    applyMockEvent(
      s,
      { checkoutId: c.id, eventId: "e1", result: "succeeded" },
      new Date(now.getTime() + 31 * 60000),
    );
    expect(c.status).toBe("expired");
    expect(s.billing.subscription.allowance).toBe(200);
  });
  it("preserves current usage on upgrades and rejects concurrent duplicate upgrades", () => {
    const s = seedBusiness("retail", now);
    reserveReply(s, "r1", now);
    finalizeReply(s, "r1", now);
    const a = createCheckout(s, "starter", now),
      b = createCheckout(s, "starter", now);
    applyMockEvent(
      s,
      { checkoutId: a.id, eventId: "e1", result: "succeeded" },
      now,
    );
    expect(() =>
      applyMockEvent(
        s,
        { checkoutId: b.id, eventId: "e2", result: "succeeded" },
        now,
      ),
    ).toThrow("already active");
    expect(s.billing.usage[0].used).toBe(1);
    expect(() => createCheckout(s, "starter", now)).toThrow("higher plan");
  });
  it("reserves before inference and reconciles failed delivery only once", () => {
    const s = seedBusiness("retail", now);
    s.billing.subscription.allowance = 1;
    reserveReply(s, "r1", now);
    reserveReply(s, "r1", now);
    expect(() => reserveReply(s, "r2", now)).toThrow("allowance");
    finalizeReply(s, "r1", now);
    finalizeReply(s, "r1", now);
    reverseReply(s, "r1", now);
    reverseReply(s, "r1", now);
    expect(s.billing.usage[0]).toMatchObject({ used: 0, reserved: 0 });
    reserveReply(s, "r2", now);
    releaseReply(s, "r2", now);
    expect(s.billing.usage[0].reserved).toBe(0);
    expect(() => finalizeReply(s, "r2", now)).toThrow("Released");
  });
  it("attributes late finalization to the original billing period", () => {
    const s = seedBusiness("retail", now);
    reserveReply(s, "r1", now);
    const original = s.billing.subscription.periodId;
    reconcileSubscription(s, new Date("2026-12-01"));
    finalizeReply(s, "r1", new Date("2026-12-01"));
    expect(s.billing.usage.find((p) => p.periodId === original)?.used).toBe(1);
    expect(
      s.billing.usage.find(
        (p) => p.periodId === s.billing.subscription.periodId,
      )?.used,
    ).toBe(0);
  });
  it("cancellation retains entitlement until period end, without automatic charges", () => {
    const s = seedBusiness("retail", now),
      c = createCheckout(s, "starter", now);
    applyMockEvent(
      s,
      { checkoutId: c.id, eventId: "e1", result: "succeeded" },
      now,
    );
    executeCommand(s, demoActor(), { action: "billing.cancel" }, now);
    expect(s.billing.subscription.planId).toBe("starter");
    reconcileSubscription(s, new Date("2026-12-01"));
    expect(s.billing.subscription.planId).toBe("free");
    expect(s.billing.checkouts).toHaveLength(1);
  });
  it("preserves a requested downgrade through expiry until a successful checkout", () => {
    const s = seedBusiness("retail", now);
    const upgrade = createCheckout(s, "growth", now);
    applyMockEvent(
      s,
      {
        checkoutId: upgrade.id,
        eventId: "growth-success",
        result: "succeeded",
      },
      now,
    );
    executeCommand(
      s,
      demoActor(),
      { action: "billing.downgrade", planId: "starter" },
      now,
    );
    expect(s.billing.subscription).toMatchObject({
      planId: "growth",
      pendingPlanId: "starter",
      allowance: 10000,
    });
    const expired = new Date("2026-12-01T00:00:00Z");
    reconcileSubscription(s, expired);
    expect(s.billing.subscription).toMatchObject({
      planId: "free",
      pendingPlanId: "starter",
      allowance: 200,
    });
    const failed = createCheckout(s, "starter", expired);
    applyMockEvent(
      s,
      { checkoutId: failed.id, eventId: "starter-failed", result: "failed" },
      expired,
    );
    expect(s.billing.subscription.pendingPlanId).toBe("starter");
    const succeeded = createCheckout(s, "starter", expired);
    applyMockEvent(
      s,
      {
        checkoutId: succeeded.id,
        eventId: "starter-success",
        result: "succeeded",
      },
      expired,
    );
    expect(s.billing.subscription).toMatchObject({
      planId: "starter",
      allowance: 2000,
      cancelAtPeriodEnd: false,
    });
    expect(s.billing.subscription.pendingPlanId).toBeUndefined();
  });
});
describe("atomic durable local adapter", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "relaydesk-core-"));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it("persists edits across store instances and keeps both businesses separate", async () => {
    const store = new LocalStore(directory);
    await store.transact(demoActor(), (s) => {
      s.business.name = "Changed";
    });
    expect(
      (await new LocalStore(directory).read(demoActor())).business.name,
    ).toBe("Changed");
    expect((await store.read(demoActor("service"))).business.name).toBe(
      "Care & Repair",
    );
  });
  it("does not overspend under concurrent usage reservations", async () => {
    const store = new LocalStore(directory);
    await store.transact(demoActor(), (s) => {
      s.billing.subscription.allowance = 3;
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        store.transact(demoActor(), (s) => reserveReply(s, `r${i}`)),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await store.read(demoActor())).billing.usage[0].reserved).toBe(3);
  });
  it("rejects forged child tenant references without persisting partial changes", async () => {
    const store = new LocalStore(directory);
    await expect(
      store.transact(demoActor(), (s) => {
        s.catalog[0].businessId = "foreign";
      }),
    ).rejects.toThrow("another business");
    expect((await store.read(demoActor())).catalog[0].businessId).toBe(
      demoActor().businessId,
    );
  });
  it("uniquely claims assets across businesses and uses a global spend ceiling", async () => {
    const store = new LocalStore(directory);
    await store.claimAsset(demoActor(), "messenger", "page1");
    await expect(
      store.claimAsset(demoActor("service"), "messenger", "page1"),
    ).rejects.toThrow("another business");
    await store.reserveGlobalSpend(
      "sp1",
      demoActor().businessId,
      "2026-10-21",
      80,
      100,
    );
    await expect(
      store.reserveGlobalSpend(
        "sp2",
        demoActor("service").businessId,
        "2026-10-21",
        30,
        100,
      ),
    ).rejects.toThrow("budget");
    await store.settleGlobalSpend("sp1", 20);
    await store.reserveGlobalSpend(
      "sp2",
      demoActor("service").businessId,
      "2026-10-21",
      30,
      100,
    );
  });
});
