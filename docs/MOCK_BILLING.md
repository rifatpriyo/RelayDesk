# Simulated billing and usage

This release has one explicit provider: `BILLING_PROVIDER=mock`. Every checkout, outcome and receipt is simulated. No money is charged, no bank/card/mobile-wallet credentials are collected, and receipts are not tax invoices. The browser cannot switch the server’s payment mode. SSLCOMMERZ is a future adapter; no SDK, network call, key or merchant account is required now.

## Server-owned plans

`src/lib/core/plans.ts` is authoritative. Prices are integer minor BDT units, independent of catalog currency. Free includes 200 replies, Starter 2,000 and Growth 10,000 per period; the mock monthly prices are respectively ৳0, ৳990 and ৳2,990. These are illustrative product decisions, not verified commercial offers. Scale is operator-defined and not purchasable through this release. Catalog/source/seat/storage limits are enforced server-side rather than trusted from UI controls.

An owner or admin creates an attempt. The server snapshots the business, subscription/period, plan, amount, currency, provider/mode and a 30-minute expiry. Supplying a different business, plan, amount or currency in an outcome does not change this snapshot. Agents cannot create attempts or apply results. The visible simulated method choice has no financial effect and collects no payment details.

## Attempt states

| State       | Effect                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| `pending`   | No entitlement change; may remain pending or become one terminal state. |
| `succeeded` | Validated transactional entitlement grant; labeled simulated receipt.   |
| `failed`    | No grant. Start a new attempt to retry.                                 |
| `cancelled` | No grant. Start a new attempt to retry.                                 |
| `expired`   | No grant. The server enforces expiry even if the UI submits success.    |

An event ID is recorded once. Replaying the same outcome is idempotent; reusing an event against another checkout or trying to change a terminal result fails. Concurrent attempts are serialized by the aggregate transaction: a second success for an already-active plan cannot reset consumption or create another allowance. If the subscription period has changed since checkout creation, the stale attempt cannot grant credits.

## Upgrades, renewal and cancellation

An upgrade increases the current period’s allowance ceiling. It does not reset used or reserved replies and does not add a second full allowance. Upgrades do not extend the current period. Only a higher plan is an upgrade.

Renewal is an explicit simulated checkout available when the current period has ended. A successful renewal starts a new monthly period and usage ledger. There is no automatic recurring payment or early/future-paid renewal in this release. If a scheduler or reply reservation reconciles an expired period first, the business starts a new Free period; the owner can then select a paid mock plan as a normal upgrade.

Cancellation preserves current allowances until expiry, then the unrenewed business returns to Free. A scheduled downgrade records the preferred lower plan without changing the current period. At expiry it also returns to Free unless a new successful mock renewal is recorded. The preferred next plan remains stored across expiry and is cleared by a successful checkout. A paid lower-plan selection alone never grants another paid period. This distinction must remain visible in billing UI.

Existing catalog, members and approved knowledge are not automatically deleted when limits decrease. New actions exceeding the active plan are rejected. Social automation eligibility and reply quota are checked at send time. Staff can still handle conversations when the AI allowance is exhausted.

## Reply accounting

One logical customer reply gets one stable response ID and one reservation. A retry finds the same reservation instead of adding another. Reservations belong to the period in which they were created, so completion after a period change affects the original ledger.

- Reserve before expensive reply work and final send preparation.
- Commit once the delivery policy records an accepted logical reply.
- Release before acceptance when generation/send preparation fails or the reply is cancelled.
- Reverse a committed charge when verified eventual failure warrants adjustment.
- Keep ambiguous sends explicit; do not resend just because the provider timed out.

Split text bubbles and an associated approved image are delivery pieces of the same response, not extra billable replies. Staff messages and playground tests do not consume customer-reply quota. Live model calls may still incur actual provider cost even when delivery fails; that accounting is separate.

## Real-inference spending is independent

Mock success cannot edit operator environment variables or cost ceilings. Real DeepSeek requests require explicit enablement, configured model/rates and independent global, business, playground and import budgets. Cost reservations happen before inference; reported usage settles them when available. Uncertain provider outcomes retain conservative spend accounting. Raising a simulated plan allowance does not bypass these bounds. Model/provider fees and Meta messaging costs are separate from this simulation.

## Future real-payment seam

Keep attempt creation, price snapshots, ledger transactions and entitlement commands separate from payment transport. A future adapter must verify server-to-server provider signatures, reconcile amount/currency/business ownership, map external transaction IDs to attempts, and persist idempotent events before invoking the entitlement transition. It must handle refunds/disputes and real invoice/legal requirements explicitly. Do not reuse a browser-selected success result as proof of real payment.

Tests cover tampering, terminal states, expiry, concurrency, replay, period changes, reservations, upgrades and cancellation. These tests establish simulation behavior only. See [Build status](BUILD_STATUS.md) for executed results and [Security](SECURITY.md) for operational boundaries.
