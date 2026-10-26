"use client";
import { useState } from "react";
import {
  Check,
  ArrowRight,
  Receipt,
  ShieldCheck,
  DownloadSimple,
  WarningCircle,
  Wallet,
} from "@phosphor-icons/react";
import { Badge, Dialog, money, dateTime } from "@/components/ui";
import { Heading } from "./business-panels";
import { useWorkspace } from "./provider";
import { BusinessSwitcher, WorkspaceFiles } from "./settings-extras";
import type { Checkout, PlanId } from "@/lib/core/types";

export function Billing() {
  const { workspace: s, plans, command, busy, notify, actor } = useWorkspace(),
    [checkoutId, setCheckoutId] = useState<string | null>(null),
    [cancel, setCancel] = useState(false),
    [method, setMethod] = useState("Demo wallet");
  const sub = s.billing.subscription,
    usage = s.billing.usage.find((u) => u.periodId === sub.periodId),
    used = usage?.used || 0,
    checkout = s.billing.checkouts.find((c) => c.id === checkoutId);
  const allowed = actor.role !== "agent";
  const periodEnded = new Date(sub.periodEnd).getTime() <= Date.now();
  const renewalPlan = sub.pendingPlanId || sub.planId;
  async function choose(
    planId: PlanId,
    purpose: "upgrade" | "renewal" = "upgrade",
  ) {
    try {
      const c = (await command("billing.checkout", {
        planId,
        purpose,
      })) as Checkout;
      setCheckoutId(c.id);
    } catch {}
  }
  async function outcome(result: string) {
    if (!checkout) return;
    try {
      await command("billing.result", {
        checkoutId: checkout.id,
        eventId: crypto.randomUUID(),
        result,
      });
      notify(
        result === "succeeded"
          ? "Simulated checkout completed. No money was charged."
          : `Simulated result saved: ${result}.`,
      );
    } catch {}
  }
  return (
    <>
      <Heading
        title="Room for your next chapter."
        description="See your actual reply usage and explore simulated plans."
      />
      <div className="notice warning">
        <Wallet size={20} />
        <p>
          <strong>Simulation only. No money will be charged.</strong> Demo
          pricing is illustrative. These plans grant test entitlements, not paid
          revenue. Real AI spend stays under separate operator limits.
        </p>
      </div>
      <section className="panel panel-pad" style={{ marginBottom: 25 }}>
        <div className="page-heading" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ marginBottom: 8 }}>
              {plans.find((p) => p.id === sub.planId)?.name} plan
            </h2>
            <p>
              {dateTime(sub.periodStart, s.business.timezone)} to{" "}
              {dateTime(sub.periodEnd, s.business.timezone)}
            </p>
          </div>
          <Badge tone="neutral">Mock billing</Badge>
        </div>
        <div style={{ fontSize: 27, letterSpacing: "-.04em" }}>
          {used.toLocaleString()}{" "}
          <span
            style={{ fontSize: 13, color: "var(--muted)", letterSpacing: 0 }}
          >
            of {sub.allowance.toLocaleString()} replies used
          </span>
        </div>
        <div className="usage-line">
          <span
            style={{ width: `${Math.min(100, (used / sub.allowance) * 100)}%` }}
          />
        </div>
        <div className="usage-caption">
          <span>{usage?.reserved || 0} replies reserved in processing</span>
          <span>
            {Math.max(
              0,
              sub.allowance - used - (usage?.reserved || 0),
            ).toLocaleString()}{" "}
            remaining
          </span>
        </div>
        {used / sub.allowance >= 0.8 && (
          <div
            className="notice warning"
            style={{ marginTop: 20, marginBottom: 0 }}
          >
            {used >= sub.allowance
              ? "Your allowance is used. Your team can still reply manually."
              : "You have used at least 80% of your allowance."}
          </div>
        )}
        {sub.cancelAtPeriodEnd && (
          <div className="notice" style={{ marginTop: 15, marginBottom: 0 }}>
            Current allowances remain until period end. Free starts then unless
            you complete a new simulated checkout. Your selected next plan is{" "}
            {sub.pendingPlanId || "free"}.
          </div>
        )}
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button
            className="button secondary small"
            disabled={
              busy || !allowed || !periodEnded || renewalPlan === "free"
            }
            onClick={() => choose(renewalPlan, "renewal")}
          >
            Simulate renewal
          </button>
          {sub.planId === "free" &&
            sub.pendingPlanId &&
            sub.pendingPlanId !== "free" && (
              <button
                className="button secondary small"
                disabled={busy || !allowed}
                onClick={() => choose(sub.pendingPlanId!)}
              >
                Start selected {sub.pendingPlanId} plan
              </button>
            )}
          <button
            className="button ghost small"
            disabled={
              busy || !allowed || sub.planId === "free" || sub.cancelAtPeriodEnd
            }
            onClick={() => setCancel(true)}
          >
            Cancel at period end
          </button>
        </div>
        <p className="small-text muted" style={{ marginBottom: 0 }}>
          No automatic renewal. Simulated renewal is available after this period
          ends; each paid plan requires a successful mock checkout.
        </p>
      </section>
      <div className="plan-grid">
        {plans
          .filter((p) => p.id !== "scale")
          .map((p) => (
            <section
              className={`panel plan ${p.id === sub.planId ? "current" : ""}`}
              key={p.id}
            >
              <h3>
                {p.name}
                {p.id === sub.planId && (
                  <span style={{ marginLeft: 10 }}>
                    <Badge>Current plan</Badge>
                  </span>
                )}
              </h3>
              <div className="plan-price">
                {money(p.priceMinor || 0)}
                <small> / month</small>
              </div>
              <p className="small-text">Demo pricing · no real payment</p>
              <ul>
                <li>
                  <Check size={14} />
                  {p.replies.toLocaleString()} AI replies per month
                </li>
                <li>
                  <Check size={14} />
                  {p.catalog.toLocaleString()} catalog items
                </li>
                <li>
                  <Check size={14} />
                  {p.seats} team seats
                </li>
                <li>
                  <Check size={14} />
                  {p.id === "free"
                    ? "Website chat + channel setup"
                    : "Website + three social channels"}
                </li>
                <li>
                  <Check size={14} />
                  {p.sources} data sources
                </li>
              </ul>
              <button
                className={`button ${p.id !== sub.planId ? "secondary" : ""}`}
                disabled={busy || !allowed || p.id === sub.planId}
                onClick={async () => {
                  if (p.replies < sub.allowance) {
                    try {
                      await command("billing.downgrade", { planId: p.id });
                      notify(
                        "Next plan selected. Current allowances remain until period end; a paid plan requires a new simulated checkout.",
                      );
                    } catch {}
                  } else await choose(p.id);
                }}
              >
                {p.id === sub.planId
                  ? "Your current plan"
                  : p.replies < sub.allowance
                    ? "Schedule downgrade"
                    : "Try simulated plan"}
                {p.id !== sub.planId && <ArrowRight size={15} />}
              </button>
            </section>
          ))}
      </div>
      <p className="small-text muted" style={{ marginTop: 20 }}>
        Scale is operator configured and is not offered for purchase.
        Meta/provider charges are separate and are unknown until configured.
      </p>
      <section className="panel" style={{ marginTop: 27 }}>
        <div className="panel-head">
          <h2>Simulated checkout history</h2>
          <Receipt size={20} />
        </div>
        {s.billing.checkouts.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...s.billing.checkouts].reverse().map((c) => (
                  <tr key={c.id}>
                    <td>
                      {plans.find((p) => p.id === c.planId)?.name}
                      <span className="sub">Simulation only</span>
                    </td>
                    <td>{money(c.amountMinor)}</td>
                    <td>
                      <Badge
                        tone={
                          c.status === "succeeded"
                            ? ""
                            : c.status === "pending"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td>{dateTime(c.createdAt, s.business.timezone)}</td>
                    <td>
                      <button
                        className="button ghost small"
                        onClick={() => setCheckoutId(c.id)}
                      >
                        View receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small-text muted" style={{ padding: "8px 23px 20px" }}>
            No simulated checkouts yet. Your free allowance is ready to use.
          </p>
        )}
      </section>
      <Dialog
        open={!!checkoutId}
        onOpenChange={(v) => !v && setCheckoutId(null)}
        title={
          checkout?.status === "succeeded"
            ? "Your simulated receipt"
            : "RelayDesk mock checkout"
        }
        description="Simulation only. No money will be charged. Do not enter financial details, account numbers, PINs, or payment references."
      >
        {checkout && (
          <>
            <div className="receipt">
              <Badge tone="warning">SIMULATED · NOT A TAX INVOICE</Badge>
              <dl>
                <dt>Business</dt>
                <dd>{s.business.name}</dd>
                <dt>Plan</dt>
                <dd>{plans.find((p) => p.id === checkout.planId)?.name}</dd>
                <dt>Amount</dt>
                <dd>{money(checkout.amountMinor)}</dd>
                <dt>Provider / mode</dt>
                <dd>mock / mock</dd>
                <dt>Status</dt>
                <dd>{checkout.status}</dd>
                <dt>Attempt</dt>
                <dd className="monospace" style={{ fontSize: 9 }}>
                  {checkout.id}
                </dd>
              </dl>
              {checkout.receipt && (
                <p className="small-text">Receipt: {checkout.receipt}</p>
              )}
            </div>
            {checkout.status === "pending" ? (
              <>
                <label className="label" style={{ marginTop: 20 }}>
                  Simulated method
                  <select
                    className="input"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {["Demo wallet", "Demo card", "Demo bank"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <small>
                    For demonstration only. No payment details are collected.
                  </small>
                </label>
                <div
                  className="form-actions"
                  style={{ justifyContent: "flex-start", marginTop: 16 }}
                >
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => outcome("succeeded")}
                  >
                    Simulate success
                    <Check size={15} />
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => outcome("failed")}
                  >
                    Simulate failure
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => outcome("pending")}
                  >
                    Keep pending
                  </button>
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => outcome("cancelled")}
                  >
                    Cancel attempt
                  </button>
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => outcome("expired")}
                  >
                    Simulate expiry
                  </button>
                </div>
              </>
            ) : (
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setCheckoutId(null)}
                >
                  Close
                </button>
                {checkout.status !== "succeeded" && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => choose(checkout.planId, checkout.purpose)}
                  >
                    Create new attempt
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Dialog>
      <Dialog
        open={cancel}
        onOpenChange={setCancel}
        title="Schedule cancellation?"
        description="Your current allowance remains available until period end. The business then returns to Free. This cancels a simulated subscription only."
      >
        <div className="form-actions">
          <button className="button secondary" onClick={() => setCancel(false)}>
            Keep plan
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              try {
                await command("billing.cancel");
                setCancel(false);
                notify("Cancellation scheduled for period end.");
              } catch {}
            }}
          >
            Cancel at period end
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function Settings() {
  const {
      workspace: s,
      command,
      request,
      busy,
      notify,
      actor,
    } = useWorkspace(),
    [deleting, setDeleting] = useState(false),
    [addingMember, setAddingMember] = useState(false),
    [removingMember, setRemovingMember] = useState<{
      userId: string;
      name: string;
    } | null>(null),
    [confirmation, setConfirmation] = useState("");
  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await command("team.add", {
        email: data.get("email"),
        role: data.get("role"),
      });
      setAddingMember(false);
      notify(
        "Team member added. They can access this business after signing in.",
      );
    } catch {}
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("business.save", {
        business: {
          name: f.get("name"),
          timezone: f.get("timezone"),
          dashboardLanguage: f.get("dashboardLanguage"),
          currency: f.get("currency") || s.business.currency,
          retentionDays: Number(f.get("retentionDays")),
          allowedWidgetOrigins: s.business.allowedWidgetOrigins,
        },
      });
      notify("Business settings saved.");
    } catch {}
  }
  async function exportData() {
    try {
      const result = await command("data.export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "relaydesk-business-export.json";
      a.click();
      URL.revokeObjectURL(url);
      notify("Your business export is ready.");
    } catch {}
  }
  return (
    <>
      <Heading
        title="Your business, your way."
        description="Manage the details, people, and boundaries of your workspace."
      />
      <BusinessSwitcher />
      <div className="two-col">
        <form className="panel panel-pad form-stack" onSubmit={save}>
          <h2>Business profile</h2>
          <label className="label">
            Business name
            <input
              className="input"
              name="name"
              defaultValue={s.business.name}
              required
              maxLength={100}
            />
          </label>
          <div className="field-grid">
            <label className="label">
              Timezone
              <input
                className="input"
                name="timezone"
                defaultValue={s.business.timezone}
                required
                list="timezones"
              />
              <datalist id="timezones">
                <option>Asia/Dhaka</option>
                <option>Asia/Kolkata</option>
                <option>UTC</option>
                <option>Europe/London</option>
              </datalist>
            </label>
            <label className="label">
              Dashboard language
              <select
                className="input"
                name="dashboardLanguage"
                defaultValue={s.business.dashboardLanguage}
              >
                <option value="en">English</option>
                <option value="bn">বাংলা</option>
              </select>
            </label>
            <label className="label">
              Currency
              <select
                className="input"
                name="currency"
                defaultValue={s.business.currency}
                disabled={s.catalog.length > 0}
              >
                <option value="BDT">BDT · Bangladeshi Taka</option>
                <option value="USD">USD · US Dollar</option>
                <option value="EUR">EUR · Euro</option>
                <option value="GBP">GBP · Pound Sterling</option>
                <option value="INR">INR · Indian Rupee</option>
              </select>
              <small>
                {s.catalog.length
                  ? "Currency is fixed while catalog records exist. Prices are never converted automatically."
                  : "Choose before adding your first item. Simulated subscription prices remain in BDT."}
              </small>
            </label>
            <label className="label">
              Conversation retention (days)
              <input
                className="input"
                name="retentionDays"
                type="number"
                min={7}
                max={3650}
                defaultValue={s.business.retentionDays}
                required
              />
              <small>Applied by the configured retention job.</small>
            </label>
          </div>
          <div className="form-actions">
            <button
              className="button"
              disabled={busy || actor.role === "agent"}
            >
              Save changes
            </button>
          </div>
        </form>
        <aside className="stack" style={{ alignContent: "start" }}>
          <section className="panel panel-pad">
            <ShieldCheck
              size={29}
              color="#628a59"
              style={{ marginBottom: 16 }}
            />
            <h3>A workspace with boundaries.</h3>
            <p className="small-text">
              Your business knowledge, conversations, and credentials are scoped
              to this business. Owner, admin, and agent roles have different
              permissions.
            </p>
            <p className="small-text">
              Dashboard language is separate from the languages your assistant
              uses with customers.
            </p>
          </section>
          <section className="panel panel-pad">
            <h3>Export your business data</h3>
            <p className="small-text">
              Download catalog, approved knowledge, conversations, and settings.
              Credentials and private access tokens are excluded.
            </p>
            <button
              className="button secondary"
              disabled={busy || actor.role === "agent"}
              onClick={exportData}
            >
              <DownloadSimple size={16} />
              Export data
            </button>
          </section>
        </aside>
      </div>
      <section className="panel" style={{ marginTop: 25 }}>
        <div className="panel-head">
          <div>
            <h2>Your team</h2>
            <p>
              Roles apply to this business only. Platform administration is
              separate.
            </p>
          </div>
          <button
            className="button secondary small"
            disabled={busy || actor.role !== "owner"}
            onClick={() => setAddingMember(true)}
          >
            Add member
          </button>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.userId}>
                  <td>{m.name}</td>
                  <td>{m.email || "Managed by authentication"}</td>
                  <td>
                    {m.role === "owner" || actor.role !== "owner" ? (
                      <Badge tone="neutral">{m.role}</Badge>
                    ) : (
                      <select
                        aria-label={`Role for ${m.name}`}
                        className="input"
                        style={{
                          minHeight: 35,
                          maxWidth: 160,
                          fontSize: 12,
                          padding: "5px 9px",
                        }}
                        value={m.role}
                        disabled={busy}
                        onChange={async (e) => {
                          try {
                            await command("team.role", {
                              userId: m.userId,
                              role: e.target.value,
                            });
                            notify("Team role updated.");
                          } catch {}
                        }}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {m.role !== "owner" && actor.role === "owner" && (
                      <button
                        className="button ghost small"
                        disabled={busy}
                        onClick={() =>
                          setRemovingMember({ userId: m.userId, name: m.name })
                        }
                        aria-label={`Remove ${m.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className="small-text muted"
          style={{ padding: "16px 22px", margin: 0 }}
        >
          Add someone who has already signed up and verified their email. Each
          member counts toward your plan’s seat allowance.{" "}
          {actor.demo &&
            "Use an address ending in @example.test for this isolated demo."}
        </p>
      </section>
      <Dialog
        open={addingMember}
        onOpenChange={setAddingMember}
        title="Add a team member"
        description="Use the email of an existing verified account. Adding a member grants access to this business; no invitation email is sent."
      >
        <form className="form-stack" onSubmit={addMember}>
          <label className="label">
            Member email
            <input
              className="input"
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder={
                actor.demo
                  ? "teammate@example.test"
                  : "teammate@yourbusiness.com"
              }
            />
          </label>
          <label className="label">
            Member role
            <select className="input" name="role" defaultValue="agent">
              <option value="agent">Agent · conversations and handover</option>
              <option value="admin">Admin · business configuration</option>
            </select>
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setAddingMember(false)}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              Add member
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!removingMember}
        onOpenChange={(open) => !open && setRemovingMember(null)}
        title={`Remove ${removingMember?.name || "team member"}?`}
        description="Their access to this business will end immediately. Their account and access to other businesses remain available."
      >
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setRemovingMember(null)}
          >
            Keep member
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (!removingMember) return;
              try {
                await command("team.remove", { userId: removingMember.userId });
                setRemovingMember(null);
                notify("Team member removed.");
              } catch {}
            }}
          >
            Remove member
          </button>
        </div>
      </Dialog>
      <section className="panel" style={{ marginTop: 25 }}>
        <div className="panel-head">
          <h2>Recent workspace activity</h2>
        </div>
        {s.audit.length ? (
          [...s.audit]
            .reverse()
            .slice(0, 10)
            .map((a) => (
              <div key={a.id} className="row-item">
                <div className="grow">
                  <h3>{a.action.replaceAll(".", " / ")}</h3>
                  <p>
                    {dateTime(a.at, s.business.timezone)} ·{" "}
                    {a.actorId === actor.userId ? "You" : "Workspace member"}
                  </p>
                </div>
              </div>
            ))
        ) : (
          <p className="small-text muted" style={{ padding: "0 22px 20px" }}>
            Changes to your workspace will appear here.
          </p>
        )}
      </section>
      <WorkspaceFiles />
      <section
        className="panel panel-pad"
        style={{ marginTop: 25, borderColor: "#e8cfc6" }}
      >
        <h3>Delete this business</h3>
        <p className="small-text">
          Permanently remove this workspace’s active catalog, knowledge,
          customer data, and credentials. Provider-side records and database
          backups follow their own retention schedules.
        </p>
        <button
          className="button danger"
          disabled={actor.role !== "owner"}
          onClick={() => setDeleting(true)}
        >
          Delete business
        </button>
      </section>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this business permanently?"
        description="This stops future integrations and removes active workspace data. Backups and provider-held records are subject to their separate retention policies."
      >
        <label className="label">
          Type {s.business.name} to confirm
          <input
            className="input"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDeleting(false)}
          >
            Keep business
          </button>
          <button
            className="button danger"
            disabled={busy || confirmation !== s.business.name}
            onClick={async () => {
              try {
                await command("business.delete", { confirmation });
                await request("/api/auth/logout", {});
                location.href = "/";
              } catch {}
            }}
          >
            Permanently delete
          </button>
        </div>
      </Dialog>
    </>
  );
}
