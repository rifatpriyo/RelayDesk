import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, BusinessState } from "../src/lib/core/types";
import { seedBusiness } from "../src/lib/core/seed";
import { integrationState } from "../src/lib/integrations/types";
const store = vi.hoisted(() => ({
  state: null as BusinessState | null,
  tail: Promise.resolve() as Promise<unknown>,
  global: new Map<string, number>(),
  fetch: vi.fn(),
}));
vi.mock("../src/lib/core/server", () => ({
  readBusiness: async (actor: Actor) => {
    if (store.state!.business.id !== actor.businessId)
      throw new Error("tenant mismatch");
    return structuredClone(store.state);
  },
  transactBusiness: async <T>(
    actor: Actor,
    fn: (state: BusinessState) => T | Promise<T>,
  ) => {
    const result = store.tail.then(async () => {
      if (store.state!.business.id !== actor.businessId)
        throw new Error("tenant mismatch");
      const draft = structuredClone(store.state!);
      const answer = await fn(draft);
      store.state = draft;
      return answer;
    });
    store.tail = result.catch(() => {});
    return result;
  },
  reserveGlobalSpend: async (
    id: string,
    _business: string,
    _day: string,
    amount: number,
    limit: number,
  ) => {
    const used = [...store.global.values()].reduce((sum, n) => sum + n, 0);
    if (used + amount > limit) throw new Error("global budget exhausted");
    store.global.set(id, amount);
  },
  settleGlobalSpend: async (id: string, actual: number) => {
    store.global.set(id, actual);
  },
  assertManager: (actor: Actor) => {
    if (actor.role === "agent") throw new Error("manager required");
  },
}));
import { boundedModelJson } from "../src/lib/integrations/ai-provider";
import { generateReply } from "../src/lib/integrations/ai";
const actor: Actor = {
  userId: "owner",
  businessId: "",
  role: "owner",
  demo: false,
  csrfToken: "",
};
const request = (id: string) => ({
  id,
  purpose: "playground" as const,
  outputLimit: 350,
  messages: [{ role: "user", content: "Select approved evidence as JSON." }],
});
beforeEach(() => {
  store.state = seedBusiness("retail");
  actor.businessId = store.state.business.id;
  store.tail = Promise.resolve();
  store.global.clear();
  store.fetch.mockReset();
  for (const [key, value] of Object.entries({
    AI_PROVIDER: "deepseek",
    REAL_INFERENCE_ENABLED: "true",
    DEEPSEEK_API_KEY: "test-only-not-a-real-key",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_MODEL: "deepseek-flash",
    DEEPSEEK_INPUT_USD_MICROS_PER_MILLION: "1000000",
    DEEPSEEK_OUTPUT_USD_MICROS_PER_MILLION: "1000000",
    AI_BUSINESS_DAILY_BUDGET_USD_MICROS: "100000",
    AI_GLOBAL_DAILY_BUDGET_USD_MICROS: "100000",
    AI_TEST_DAILY_BUDGET_USD_MICROS: "100000",
    AI_IMPORT_DAILY_BUDGET_USD_MICROS: "1000",
  }))
    process.env[key] = value;
  store.fetch.mockImplementation(async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              sourceIds: ["retail-product-1"],
              handover: false,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }),
  );
  vi.stubGlobal("fetch", store.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe("real inference is independent of simulated subscription grants", () => {
  it("requires explicit enablement even with a large simulated allowance", async () => {
    store.state!.billing.subscription.allowance = 1_000_000;
    process.env.REAL_INFERENCE_ENABLED = "false";
    await expect(boundedModelJson(actor, request("disabled"))).rejects.toThrow(
      "explicit operator",
    );
    expect(store.fetch).not.toHaveBeenCalled();
  });
  it("cannot bypass the business cost limit by upgrading a mock plan", async () => {
    store.state!.billing.subscription.planId = "growth";
    store.state!.billing.subscription.allowance = 10_000;
    process.env.AI_BUSINESS_DAILY_BUDGET_USD_MICROS = "1";
    await expect(boundedModelJson(actor, request("limited"))).rejects.toThrow(
      "spending limit",
    );
    expect(store.fetch).not.toHaveBeenCalled();
  });
  it("enforces a separate playground budget", async () => {
    process.env.AI_TEST_DAILY_BUDGET_USD_MICROS = "1";
    await expect(
      boundedModelJson(actor, request("test-limited")),
    ).rejects.toThrow("spending limit");
    expect(store.fetch).not.toHaveBeenCalled();
  });
  it("enforces a separate import budget", async () => {
    process.env.AI_IMPORT_DAILY_BUDGET_USD_MICROS = "1";
    await expect(
      boundedModelJson(actor, {
        ...request("import-limited"),
        purpose: "import",
      }),
    ).rejects.toThrow("spending limit");
    expect(store.fetch).not.toHaveBeenCalled();
  });
  it("fails closed on a global reservation error and clears local unused cost", async () => {
    process.env.AI_GLOBAL_DAILY_BUDGET_USD_MICROS = "1";
    await expect(
      boundedModelJson(actor, request("global-limited")),
    ).rejects.toThrow("global budget");
    expect(store.fetch).not.toHaveBeenCalled();
    expect(integrationState(store.state!).spend[0].actualMicros).toBe(0);
  });
  it("settles provider token usage without charging a customer reply", async () => {
    const result = await boundedModelJson(actor, request("success"));
    expect(result.usage.costMicros).toBe(30);
    expect(integrationState(store.state!).spend[0]).toMatchObject({
      status: "settled",
      actualMicros: 30,
      promptTokens: 20,
      completionTokens: 10,
    });
    expect(store.state!.billing.reservations).toHaveLength(0);
    const sent = JSON.parse(store.fetch.mock.calls[0][1].body);
    expect(sent.max_tokens).toBe(350);
    expect(sent.thinking).toEqual({ type: "disabled" });
    expect(sent.tools).toBeUndefined();
  });
  it("retains maximum spend after ambiguous provider timeout and does not retry", async () => {
    store.fetch.mockRejectedValue(new Error("network timeout"));
    await expect(boundedModelJson(actor, request("timeout"))).rejects.toThrow();
    await expect(boundedModelJson(actor, request("timeout"))).rejects.toThrow(
      "already has a model attempt",
    );
    expect(store.fetch).toHaveBeenCalledTimes(1);
    expect(integrationState(store.state!).spend[0].status).toBe("uncertain");
    expect(store.global.get("timeout")).toBeGreaterThan(0);
  });
  it("cannot use a server configuration to redirect secrets to another host", async () => {
    process.env.DEEPSEEK_BASE_URL = "https://attacker.example.test";
    await expect(boundedModelJson(actor, request("ssrf"))).rejects.toThrow(
      "official HTTPS",
    );
    expect(store.fetch).not.toHaveBeenCalled();
  });
  it("rejects a model-selected source outside the current evidence", async () => {
    store.fetch.mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                sourceIds: ["foreign-business-secret"],
                handover: false,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    );
    await expect(
      generateReply(actor, "Sage panjabi price", {
        responseId: "foreign-source",
        purpose: "playground",
      }),
    ).rejects.toThrow("unknown evidence");
    expect(integrationState(store.state!).spend[0].status).toBe("settled");
  });
  it("serializes concurrent spend reservations below the hard limit", async () => {
    process.env.AI_BUSINESS_DAILY_BUDGET_USD_MICROS = "1000";
    store.fetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      });
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        boundedModelJson(actor, request(`concurrent-${index}`)),
      ),
    );
    expect(results.some((result) => result.status === "rejected")).toBe(true);
    expect(
      integrationState(store.state!).spend.reduce(
        (sum, item) => sum + (item.actualMicros ?? item.reservedMicros),
        0,
      ),
    ).toBeLessThanOrEqual(1000);
  });
});
