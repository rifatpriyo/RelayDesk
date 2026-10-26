import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoActor } from "../src/lib/core/seed";

const fixture = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  rows: [] as {
    business_id: string;
    role: string;
    businesses: { name: string; deleted_at: string | null };
  }[],
  userId: "e4444444-4444-4444-8444-444444444444",
  queried: [] as string[],
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      fixture.cookies.has(key)
        ? { value: fixture.cookies.get(key)! }
        : undefined,
    getAll: () =>
      [...fixture.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      fixture.cookies.set(name, value);
      fixture.set(name, value, options);
    },
    delete: (name: string) => fixture.cookies.delete(name),
  }),
}));
function query() {
  let rows = fixture.rows;
  const builder = {
    select: (columns: string) => {
      fixture.queried.push(columns);
      return builder;
    },
    eq: () => builder,
    is: (column: string) => {
      fixture.queried.push(column);
      rows = rows.filter((row) => !row.businesses.deleted_at);
      return builder;
    },
    order: async () => ({ data: rows, error: null }),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: fixture.userId, email: "owner@example.test" } },
        error: null,
      }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    from: query,
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: query }),
}));
import {
  availableMemberships,
  createDemoSession,
  DEMO_COOKIE,
  getRequestContext,
  requireSameOrigin,
  selectBusiness,
} from "../src/lib/core/server";
import { POST as authPost } from "../src/app/api/auth/[action]/route";

const first = "a1111111-1111-4111-8111-111111111111";
const second = "b2222222-2222-4222-8222-222222222222";
describe("authenticated membership selection and session boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    fixture.cookies.clear();
    fixture.set.mockClear();
    fixture.queried = [];
    fixture.rows = [
      {
        business_id: first,
        role: "agent",
        businesses: { name: "First business", deleted_at: null },
      },
      {
        business_id: second,
        role: "owner",
        businesses: { name: "Second business", deleted_at: null },
      },
    ];
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv(
      "DEMO_SESSION_SECRET",
      "unit-test-session-secret-at-least-32-characters",
    );
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-key");
  });

  it("derives role from membership, and ignores an unowned selected business", async () => {
    fixture.cookies.set("relaydesk_business", "foreign-business");
    expect(await getRequestContext()).toMatchObject({
      userId: fixture.userId,
      businessId: first,
      role: "agent",
      demo: false,
    });
    fixture.cookies.set("relaydesk_business", second);
    expect(await getRequestContext()).toMatchObject({
      businessId: second,
      role: "owner",
    });
  });

  it("filters deleted businesses from selection and the switcher", async () => {
    fixture.rows[0].businesses.deleted_at = new Date().toISOString();
    fixture.cookies.set("relaydesk_business", first);
    const actor = await getRequestContext();
    expect(actor.businessId).toBe(second);
    expect(await availableMemberships(actor)).toEqual([
      { businessId: second, name: "Second business", role: "owner" },
    ]);
    expect(fixture.queried).toContain("businesses.deleted_at");
  });

  it("only stores a verified available membership in the HTTP-only selection cookie", async () => {
    const actor = await getRequestContext();
    await expect(
      selectBusiness(actor, "f5555555-5555-4555-8555-555555555555"),
    ).rejects.toThrow("not found");
    expect(fixture.set).not.toHaveBeenCalled();
    await selectBusiness(actor, second);
    expect(fixture.set).toHaveBeenCalledWith(
      "relaydesk_business",
      second,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    await expect(selectBusiness(demoActor(), second)).rejects.toThrow(
      "demo page",
    );
  });

  it("requires an explicit demo mode and rejects a tampered signed session", async () => {
    expect(() => createDemoSession("retail")).toThrow("disabled");
    vi.stubEnv("DEMO_MODE", "true");
    const session = createDemoSession("retail");
    fixture.cookies.set(DEMO_COOKIE, session);
    expect(await getRequestContext()).toMatchObject({
      businessId: first,
      demo: true,
      role: "owner",
    });
    const [data, signature] = session.split(".");
    const forged = Buffer.from(
      JSON.stringify({ businessId: second, exp: Date.now() + 60000 }),
    ).toString("base64url");
    expect(forged).not.toBe(data);
    fixture.cookies.set(DEMO_COOKIE, `${forged}.${signature}`);
    await expect(getRequestContext()).rejects.toThrow("Invalid session");
  });

  it("rejects cross-origin mutations and a stale demo CSRF token", () => {
    const actor = demoActor();
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/workspace"),
        actor,
      ),
    ).toThrow("origin");
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/workspace", {
          headers: { origin: "https://attacker.example.test" },
        }),
        actor,
      ),
    ).toThrow("origin");
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/workspace", {
          headers: {
            origin: "https://app.example.test",
            "x-csrf-token": "wrong",
          },
        }),
        actor,
      ),
    ).toThrow("session changed");
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/workspace", {
          headers: {
            origin: "https://app.example.test",
            "x-csrf-token": actor.csrfToken,
          },
        }),
        actor,
      ),
    ).not.toThrow();
  });

  it("real sign-in clears a prior demo session and logout clears business selection", async () => {
    fixture.cookies.set(DEMO_COOKIE, "old-demo-cookie");
    fixture.cookies.set("relaydesk_business", first);
    const request = new Request("https://app.example.test/api/auth/sign-in", {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "fixture-password",
      }),
    });
    const response = await authPost(request, {
      params: Promise.resolve({ action: "sign-in" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty(
      "redirect",
      "/workspace/overview",
    );
    expect(fixture.cookies.has(DEMO_COOKIE)).toBe(false);
    const logout = await authPost(
      new Request("https://app.example.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://app.example.test" },
      }),
      { params: Promise.resolve({ action: "logout" }) },
    );
    expect(logout.status).toBe(200);
    expect(fixture.cookies.has("relaydesk_business")).toBe(false);
  });
});
