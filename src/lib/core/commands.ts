import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor, BusinessState, Product, TemporaryRule } from "./types";
import { invariant } from "./errors";
import { applyMockEvent, createCheckout } from "./billing";
import { planById } from "./plans";
import { assertCatalogImage, fileAssets } from "./asset-policy";
import type { IntegrationState } from "../integrations/types";
const id = z.string().min(1).max(160),
  text = z.string().trim().min(1),
  date = z.string().datetime({ offset: true });
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Choose a valid IANA timezone.");
const style = z
  .object({
    tone: z.enum(["warm", "professional", "concise"]),
    languages: z
      .array(z.enum(["en", "bn", "banglish"]))
      .min(1)
      .max(3),
    replyLength: z.enum(["short", "balanced"]),
    maxDiscountPercent: z.number().int().min(0).max(50),
    handoverOnUncertainty: z.boolean(),
    advancedInstructions: z.string().max(2000),
    greeting: z.string().max(500),
  })
  .strict();
const product = z
  .object({
    id: id.optional(),
    name: text.max(160),
    description: z.string().max(3000).default(""),
    sku: text.max(100),
    kind: z.enum(["product", "service"]).default("product"),
    priceMinor: z.number().int().min(0).max(100000000),
    stock: z.number().int().min(0).max(1000000).nullable(),
    image: z.string().max(500).default(""),
    imageApproved: z.boolean().default(false),
    attributes: z.record(z.string().max(80), z.string().max(500)).default({}),
    variants: z
      .array(
        z.object({
          id,
          name: text.max(100),
          priceMinor: z.number().int().min(0),
          stock: z.number().int().min(0).nullable(),
        }),
      )
      .max(100)
      .default([]),
    freshnessHours: z.number().int().min(1).max(8760).default(24),
  })
  .strict();
const rule = z
  .object({
    id: id.optional(),
    title: text.max(160),
    scope: z.enum(["shipping", "hours", "orders", "general"]),
    startsAt: date,
    endsAt: date,
    timezone,
    priority: z.number().int().min(0).max(100),
    status: z.enum(["draft", "scheduled", "active", "expired", "cancelled"]),
    acceptOrders: z.boolean(),
    dispatchResumesAt: date.nullable(),
    explanation: text.max(2000),
  })
  .strict()
  .refine(
    (r) => new Date(r.endsAt) > new Date(r.startsAt),
    "The end must be after the start.",
  );
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("catalog.save"), product }),
  z.object({ action: z.literal("catalog.delete"), id }),
  z.object({
    action: z.literal("knowledge.save"),
    entry: z
      .object({
        id: id.optional(),
        title: text.max(180),
        content: text.max(20000),
        status: z.enum(["draft", "published", "archived"]),
      })
      .strict(),
  }),
  z.object({ action: z.literal("knowledge.delete"), id }),
  z.object({ action: z.literal("rule.save"), rule }),
  z.object({ action: z.literal("rule.delete"), id }),
  z.object({ action: z.literal("settings.save"), settings: style }),
  z.object({ action: z.literal("settings.publish") }),
  z.object({
    action: z.literal("business.save"),
    business: z
      .object({
        name: text.max(100),
        timezone,
        currency: z.enum(["BDT", "USD", "EUR", "GBP", "INR"]).optional(),
        dashboardLanguage: z.enum(["en", "bn"]),
        retentionDays: z.number().int().min(7).max(3650),
        allowedWidgetOrigins: z
          .array(
            z
              .string()
              .url()
              .refine((v) => {
                const u = new URL(v);
                return (
                  ["http:", "https:"].includes(u.protocol) && u.origin === v
                );
              }),
          )
          .max(20),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("onboarding.advance"),
    step: z.number().int().min(0).max(7),
  }),
  z.object({ action: z.literal("conversation.takeover"), id }),
  z.object({ action: z.literal("conversation.resume"), id }),
  z.object({
    action: z.literal("conversation.assign"),
    id,
    assignedTo: id.nullable(),
  }),
  z.object({
    action: z.literal("conversation.reply"),
    id,
    text: text.max(4000),
  }),
  z.object({ action: z.literal("channel.toggle"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("channel.disconnect"), id }),
  z.object({
    action: z.literal("billing.checkout"),
    planId: z.enum(["free", "starter", "growth", "scale"]),
    purpose: z.enum(["upgrade", "renewal"]).default("upgrade"),
  }),
  z.object({
    action: z.literal("billing.result"),
    checkoutId: id,
    eventId: id,
    result: z.enum(["succeeded", "failed", "cancelled", "pending", "expired"]),
    amountMinor: z.number().int().optional(),
    currency: z.string().optional(),
    planId: z.string().optional(),
    businessId: z.string().optional(),
  }),
  z.object({ action: z.literal("billing.cancel") }),
  z.object({
    action: z.literal("billing.downgrade"),
    planId: z.enum(["free", "starter", "growth"]),
  }),
  z.object({
    action: z.literal("team.role"),
    userId: id,
    role: z.enum(["admin", "agent"]),
  }),
  z.object({
    action: z.literal("team.add"),
    email: z.string().trim().email().max(254),
    role: z.enum(["admin", "agent"]),
  }),
  z.object({ action: z.literal("team.remove"), userId: id }),
  z.object({ action: z.literal("data.export") }),
  z.object({ action: z.literal("data.retention") }),
  z.object({ action: z.literal("business.delete"), confirmation: z.string() }),
]);
export type WorkspaceCommand = z.infer<typeof commandSchema>;
export function assertManager(actor: Actor) {
  invariant(
    actor.role === "owner" || actor.role === "admin" || actor.service,
    "FORBIDDEN",
    "Only an owner or admin can change this setting.",
    403,
  );
}
export function validateState(
  s: BusinessState,
  actor: Actor,
  allowDeleted = false,
) {
  invariant(
    s.business.id === actor.businessId,
    "TENANT_MISMATCH",
    "Business context does not match.",
    403,
  );
  invariant(
    actor.service ||
      s.members.some((m) => m.userId === actor.userId && m.role === actor.role),
    "MEMBERSHIP_CHANGED",
    "Your business membership changed. Reload and sign in again.",
    403,
  );
  invariant(
    allowDeleted || !s.business.deletedAt,
    "BUSINESS_DELETED",
    "This business has been deleted.",
    410,
  );
  for (const values of [
    s.catalog,
    s.knowledge,
    s.rules,
    s.conversations,
    s.channels,
    s.sources,
    s.audit,
    s.billing.checkouts,
    s.billing.reservations,
  ])
    for (const row of values)
      invariant(
        row.businessId === s.business.id,
        "TENANT_MISMATCH",
        "A record belongs to another business.",
        403,
      );
  for (const row of (s.integrations.fileAssets ?? []) as {
    businessId: string;
  }[])
    invariant(
      row.businessId === s.business.id,
      "TENANT_MISMATCH",
      "An uploaded file belongs to another business.",
      403,
    );
}
export type ResolvedMember = { userId: string; name: string; email: string };
export function applyRetention(s: BusinessState, now = new Date()) {
  const cutoff = now.getTime() - s.business.retentionDays * 86400000;
  const removed = new Set(
    s.conversations
      .filter((v) => new Date(v.updatedAt).getTime() < cutoff)
      .map((v) => v.id),
  );
  s.conversations = s.conversations.filter((v) => !removed.has(v.id));
  const runtime = s.integrations.relaydesk as IntegrationState | undefined;
  if (runtime) {
    runtime.inbox = runtime.inbox.filter(
      (job) =>
        !removed.has(job.conversationId || "") &&
        new Date(job.createdAt).getTime() >= cutoff,
    );
    runtime.outbox = runtime.outbox.filter(
      (item) =>
        !removed.has(item.conversationId) &&
        new Date(item.createdAt).getTime() >= cutoff,
    );
    runtime.sessions = runtime.sessions.filter(
      (session) =>
        !removed.has(session.conversationId) &&
        session.createdAt >= cutoff &&
        session.expiresAt > now.getTime(),
    );
    runtime.imports = runtime.imports.filter(
      (batch) =>
        !["history", "document"].includes(batch.kind) ||
        new Date(batch.createdAt).getTime() >= cutoff,
    );
  }
  return { retained: s.conversations.length, removed: removed.size };
}
export function executeCommand(
  s: BusinessState,
  actor: Actor,
  input: unknown,
  now = new Date(),
  resolvedMember?: ResolvedMember,
): unknown {
  validateState(s, actor);
  const c = commandSchema.parse(input),
    at = now.toISOString();
  if (!c.action.startsWith("conversation.")) assertManager(actor);
  let result: unknown = { saved: true },
    targetId: string | undefined;
  switch (c.action) {
    case "catalog.save": {
      assertCatalogImage(s, c.product.image);
      const old = c.product.id
        ? s.catalog.find((p) => p.id === c.product.id)
        : undefined;
      if (c.product.id) invariant(old, "NOT_FOUND", "Product not found.", 404);
      invariant(
        !s.catalog.some(
          (p) =>
            p.sku.toLowerCase() === c.product.sku.toLowerCase() &&
            p.id !== old?.id &&
            !p.archived,
        ),
        "DUPLICATE_SKU",
        "This SKU already exists.",
        409,
      );
      invariant(
        old ||
          s.catalog.filter((p) => !p.archived).length <
            planById(s.billing.subscription.planId).catalog,
        "CATALOG_LIMIT",
        "Your plan catalog limit is reached.",
        409,
      );
      const p: Product = {
        ...c.product,
        id: old?.id ?? randomUUID(),
        businessId: s.business.id,
        currency: s.business.currency,
        sourceId: old?.sourceId ?? "manual",
        sourceRecordId: old?.sourceRecordId ?? c.product.sku,
        updatedAt: at,
        overrides:
          old?.sourceId && old.sourceId !== "manual"
            ? [
                ...new Set([
                  ...(old.overrides ?? []),
                  "name",
                  "description",
                  "priceMinor",
                  "stock",
                  "attributes",
                  "image",
                  "sku",
                ]),
              ]
            : (old?.overrides ?? []),
        archived: false,
      };
      if (old) s.catalog[s.catalog.indexOf(old)] = p;
      else s.catalog.push(p);
      result = p;
      targetId = p.id;
      break;
    }
    case "catalog.delete": {
      const p = s.catalog.find((p) => p.id === c.id);
      invariant(p, "NOT_FOUND", "Product not found.", 404);
      p.archived = true;
      targetId = p.id;
      break;
    }
    case "knowledge.save": {
      const old = c.entry.id
        ? s.knowledge.find((k) => k.id === c.entry.id)
        : undefined;
      if (c.entry.id)
        invariant(old, "NOT_FOUND", "Knowledge entry not found.", 404);
      const k = {
        ...c.entry,
        id: old?.id ?? randomUUID(),
        businessId: s.business.id,
        source: old?.source ?? "Owner authored",
        version: (old?.version ?? 0) + 1,
        updatedAt: at,
      };
      if (old) s.knowledge[s.knowledge.indexOf(old)] = k;
      else s.knowledge.push(k);
      result = k;
      targetId = k.id;
      break;
    }
    case "knowledge.delete":
      invariant(
        s.knowledge.some((k) => k.id === c.id),
        "NOT_FOUND",
        "Knowledge entry not found.",
        404,
      );
      s.knowledge = s.knowledge.filter((k) => k.id !== c.id);
      targetId = c.id;
      break;
    case "rule.save": {
      const old = c.rule.id
        ? s.rules.find((r) => r.id === c.rule.id)
        : undefined;
      if (c.rule.id)
        invariant(old, "NOT_FOUND", "Temporary change not found.", 404);
      const r: TemporaryRule = {
        ...c.rule,
        id: old?.id ?? randomUUID(),
        businessId: s.business.id,
      };
      if (old) s.rules[s.rules.indexOf(old)] = r;
      else s.rules.push(r);
      result = r;
      targetId = r.id;
      break;
    }
    case "rule.delete":
      invariant(
        s.rules.some((r) => r.id === c.id),
        "NOT_FOUND",
        "Temporary change not found.",
        404,
      );
      s.rules = s.rules.filter((r) => r.id !== c.id);
      targetId = c.id;
      break;
    case "settings.save":
      s.settings.draft = c.settings;
      break;
    case "settings.publish":
      s.settings.published = structuredClone(s.settings.draft);
      s.settings.version++;
      s.settings.publishedAt = at;
      break;
    case "business.save":
      invariant(
        !c.business.currency ||
          c.business.currency === s.business.currency ||
          s.catalog.length === 0,
        "CURRENCY_IN_USE",
        "Currency can only change before catalog records are created. Existing prices are never relabeled.",
        409,
      );
      Object.assign(s.business, c.business);
      break;
    case "onboarding.advance":
      s.business.onboardingStep = c.step;
      break;
    case "conversation.takeover":
    case "conversation.resume":
    case "conversation.assign":
    case "conversation.reply": {
      const cv = s.conversations.find((v) => v.id === c.id);
      invariant(cv, "NOT_FOUND", "Conversation not found.", 404);
      cv.updatedAt = at;
      cv.unread = false;
      targetId = cv.id;
      if (c.action === "conversation.takeover") {
        cv.status = "manual";
        cv.generation++;
        cv.assignedTo = actor.userId;
      }
      if (c.action === "conversation.resume") {
        cv.status = "ai";
        cv.handoverReason = undefined;
        cv.generation++;
      }
      if (c.action === "conversation.assign") {
        invariant(
          c.assignedTo === null ||
            s.members.some((m) => m.userId === c.assignedTo),
          "INVALID_ASSIGNEE",
          "Choose a member of this business.",
        );
        cv.assignedTo = c.assignedTo;
      }
      if (c.action === "conversation.reply") {
        invariant(
          actor.demo || cv.channel === "website",
          "LIVE_SEND_REQUIRED",
          "Use the verified channel send endpoint for a live conversation.",
          409,
        );
        invariant(
          new Date(now).getTime() - new Date(cv.lastInboundAt).getTime() <
            24 * 60 * 60000 || cv.channel === "website",
          "CHANNEL_WINDOW_CLOSED",
          cv.channel === "whatsapp"
            ? "A WhatsApp approved template is required outside the service window."
            : "The messaging window has ended. A new customer message is needed.",
          409,
        );
        cv.status = "manual";
        cv.generation++;
        cv.messages.push({
          id: randomUUID(),
          role: "staff",
          text: c.text,
          createdAt: at,
          status: "sent",
        });
      }
      break;
    }
    case "channel.toggle": {
      const ch = s.channels.find((ch) => ch.id === c.id);
      invariant(ch, "NOT_FOUND", "Channel not found.", 404);
      invariant(
        !c.enabled ||
          ch.status === "connected" ||
          ch.status === "automation_paused",
        "NOT_CONNECTED",
        "Connect and verify this channel first.",
        409,
      );
      invariant(
        !c.enabled ||
          ch.kind === "website" ||
          s.billing.subscription.planId !== "free",
        "PLAN_REQUIRED",
        "A paid simulated plan is needed for social automation.",
        409,
      );
      ch.automationEnabled = c.enabled;
      ch.status = c.enabled ? "connected" : "automation_paused";
      targetId = ch.id;
      break;
    }
    case "channel.disconnect": {
      const ch = s.channels.find((ch) => ch.id === c.id);
      invariant(ch, "NOT_FOUND", "Channel not found.", 404);
      invariant(
        actor.demo || ch.kind === "website",
        "LIVE_DISCONNECT_REQUIRED",
        "Use the provider disconnect endpoint to revoke stored credentials.",
        409,
      );
      ch.automationEnabled = false;
      ch.status = "disconnected";
      targetId = ch.id;
      break;
    }
    case "billing.checkout":
      result = createCheckout(s, c.planId, now, c.purpose);
      break;
    case "billing.result":
      result = applyMockEvent(s, c, now);
      break;
    case "billing.cancel":
      s.billing.subscription.cancelAtPeriodEnd = true;
      s.billing.subscription.pendingPlanId = "free";
      break;
    case "billing.downgrade":
      invariant(
        planById(c.planId).replies < s.billing.subscription.allowance,
        "INVALID_DOWNGRADE",
        "Select a lower plan.",
      );
      s.billing.subscription.pendingPlanId = c.planId;
      s.billing.subscription.cancelAtPeriodEnd = true;
      break;
    case "team.role":
      invariant(
        actor.role === "owner",
        "OWNER_REQUIRED",
        "Only the owner can change team roles.",
        403,
      );
      invariant(
        c.userId !== actor.userId,
        "OWNER_REQUIRED",
        "The owner role cannot be removed here.",
      );
      {
        const m = s.members.find((m) => m.userId === c.userId);
        invariant(
          m && m.role !== "owner",
          "INVALID_MEMBER",
          "Select an existing non-owner member.",
        );
        m.role = c.role;
      }
      break;
    case "team.add": {
      invariant(
        actor.role === "owner",
        "OWNER_REQUIRED",
        "Only the owner can add team members.",
        403,
      );
      invariant(
        resolvedMember &&
          resolvedMember.email.toLowerCase() === c.email.toLowerCase(),
        "ACCOUNT_REQUIRED",
        "Ask this person to create and confirm their RelayDesk account first.",
        409,
      );
      invariant(
        !s.members.some((m) => m.userId === resolvedMember.userId),
        "MEMBER_EXISTS",
        "This account is already on your team.",
        409,
      );
      invariant(
        s.members.length < planById(s.billing.subscription.planId).seats,
        "SEAT_LIMIT",
        "Your plan team seat limit is reached.",
        409,
      );
      s.members.push({ ...resolvedMember, role: c.role });
      targetId = resolvedMember.userId;
      break;
    }
    case "team.remove": {
      invariant(
        actor.role === "owner",
        "OWNER_REQUIRED",
        "Only the owner can remove team members.",
        403,
      );
      const m = s.members.find((m) => m.userId === c.userId);
      invariant(
        m && m.role !== "owner",
        "INVALID_MEMBER",
        "Select an existing non-owner member.",
      );
      s.members = s.members.filter((m) => m.userId !== c.userId);
      for (const cv of s.conversations)
        if (cv.assignedTo === c.userId) cv.assignedTo = null;
      targetId = c.userId;
      break;
    }
    case "data.export": {
      const { integrations: _, ...data } = structuredClone(s);
      result = { filename: `relaydesk-${s.business.id}.json`, data };
      break;
    }
    case "data.retention":
      result = applyRetention(s, now);
      break;
    case "business.delete": {
      invariant(
        actor.role === "owner",
        "OWNER_REQUIRED",
        "Only an owner can delete this business.",
        403,
      );
      invariant(
        c.confirmation === s.business.name,
        "CONFIRMATION_REQUIRED",
        "Type the exact business name to confirm deletion.",
      );
      const liveCapabilities = fileAssets(s).filter(
        (a) => new Date(a.expiresAt).getTime() > now.getTime(),
      );
      invariant(
        actor.demo || liveCapabilities.length === 0,
        "UPLOAD_LINKS_ACTIVE",
        `Recent private upload links must expire before permanent file cleanup. Retry business deletion after ${
          liveCapabilities
            .map((a) => a.expiresAt)
            .sort()
            .at(-1) || at
        }.`,
        409,
      );
      s.business.deletedAt = at;
      s.business.allowedWidgetOrigins = [];
      s.catalog = [];
      s.knowledge = [];
      s.rules = [];
      s.conversations = [];
      s.sources = [];
      s.integrations = {};
      s.channels = [];
      s.members = s.members.map((m) => ({
        ...m,
        name: "Removed member",
        email: "",
      }));
      s.settings.draft = {
        ...s.settings.draft,
        advancedInstructions: "",
        greeting: "",
      };
      s.settings.published = {
        ...s.settings.published,
        advancedInstructions: "",
        greeting: "",
      };
      break;
    }
  }
  s.audit.push({
    id: randomUUID(),
    businessId: s.business.id,
    actorId: actor.userId,
    action: c.action,
    at,
    targetId,
  });
  return result;
}
