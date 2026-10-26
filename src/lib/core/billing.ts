import { randomUUID } from "node:crypto";
import { invariant } from "./errors";
import { planById } from "./plans";
import type { BusinessState, Checkout, PlanId } from "./types";
const stamp = (now: Date | string = new Date()) => new Date(now).toISOString();
function event(
  s: BusinessState,
  kind: string,
  description: string,
  now: Date | string,
) {
  s.billing.events.push({
    id: randomUUID(),
    kind,
    description,
    at: stamp(now),
  });
}
export function reconcileSubscription(
  s: BusinessState,
  now: Date | string = new Date(),
) {
  const sub = s.billing.subscription;
  if (new Date(sub.periodEnd).getTime() > new Date(now).getTime()) return;
  // There is no recurring charge. Unrenewed subscriptions return to Free at expiry.
  const at = stamp(now),
    end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  sub.planId = "free";
  sub.allowance = 200;
  sub.periodId = randomUUID();
  sub.periodStart = at;
  sub.periodEnd = end.toISOString();
  sub.status = "active";
  sub.cancelAtPeriodEnd = false;
  s.billing.usage.push({ periodId: sub.periodId, used: 0, reserved: 0 });
  event(
    s,
    "period.expired",
    "Previous period ended; Free allowance started. No payment was taken.",
    now,
  );
}
export function createCheckout(
  s: BusinessState,
  planId: PlanId,
  now: Date | string = new Date(),
  purpose: "upgrade" | "renewal" = "upgrade",
): Checkout {
  invariant(
    process.env.BILLING_PROVIDER === "mock",
    "BILLING_NOT_CONFIGURED",
    "Mock billing must be explicitly enabled by the operator.",
    503,
  );
  const plan = planById(planId);
  invariant(
    plan?.purchasable && plan.priceMinor !== null,
    "INVALID_PLAN",
    "This plan is not available for simulated purchase.",
  );
  const sub = s.billing.subscription;
  if (purpose === "renewal")
    invariant(
      new Date(sub.periodEnd).getTime() <= new Date(now).getTime(),
      "EARLY_RENEWAL",
      "Simulated renewal becomes available when the current period ends.",
    );
  else {
    reconcileSubscription(s, now);
    invariant(
      plan.replies > sub.allowance,
      "NOT_AN_UPGRADE",
      "Choose a higher plan. Downgrades are scheduled at period end.",
    );
  }
  const checkout: Checkout = {
    id: randomUUID(),
    businessId: s.business.id,
    planId,
    amountMinor: plan.priceMinor,
    currency: "BDT",
    provider: "mock",
    paymentMode: "mock",
    status: "pending",
    createdAt: stamp(now),
    expiresAt: new Date(new Date(now).getTime() + 30 * 60000).toISOString(),
    subscriptionId: sub.id,
    periodId: sub.periodId,
    eventIds: [],
    purpose,
  };
  s.billing.checkouts.push(checkout);
  event(
    s,
    "checkout.created",
    `Simulated ${plan.name} checkout created. No money will be charged.`,
    now,
  );
  return checkout;
}
export type MockEvent = {
  checkoutId: string;
  eventId: string;
  result: "succeeded" | "failed" | "cancelled" | "pending" | "expired";
  amountMinor?: number;
  currency?: string;
  planId?: string;
  businessId?: string;
};
export function applyMockEvent(
  s: BusinessState,
  input: MockEvent,
  now: Date | string = new Date(),
): Checkout {
  invariant(
    process.env.BILLING_PROVIDER === "mock",
    "BILLING_NOT_CONFIGURED",
    "Mock billing is not enabled.",
    503,
  );
  const c = s.billing.checkouts.find(
    (x) => x.id === input.checkoutId && x.businessId === s.business.id,
  );
  invariant(c, "NOT_FOUND", "Checkout not found.", 404);
  invariant(
    !s.billing.checkouts.some(
      (other) => other.id !== c.id && other.eventIds.includes(input.eventId),
    ),
    "REPLAY_CONFLICT",
    "This event belongs to another checkout.",
    409,
  );
  invariant(
    (input.amountMinor === undefined || input.amountMinor === c.amountMinor) &&
      (input.currency === undefined || input.currency === c.currency) &&
      (input.planId === undefined || input.planId === c.planId) &&
      (input.businessId === undefined || input.businessId === c.businessId),
    "PAYMENT_MISMATCH",
    "Checkout details do not match the server price snapshot.",
    409,
  );
  if (c.eventIds.includes(input.eventId)) {
    invariant(
      c.status === input.result || input.result === "pending",
      "REPLAY_CONFLICT",
      "This event was already processed with a different result.",
      409,
    );
    return c;
  }
  invariant(
    c.status === "pending",
    "TERMINAL_CHECKOUT",
    "This attempt is already final. Start a new checkout.",
    409,
  );
  if (new Date(c.expiresAt).getTime() <= new Date(now).getTime()) {
    c.status = "expired";
    c.eventIds.push(input.eventId);
    event(s, "checkout.expired", "Simulated checkout expired.", now);
    return c;
  }
  if (input.result === "succeeded") {
    const sub = s.billing.subscription,
      plan = planById(c.planId);
    invariant(
      sub.id === c.subscriptionId && sub.periodId === c.periodId,
      "STALE_CHECKOUT",
      "The billing period changed. Start a new checkout.",
      409,
    );
    invariant(
      c.amountMinor === plan.priceMinor && c.currency === plan.currency,
      "PAYMENT_MISMATCH",
      "Stored price snapshot no longer matches this plan.",
      409,
    );
    if (c.purpose === "renewal") {
      invariant(
        new Date(sub.periodEnd).getTime() <= new Date(now).getTime(),
        "EARLY_RENEWAL",
        "Current period has not ended.",
      );
      const end = new Date(now);
      end.setUTCMonth(end.getUTCMonth() + 1);
      sub.periodStart = stamp(now);
      sub.periodEnd = end.toISOString();
      sub.periodId = randomUUID();
      s.billing.usage.push({ periodId: sub.periodId, used: 0, reserved: 0 });
    } else {
      invariant(
        plan.replies > sub.allowance,
        "STALE_CHECKOUT",
        "This plan is already active or a higher plan was selected.",
        409,
      );
      invariant(
        new Date(sub.periodEnd).getTime() > new Date(now).getTime(),
        "STALE_CHECKOUT",
        "The billing period ended. Start a renewal.",
        409,
      );
    }
    // Upgrades only raise the current period ceiling; consumption is never reset.
    sub.planId = c.planId;
    sub.allowance = plan.replies;
    sub.status = "active";
    sub.cancelAtPeriodEnd = false;
    delete sub.pendingPlanId;
    c.receipt = `SIM-${c.id.slice(0, 8).toUpperCase()}`;
  }
  c.status = input.result;
  c.eventIds.push(input.eventId);
  event(
    s,
    `checkout.${c.status}`,
    `Simulation only: ${c.planId}, ${c.amountMinor} minor BDT units.`,
    now,
  );
  return c;
}
export function reserveReply(
  s: BusinessState,
  responseId: string,
  now: Date | string = new Date(),
) {
  const existing = s.billing.reservations.find(
    (r) => r.responseId === responseId,
  );
  if (existing) {
    invariant(
      existing.businessId === s.business.id,
      "TENANT_MISMATCH",
      "Usage belongs to another business.",
      403,
    );
    return existing;
  }
  reconcileSubscription(s, now);
  const sub = s.billing.subscription;
  let usage = s.billing.usage.find((u) => u.periodId === sub.periodId);
  if (!usage) {
    usage = { periodId: sub.periodId, used: 0, reserved: 0 };
    s.billing.usage.push(usage);
  }
  invariant(
    usage.used + usage.reserved < sub.allowance,
    "QUOTA_EXHAUSTED",
    "Your AI reply allowance is used. The team can still reply manually.",
    429,
  );
  const r = {
    id: randomUUID(),
    businessId: s.business.id,
    responseId,
    periodId: sub.periodId,
    status: "reserved" as const,
    createdAt: stamp(now),
    updatedAt: stamp(now),
  };
  s.billing.reservations.push(r);
  usage.reserved++;
  return r;
}
export function finalizeReply(
  s: BusinessState,
  responseId: string,
  now: Date | string = new Date(),
) {
  const r = s.billing.reservations.find((r) => r.responseId === responseId);
  invariant(
    r,
    "RESERVATION_MISSING",
    "Usage must be reserved before delivery.",
    409,
  );
  if (r.status === "committed" || r.status === "reversed") return r;
  invariant(
    r.status === "reserved",
    "RESERVATION_RELEASED",
    "Released usage cannot be charged.",
    409,
  );
  const usage = s.billing.usage.find((u) => u.periodId === r.periodId)!;
  usage.reserved--;
  usage.used++;
  r.status = "committed";
  r.updatedAt = stamp(now);
  return r;
}
export function releaseReply(
  s: BusinessState,
  responseId: string,
  now: Date | string = new Date(),
) {
  const r = s.billing.reservations.find((r) => r.responseId === responseId);
  if (r?.status === "reserved") {
    s.billing.usage.find((u) => u.periodId === r.periodId)!.reserved--;
    r.status = "released";
    r.updatedAt = stamp(now);
  }
  return r;
}
export function reverseReply(
  s: BusinessState,
  responseId: string,
  now: Date | string = new Date(),
) {
  const r = s.billing.reservations.find((r) => r.responseId === responseId);
  if (r?.status === "committed") {
    s.billing.usage.find((u) => u.periodId === r.periodId)!.used--;
    r.status = "reversed";
    r.updatedAt = stamp(now);
  }
  return r;
}
export function releaseAbandonedReservations(
  s: BusinessState,
  now: Date | string = new Date(),
  olderThanMs = 30 * 60000,
) {
  for (const r of s.billing.reservations)
    if (
      r.status === "reserved" &&
      new Date(r.updatedAt).getTime() < new Date(now).getTime() - olderThanMs
    )
      releaseReply(s, r.responseId, now);
}
