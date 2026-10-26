"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChatsCircle,
  Leaf,
  ArrowRight,
  ArrowUpRight,
  WarningCircle,
  ChatCenteredText,
  Lightning,
  CalendarBlank,
  MagnifyingGlass,
  PaperPlaneTilt,
  UserSwitch,
  Robot,
  ArrowLeft,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  Avatar,
  Badge,
  ChannelIcon,
  ChannelLabel,
  Empty,
  dateTime,
} from "@/components/ui";
import { useWorkspace } from "./provider";
import { dictionary } from "@/lib/i18n";

export function Overview() {
  const { workspace: s } = useWorkspace(),
    t = dictionary[s.business.dashboardLanguage],
    usage = s.billing.usage.find(
      (u) => u.periodId === s.billing.subscription.periodId,
    ),
    used = usage?.used || 0;
  const pending = s.conversations.filter((c) => c.status === "handover").length,
    live = s.channels.filter((c) => c.status === "connected").length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t.greeting}</h1>
          <p>{t.subtitle}</p>
        </div>
        <Link className="button secondary" href="/workspace/playground">
          <FlaskIcon />
          Test assistant
        </Link>
      </div>
      {s.business.onboardingStep < 7 && (
        <div className="notice">
          <Leaf size={19} />
          <p>
            <strong>Your assistant is taking shape.</strong> Finish setting up
            your business to make it yours.
          </p>
          <Link className="button ghost small" href="/workspace/onboarding">
            Continue setup
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <section className="stats" aria-label="Business overview">
        <Stat
          label="Conversations"
          value={s.conversations.length}
          note="Across all your channels"
          icon={<ChatsCircle size={20} />}
        />
        <Stat
          label="AI replies this period"
          value={used}
          note={`${s.billing.subscription.allowance.toLocaleString()} replies in your allowance`}
          icon={<Leaf size={20} />}
        />
        <Stat
          label="Waiting for your team"
          value={pending}
          note={
            pending
              ? "A human touch makes the difference"
              : "You’re all caught up"
          }
          icon={<UserSwitch size={20} />}
        />
        <Stat
          label="Active connections"
          value={`${live} / 4`}
          note={
            s.channels.some((c) => c.simulated)
              ? "Demo connections are simulated"
              : "Checked by each provider"
          }
          icon={<Lightning size={20} />}
        />
      </section>
      <div className="two-col">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Recent conversations</h2>
                <p>A little attention goes a long way.</p>
              </div>
              <Link href="/workspace/inbox">
                View inbox
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {s.conversations.slice(0, 5).map((c, i) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          className="customer-cell"
                          href={`/workspace/inbox?conversation=${c.id}`}
                        >
                          <Avatar name={c.customerName} index={i} />
                          <span>
                            {c.customerName}
                            <span className="sub">
                              {c.messages.at(-1)?.text.slice(0, 37)}…
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <ChannelLabel kind={c.channel} />
                      </td>
                      <td>
                        <Badge
                          tone={
                            c.status === "handover"
                              ? "warning"
                              : c.status === "manual"
                                ? "neutral"
                                : ""
                          }
                        >
                          {c.status === "handover"
                            ? "Needs your team"
                            : c.status === "manual"
                              ? "With your team"
                              : "Assistant active"}
                        </Badge>
                      </td>
                      <td>
                        <Link
                          href={`/workspace/inbox?conversation=${c.id}`}
                          aria-label={`Open conversation with ${c.customerName}`}
                        >
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!s.conversations.length && (
                <Empty
                  title="Your conversations live here"
                  description="Connect a channel when you’re ready. You can test the assistant first."
                />
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Your business knowledge</h2>
              <Link href="/workspace/knowledge">
                Manage knowledge
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="row-item">
              <div className="channel-icon">
                <ChatCenteredText size={19} />
              </div>
              <div className="grow">
                <h3>
                  {s.knowledge.filter((k) => k.status === "published").length}{" "}
                  approved answers
                </h3>
                <p>
                  {s.knowledge.filter((k) => k.status === "draft").length}{" "}
                  suggestions waiting for your review
                </p>
              </div>
              <Badge>Ready to use</Badge>
            </div>
            {s.sources.slice(0, 2).map((source) => (
              <div className="row-item" key={source.id}>
                <div className="channel-icon">
                  <CheckCircle size={19} />
                </div>
                <div className="grow">
                  <h3>{source.name}</h3>
                  <p>
                    {source.rowCount} records ·{" "}
                    {source.lastSyncAt
                      ? dateTime(source.lastSyncAt, s.business.timezone)
                      : "Not synchronized yet"}
                  </p>
                </div>
                <Badge tone={source.status === "error" ? "error" : "neutral"}>
                  {source.status === "ready" ? "Up to date" : source.status}
                </Badge>
              </div>
            ))}
          </section>
        </div>
        <aside className="stack">
          <section className="welcome-card">
            <h2>A voice that feels like you.</h2>
            <p>
              Try a question, check the facts, and give your assistant a little
              personality.
            </p>
            <Link
              href="/workspace/playground"
              className="button secondary small"
            >
              Test your assistant
              <ArrowRight size={14} />
            </Link>
            <Leaf className="leaf-art" weight="duotone" />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Your channels</h2>
              <Link href="/workspace/channels">
                Manage
                <ArrowUpRight size={14} />
              </Link>
            </div>
            {s.channels.map((c) => (
              <div className="row-item" key={c.id}>
                <div className="channel-icon">
                  <ChannelIcon kind={c.kind} size={20} />
                </div>
                <div className="grow">
                  <h3>{c.label}</h3>
                  <p>
                    {c.simulated && c.status === "connected"
                      ? "Simulated connection"
                      : c.status.replaceAll("_", " ")}
                  </p>
                </div>
                <span
                  className={`badge ${c.status === "connected" ? "" : "neutral"}`}
                >
                  {c.automationEnabled ? "On" : "Paused"}
                </span>
              </div>
            ))}
          </section>
          <section className="panel panel-pad">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <strong style={{ fontWeight: 500 }}>Room to grow</strong>
              <Badge tone="neutral">{s.billing.subscription.planId}</Badge>
            </div>
            <div className="usage-line">
              <span
                style={{
                  width: `${Math.min(100, (used / s.billing.subscription.allowance) * 100)}%`,
                }}
              />
            </div>
            <div className="usage-caption">
              <span>{used.toLocaleString()} replies used</span>
              <span>
                {s.billing.subscription.allowance.toLocaleString()} included
              </span>
            </div>
            <Link
              className="text-link small-text"
              style={{ display: "inline-block", marginTop: 18 }}
              href="/workspace/billing"
            >
              View plans & usage
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
function FlaskIcon() {
  return <ChatCenteredText size={16} />;
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  );
}

export function Inbox() {
  const {
      workspace: s,
      command,
      request,
      refresh,
      busy,
      notify,
      actor,
    } = useWorkspace(),
    [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("conversation");
    if (id) setSelected(id);
  }, []);
  const conversations = s.conversations.filter(
    (c) =>
      (filter === "all" ||
        (filter === "handover"
          ? c.status === "handover"
          : c.channel === filter)) &&
      (c.customerName + " " + c.messages.map((m) => m.text).join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const active =
    s.conversations.find((c) => c.id === selected) ||
    (!selected && typeof window !== "undefined" && window.innerWidth >= 768
      ? conversations[0]
      : undefined);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [active?.messages.length, active?.id]);
  async function change(action: string) {
    if (!active) return;
    try {
      await command(action, { id: active.id });
      notify(
        action.endsWith("takeover")
          ? "The conversation is yours. Queued assistant replies are stopped."
          : "Assistant resumed.",
      );
    } catch {}
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !active) return;
    try {
      if (actor.demo || active.channel === "website")
        await command("conversation.reply", { id: active.id, text });
      else
        await request("/api/integrations/channels", {
          action: "reply",
          conversationId: active.id,
          text,
        });
      setText("");
      await refresh();
    } catch {}
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Every conversation, together.</h1>
          <p>Help customers feel heard, wherever they say hello.</p>
        </div>
        <Badge tone="neutral">{s.conversations.length} conversations</Badge>
      </div>
      <div className="toolbar">
        <div className="tabs" aria-label="Filter conversations">
          {[
            ["all", "All conversations"],
            ["handover", "Needs your team"],
            ["messenger", "Messenger"],
            ["instagram", "Instagram"],
            ["whatsapp", "WhatsApp"],
            ["website", "Website"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`tab ${filter === id ? "active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`panel inbox ${selected ? "selected" : ""}`}>
        <aside className="conversation-list">
          <div className="search-input">
            <MagnifyingGlass size={16} />
            <input
              className="input"
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {conversations.map((c, i) => (
            <button
              className={`conversation-item ${active?.id === c.id ? "active" : ""}`}
              key={c.id}
              onClick={() => setSelected(c.id)}
            >
              <Avatar name={c.customerName} index={i} />
              <div>
                <h3>
                  {c.customerName}
                  {c.unread && (
                    <span className="small-text" aria-label="Unread">
                      {" "}
                      •
                    </span>
                  )}
                </h3>
                <p>{c.messages.at(-1)?.text}</p>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <ChannelIcon kind={c.channel} size={13} />
                  <Badge tone={c.status === "handover" ? "warning" : "neutral"}>
                    {c.status === "handover"
                      ? "Needs your team"
                      : c.status === "manual"
                        ? "Staff replying"
                        : "Assistant active"}
                  </Badge>
                </span>
              </div>
            </button>
          ))}
          {!conversations.length && (
            <Empty
              title="No conversations yet"
              description="Try another filter, or connect a channel."
            />
          )}
        </aside>
        <section className="conversation-main">
          {active ? (
            <>
              <header className="conversation-header">
                <button
                  className="icon-button chat-back"
                  aria-label="Back to conversations"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={active.customerName} />
                <div>
                  <h3>{active.customerName}</h3>
                  <ChannelLabel kind={active.channel} />
                </div>
                <div className="actions">
                  <select
                    aria-label="Assign conversation"
                    className="input"
                    style={{
                      minHeight: 35,
                      fontSize: 10,
                      padding: 6,
                      maxWidth: 135,
                    }}
                    value={active.assignedTo || ""}
                    onChange={(e) => {
                      command("conversation.assign", {
                        id: active.id,
                        assignedTo: e.target.value || null,
                      }).catch(() => {});
                    }}
                  >
                    <option value="">Unassigned</option>
                    {s.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() =>
                      change(
                        active.status === "ai"
                          ? "conversation.takeover"
                          : "conversation.resume",
                      )
                    }
                  >
                    {active.status === "ai" ? (
                      <UserSwitch size={15} />
                    ) : (
                      <Robot size={15} />
                    )}{" "}
                    {active.status === "ai" ? "Take over" : "Resume assistant"}
                  </button>
                </div>
              </header>
              {active.status === "handover" && (
                <div className="notice warning" style={{ margin: 12 }}>
                  <WarningCircle size={17} />
                  {active.handoverReason ||
                    "This customer could use your help."}
                </div>
              )}
              <div className="message-list">
                {active.messages.map((m) => (
                  <article
                    className={`message ${m.role !== "customer" ? "outgoing" : ""}`}
                    key={m.id}
                  >
                    <div className="message-meta">
                      {m.role === "customer"
                        ? active.customerName
                        : m.role === "assistant"
                          ? "Business assistant"
                          : "Your team"}
                      <span>
                        {new Intl.DateTimeFormat("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: s.business.timezone,
                        }).format(new Date(m.createdAt))}
                      </span>
                    </div>
                    <div className="message-bubble">{m.text}</div>
                    {m.role !== "customer" && (
                      <div className="message-meta">
                        {m.status}
                        {actor.demo ? " · simulated conversation" : ""}
                      </div>
                    )}
                  </article>
                ))}
                <div ref={end} />
              </div>
              <form className="compose" onSubmit={send}>
                <label className="label">
                  <span className="sr-only">
                    Reply to {active.customerName}
                  </span>
                  <textarea
                    className="input"
                    placeholder={
                      active.status === "ai"
                        ? "Take over to write a personal reply."
                        : "Write a helpful reply…"
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={active.status === "ai"}
                  />
                </label>
                <div className="compose-footer">
                  <small>
                    {active.status === "ai"
                      ? "The assistant is active. Take over before replying."
                      : "Your reply is sent through the original channel."}
                  </small>
                  <button
                    className="button small"
                    disabled={busy || !text.trim() || active.status === "ai"}
                  >
                    Send reply
                    <PaperPlaneTilt size={15} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <Empty
              title="Choose a conversation"
              description="See the customer’s question, take over, or let your assistant help."
            />
          )}
        </section>
      </div>
    </>
  );
}
