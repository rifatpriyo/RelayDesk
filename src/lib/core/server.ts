import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor, BusinessState, ChannelKind, Role } from "./types";
import { DomainError, invariant } from "./errors";
import { LocalStore } from "./local-store";
import {
  DEMO_RETAIL_ID,
  DEMO_SERVICE_ID,
  DEMO_USER_ID,
  emptyBusiness,
} from "./seed";
import { assertManager, validateState, type ResolvedMember } from "./commands";
import { fileAssets } from "./asset-policy";
export { assertManager };
export const isDemo = () => process.env.DEMO_MODE === "true";
const local = new LocalStore();
export const DEMO_COOKIE = "relaydesk_demo";
function secret() {
  const value = process.env.DEMO_SESSION_SECRET;
  invariant(
    value && value.length >= 32,
    "DEMO_NOT_CONFIGURED",
    "Set DEMO_SESSION_SECRET to at least 32 random characters to use the local demo.",
    503,
  );
  return value;
}
export function createDemoSession(kind: "retail" | "service") {
  invariant(isDemo(), "DEMO_DISABLED", "Demo mode is disabled.", 404);
  const data = Buffer.from(
    JSON.stringify({
      businessId: kind === "retail" ? DEMO_RETAIL_ID : DEMO_SERVICE_ID,
      exp: Date.now() + 86400000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(data).digest("base64url")}`;
}
function parseDemoSession(value: string): Actor {
  const [data, sig] = value.split(".");
  invariant(
    data && sig,
    "AUTH_REQUIRED",
    "Open the demo to start a session.",
    401,
  );
  const expected = createHmac("sha256", secret()).update(data).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    throw new DomainError("AUTH_REQUIRED", "Invalid session.", 401);
  }
  invariant(
    expected.length === provided.length && timingSafeEqual(expected, provided),
    "AUTH_REQUIRED",
    "Invalid session.",
    401,
  );
  let parsed: { businessId: string; exp: number; nonce: string };
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    throw new DomainError("AUTH_REQUIRED", "Invalid session.", 401);
  }
  invariant(
    parsed.exp > Date.now() &&
      [DEMO_RETAIL_ID, DEMO_SERVICE_ID].includes(parsed.businessId),
    "AUTH_REQUIRED",
    "Your demo session expired. Open the demo again.",
    401,
  );
  return {
    userId: DEMO_USER_ID,
    businessId: parsed.businessId,
    role: "owner",
    demo: true,
    csrfToken: createHmac("sha256", secret())
      .update(`csrf:${data}`)
      .digest("hex"),
  };
}
export async function supabaseForRequest() {
  const jar = await cookies(),
    url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  invariant(
    url && key,
    "AUTH_NOT_CONFIGURED",
    "Configure Supabase before signing in.",
    503,
  );
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values)
          jar.set(name, value, options);
      },
    },
  });
}
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  invariant(
    url && key,
    "DATABASE_NOT_CONFIGURED",
    "The production database is not configured.",
    503,
  );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const supabaseAdmin = admin;
export async function getRequestContext(_request?: Request): Promise<Actor> {
  const jar = await cookies(),
    demoCookie = jar.get(DEMO_COOKIE)?.value;
  if (isDemo() && demoCookie) return parseDemoSession(demoCookie);
  const supabase = await supabaseForRequest();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  invariant(
    user && !error,
    "AUTH_REQUIRED",
    "Please sign in to continue.",
    401,
  );
  const selected = jar.get("relaydesk_business")?.value;
  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("business_id,role,businesses!inner(deleted_at)")
    .eq("user_id", user.id)
    .is("businesses.deleted_at", null)
    .order("created_at");
  const membership =
    memberships?.find((m) => m.business_id === selected) || memberships?.[0];
  invariant(
    !membershipError,
    "DATABASE_ERROR",
    "Unable to load your business membership.",
    503,
  );
  if (!membership) {
    const db = admin(),
      businessId = crypto.randomUUID();
    const initial = emptyBusiness(
      businessId,
      user.id,
      String(user.user_metadata?.business_name || "My business"),
    );
    initial.members[0].email = user.email || "";
    const { data: createdId, error } = await db.rpc("bootstrap_business", {
      p_user: user.id,
      p_business: businessId,
      p_state: initial,
    });
    invariant(
      !error && createdId,
      "BUSINESS_SETUP_FAILED",
      "Unable to create your business. Verify the migrations are installed.",
      503,
    );
    const { data: createdMembership } = await db
      .from("memberships")
      .select("role")
      .eq("business_id", createdId)
      .eq("user_id", user.id)
      .single();
    invariant(
      createdMembership,
      "BUSINESS_SETUP_FAILED",
      "Could not load the new membership.",
      503,
    );
    return {
      userId: user.id,
      businessId: createdId,
      role: createdMembership.role as Role,
      demo: false,
      csrfToken: "",
    };
  }
  return {
    userId: user.id,
    businessId: membership.business_id,
    role: membership.role as Role,
    demo: false,
    csrfToken: "",
  };
}
export function requireSameOrigin(request: Request, actor?: Actor) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_ORIGIN;
  const expected = new URL(configured || request.url).origin;
  const origin = request.headers.get("origin");
  invariant(
    origin === expected,
    "CSRF_REJECTED",
    "The request origin could not be verified. Reload the page and try again.",
    403,
  );
  if (actor?.demo && request.headers.has("x-csrf-token"))
    invariant(
      request.headers.get("x-csrf-token") === actor.csrfToken,
      "CSRF_REJECTED",
      "Your session changed. Reload the page and try again.",
      403,
    );
}
export async function readBusiness(actor: Actor): Promise<BusinessState> {
  if (actor.demo) {
    invariant(isDemo(), "DEMO_DISABLED", "Demo mode is disabled.", 403);
    return local.read(actor);
  }
  const { data, error } = await admin().rpc("read_business_state", {
    p_business: actor.businessId,
    p_user: actor.userId,
    p_service: actor.service === true,
  });
  invariant(
    !error && data,
    "NOT_FOUND",
    "Business not found or access denied.",
    404,
  );
  const s = data as BusinessState;
  validateState(s, actor);
  return s;
}
export async function transactBusiness<T>(
  actor: Actor,
  fn: (draft: BusinessState) => T | Promise<T>,
): Promise<T> {
  if (actor.demo) {
    invariant(isDemo(), "DEMO_DISABLED", "Demo mode is disabled.", 403);
    return local.transact(actor, fn);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const draft = await readBusiness(actor),
      revision = draft.revision;
    const result = await fn(draft);
    validateState(draft, actor, true);
    draft.revision++;
    const { data, error } = await admin().rpc("commit_business_state", {
      p_business: actor.businessId,
      p_user: actor.userId,
      p_service: actor.service === true,
      p_revision: revision,
      p_state: draft,
    });
    invariant(!error, "DATABASE_ERROR", "The update could not be saved.", 503);
    if (data) return result;
  }
  throw new DomainError(
    "UPDATE_CONFLICT",
    "Another update is in progress. Please retry.",
    409,
  );
}
export function serviceActor(businessId: string): Actor {
  return {
    userId: "service",
    businessId,
    role: "owner",
    demo: isDemo(),
    csrfToken: "",
    service: true,
  };
}
export async function lookupChannelAsset(
  kind: ChannelKind,
  assetId: string,
): Promise<string | null> {
  if (isDemo()) return local.lookupAsset(kind, assetId);
  const { data, error } = await admin()
    .from("channel_assets")
    .select("business_id")
    .eq("channel", kind)
    .eq("asset_id", assetId)
    .maybeSingle();
  invariant(
    !error,
    "DATABASE_ERROR",
    "Could not resolve channel mapping.",
    503,
  );
  return data?.business_id ?? null;
}
export async function claimChannelAsset(
  actor: Actor,
  kind: ChannelKind,
  assetId: string,
) {
  assertManager(actor);
  await readBusiness(actor);
  if (actor.demo) return local.claimAsset(actor, kind, assetId);
  const db = admin();
  const { data } = await db
    .from("channel_assets")
    .select("business_id")
    .eq("channel", kind)
    .eq("asset_id", assetId)
    .maybeSingle();
  invariant(
    !data || data.business_id === actor.businessId,
    "ASSET_IN_USE",
    "This account belongs to another business.",
    409,
  );
  if (data) return;
  const { error } = await db
    .from("channel_assets")
    .insert({
      channel: kind,
      asset_id: assetId,
      business_id: actor.businessId,
    });
  invariant(!error, "ASSET_IN_USE", "This account is already connected.", 409);
}
export async function releaseChannelAsset(
  actor: Actor,
  kind: ChannelKind,
  assetId: string,
) {
  assertManager(actor);
  if (actor.demo) return local.releaseAsset(actor, kind, assetId);
  const { error } = await admin()
    .from("channel_assets")
    .delete()
    .eq("channel", kind)
    .eq("asset_id", assetId)
    .eq("business_id", actor.businessId);
  invariant(
    !error,
    "DATABASE_ERROR",
    "Could not release channel mapping.",
    503,
  );
}
export async function listBusinessIds(): Promise<string[]> {
  if (isDemo()) return local.listBusinessIds();
  const { data, error } = await admin()
    .from("businesses")
    .select("id")
    .is("deleted_at", null);
  invariant(!error, "DATABASE_ERROR", "Could not list background work.", 503);
  return (data ?? []).map((d) => d.id);
}
export async function reserveGlobalSpend(
  id: string,
  businessId: string,
  day: string,
  amountMicros: number,
  limitMicros: number,
) {
  invariant(
    Number.isSafeInteger(amountMicros) &&
      amountMicros >= 0 &&
      Number.isSafeInteger(limitMicros) &&
      limitMicros >= 0,
    "INVALID_COST",
    "Invalid operator cost budget.",
  );
  if (isDemo())
    return local.reserveGlobalSpend(
      id,
      businessId,
      day,
      amountMicros,
      limitMicros,
    );
  const { error } = await admin().rpc("reserve_global_spend", {
    p_id: id,
    p_business: businessId,
    p_day: day,
    p_amount: amountMicros,
    p_limit: limitMicros,
  });
  invariant(
    !error,
    "GLOBAL_COST_LIMIT",
    "The operator inference budget is exhausted or unavailable.",
    429,
  );
}
export async function settleGlobalSpend(id: string, actualMicros: number) {
  invariant(
    Number.isSafeInteger(actualMicros) && actualMicros >= 0,
    "INVALID_COST",
    "Invalid inference accounting.",
  );
  if (isDemo()) return local.settleGlobalSpend(id, actualMicros);
  const { error } = await admin().rpc("settle_global_spend", {
    p_id: id,
    p_actual: actualMicros,
  });
  invariant(
    !error,
    "COST_ACCOUNTING_ERROR",
    "Unable to settle inference usage.",
    503,
  );
}
export async function deleteBusinessAssets(actor: Actor) {
  invariant(
    actor.role === "owner" || actor.service,
    "OWNER_REQUIRED",
    "Only an owner can delete this business.",
    403,
  );
  const current = await readBusiness(actor);
  invariant(
    actor.demo ||
      fileAssets(current).every(
        (a) => new Date(a.expiresAt).getTime() <= Date.now(),
      ),
    "UPLOAD_LINKS_ACTIVE",
    "Recent upload links are still active. Retry after their expiry.",
    409,
  );
  if (actor.demo) {
    const { rm } = await import("node:fs/promises"),
      path = await import("node:path");
    const base = path.resolve(
        process.env.DEMO_DATA_DIR || path.join(process.cwd(), ".data", "demo"),
        "files",
      ),
      target = path.resolve(base, actor.businessId);
    invariant(
      target.startsWith(base + path.sep),
      "INVALID_PATH",
      "Invalid business file path.",
    );
    await rm(target, { recursive: true, force: true });
    return;
  }
  const db = admin(),
    bucket = db.storage.from("business-files");
  async function removeFolder(prefix: string) {
    let offset = 0;
    const files: string[] = [],
      folders: string[] = [];
    for (;;) {
      const { data, error } = await bucket.list(prefix, {
        limit: 1000,
        offset,
      });
      invariant(
        !error && data,
        "STORAGE_ERROR",
        "Unable to list business files for deletion.",
        503,
      );
      for (const item of data) {
        if (item.id) files.push(`${prefix}/${item.name}`);
        else folders.push(`${prefix}/${item.name}`);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    for (const folder of folders) await removeFolder(folder);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await bucket.remove(files.slice(i, i + 100));
      invariant(
        !error,
        "STORAGE_ERROR",
        "Unable to delete all business files. Retry deletion.",
        503,
      );
    }
  }
  await removeFolder(actor.businessId);
  const { error } = await db
    .from("channel_assets")
    .delete()
    .eq("business_id", actor.businessId);
  invariant(
    !error,
    "DATABASE_ERROR",
    "Unable to remove channel mappings. Retry deletion.",
    503,
  );
}
export async function resolveTeamMember(
  actor: Actor,
  email: string,
): Promise<ResolvedMember> {
  invariant(
    actor.role === "owner",
    "OWNER_REQUIRED",
    "Only the owner can add team members.",
    403,
  );
  await readBusiness(actor);
  const normalized = email.trim().toLowerCase();
  if (actor.demo) {
    invariant(
      /^[a-z0-9._+-]+@example\.test$/.test(normalized),
      "ACCOUNT_REQUIRED",
      "The local demo accepts sample addresses ending in @example.test.",
      409,
    );
    return {
      userId:
        normalized === "rafi@example.test"
          ? "agent-demo"
          : `demo:${normalized}`,
      email: normalized,
      name: normalized.split("@")[0],
    };
  }
  const { data, error } = await admin().rpc("resolve_enrolled_member", {
    p_email: normalized,
  });
  invariant(
    !error && data,
    "ACCOUNT_REQUIRED",
    "Ask this person to create and confirm their RelayDesk account first.",
    409,
  );
  return data as ResolvedMember;
}
export async function availableMemberships(actor: Actor) {
  if (actor.demo)
    return [
      {
        businessId: actor.businessId,
        name: (await readBusiness(actor)).business.name,
        role: actor.role,
      },
    ];
  const { data, error } = await admin()
    .from("memberships")
    .select("business_id,role,businesses!inner(name,deleted_at)")
    .eq("user_id", actor.userId)
    .is("businesses.deleted_at", null);
  invariant(!error, "DATABASE_ERROR", "Could not load your businesses.", 503);
  return (data ?? []).map((m) => ({
    businessId: m.business_id,
    role: m.role,
    name: (m.businesses as unknown as { name: string }).name,
  }));
}
export async function selectBusiness(actor: Actor, id: string) {
  invariant(
    !actor.demo,
    "DEMO_SELECTION",
    "Choose a business from the demo page.",
    400,
  );
  const memberships = await availableMemberships(actor);
  invariant(
    memberships.some((m) => m.businessId === id),
    "NOT_FOUND",
    "Business not found.",
    404,
  );
  (await cookies()).set("relaydesk_business", id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 30,
  });
}
