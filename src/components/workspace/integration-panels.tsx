"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  UploadSimple,
  Database,
  FileCsv,
  GoogleLogo,
  ArrowClockwise,
  PaperPlaneTilt,
  Leaf,
  CheckCircle,
  Plugs,
  Code,
  Globe,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Badge,
  Dialog,
  Empty,
  ChannelIcon,
  dateTime,
  money,
} from "@/components/ui";
import { useWorkspace } from "./provider";
import { Heading } from "./business-panels";
import type {
  ImportBatch,
  ColumnMapping,
  SourceRecord,
  WidgetConfig,
} from "@/lib/integrations/types";
import type { Evidence } from "@/lib/integrations/retrieval";
import type { ChannelKind } from "@/lib/core/types";

type IntegrationSummary = {
  sources: SourceRecord[];
  imports: ImportBatch[];
  oauth: {
    attemptId: string;
    provider: string;
    candidates: { id: string; name: string }[];
  }[];
  widget?: WidgetConfig;
  jobs: {
    id: string;
    status: string;
    error?: string;
    createdAt: string;
    leaseUntil?: number;
  }[];
  outbox: {
    id: string;
    status: string;
    error?: string;
    channel: ChannelKind;
    createdAt: string;
    providerId?: string;
  }[];
  configuration: {
    demo: boolean;
    aiProvider: string;
    realInferenceEnabled: boolean;
    meta: boolean;
    instagram: boolean;
    google: boolean;
  };
};
function useIntegrations() {
  const { request } = useWorkspace();
  const [data, setData] = useState<IntegrationSummary | null>(null),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const result = await request<IntegrationSummary>("/api/integrations");
      setData(result);
      setError("");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load integrations");
      return null;
    }
  }, [request]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, reload, error };
}

export function Playground() {
  const { workspace: s, request, busy, notify } = useWorkspace();
  const [question, setQuestion] = useState(""),
    [asOf, setAsOf] = useState(""),
    [draft, setDraft] = useState(true),
    [messages, setMessages] = useState<
      {
        question: string;
        text: string;
        sources: Evidence[];
        simulated: boolean;
        model: string;
        handover: boolean;
        usage?: {
          promptTokens: number;
          completionTokens: number;
          costMicros: number;
        } | null;
      }[]
    >([]);
  async function ask(e?: React.FormEvent, sample?: string) {
    e?.preventDefault();
    const q = sample || question;
    if (!q.trim()) return;
    try {
      const result = await request<Omit<(typeof messages)[number], "question">>(
        "/api/integrations/playground",
        { question: q, draft, ...(asOf ? { asOf } : {}) },
      );
      setMessages((m) => [...m, { question: q, ...result }]);
      setQuestion("");
    } catch {}
  }
  const latest = messages.at(-1);
  return (
    <>
      <Heading
        title="A little practice goes a long way."
        description="Ask a real question. Check the answer and the information behind it."
      />
      <div className="two-col">
        <section
          className="panel"
          style={{ display: "flex", flexDirection: "column", minHeight: 570 }}
        >
          <div className="panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="channel-icon">
                <Leaf size={20} />
              </div>
              <div>
                <h2>{s.business.name} assistant</h2>
                <p>
                  {draft
                    ? "Testing your saved draft"
                    : "Testing published settings"}
                </p>
              </div>
            </div>
            <Badge tone="neutral">Private playground</Badge>
          </div>
          <div
            className="message-list"
            style={{ minHeight: 300, maxHeight: 490 }}
          >
            {messages.length ? (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", gap: 18 }}
                >
                  <article className="message outgoing">
                    <div className="message-meta">You</div>
                    <div className="message-bubble">{m.question}</div>
                  </article>
                  <article className="message">
                    <div className="message-meta">
                      <Leaf size={12} />
                      {m.simulated
                        ? "Simulated assistant"
                        : "Business assistant"}
                    </div>
                    <div className="message-bubble">{m.text}</div>
                    {m.handover && (
                      <Badge tone="warning">Would hand over to staff</Badge>
                    )}
                  </article>
                </div>
              ))
            ) : (
              <Empty
                title="Meet your business assistant"
                description="Start with a product question or ask about a policy. Your team can inspect every source used."
              />
            )}
            {busy && (
              <div
                className="skeleton"
                style={{ width: "65%", height: 55 }}
                aria-label="Preparing answer"
              />
            )}
          </div>
          <form className="compose" onSubmit={ask}>
            <label className="label">
              <span className="sr-only">Test question</span>
              <textarea
                className="input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask in English, বাংলা, or Banglish…"
                required
                maxLength={2000}
              />
            </label>
            <div className="compose-footer">
              <small>Only approved business knowledge is used.</small>
              <button
                className="button small"
                disabled={busy || !question.trim()}
              >
                Send question
                <PaperPlaneTilt size={15} />
              </button>
            </div>
          </form>
        </section>
        <aside className="stack" style={{ alignContent: "start" }}>
          <section className="panel panel-pad">
            <h3>Try a conversation</h3>
            <div className="form-stack" style={{ gap: 9 }}>
              {(s.business.kind === "retail"
                ? [
                    "Sage panjabi er price koto?",
                    "ঢাকায় ডেলিভারি চার্জ কত?",
                    "Can I speak to a person?",
                  ]
                : [
                    "How much is AC service?",
                    "Do you serve Dhanmondi?",
                    "Can you confirm an appointment?",
                  ]
              ).map((q) => (
                <button
                  key={q}
                  className="button secondary"
                  style={{
                    justifyContent: "space-between",
                    whiteSpace: "normal",
                    textAlign: "left",
                  }}
                  disabled={busy}
                  onClick={() => ask(undefined, q)}
                >
                  {q}
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </section>
          <section className="panel panel-pad">
            <h3>Test settings</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft}
                onChange={(e) => setDraft(e.target.checked)}
              />
              Use saved draft settings
            </label>
            <label className="label" style={{ marginTop: 20 }}>
              As of this date and time
              <input
                className="input"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                placeholder="2027-03-08T12:00:00+06:00"
              />
              <small>
                Optional. Tests holiday boundaries without changing the server
                clock.
              </small>
            </label>
          </section>
          <section className="panel panel-pad">
            <h3>Behind the answer</h3>
            {latest ? (
              <>
                <Badge tone={latest.simulated ? "warning" : ""}>
                  {latest.simulated ? "Deterministic demo" : latest.model}
                </Badge>
                <p className="small-text" style={{ marginTop: 14 }}>
                  {latest.sources.length} sources retrieved. Draft knowledge and
                  other businesses are excluded.
                </p>
                {latest.sources.map((source) => (
                  <div
                    key={source.id}
                    style={{
                      borderTop: "1px solid var(--line)",
                      padding: "12px 0",
                    }}
                  >
                    <strong className="small-text" style={{ fontWeight: 500 }}>
                      {source.product?.name ||
                        source.rule?.title ||
                        source.source}
                    </strong>
                    <p
                      className="small-text"
                      style={{ margin: "5px 0", fontSize: 10 }}
                    >
                      {source.kind} ·{" "}
                      {source.stale
                        ? "Freshness needs review"
                        : "Approved source"}
                    </p>
                    <p
                      className="small-text"
                      style={{ fontSize: 10, margin: 0 }}
                    >
                      {source.text.slice(0, 180)}
                    </p>
                  </div>
                ))}
                <p className="small-text">
                  {latest.usage
                    ? `${latest.usage.promptTokens} input and ${latest.usage.completionTokens} output tokens. Actual inference cost: $${(latest.usage.costMicros / 1e6).toFixed(6)}.`
                    : "No external model inference was charged for this response."}
                </p>
              </>
            ) : (
              <p className="small-text">
                After a question, see the exact catalog items, approved answers,
                and temporary changes used.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

export function Sources() {
  const {
      workspace: s,
      request,
      refresh,
      busy,
      notify,
      actor,
    } = useWorkspace(),
    { data, reload, error } = useIntegrations();
  const [kind, setKind] = useState<"catalog" | "document" | "history">(
      "catalog",
    ),
    [batch, setBatch] = useState<ImportBatch | null>(null),
    [destination, setDestination] = useState(""),
    [uploading, setUploading] = useState(false),
    [disconnecting, setDisconnecting] = useState<SourceRecord | null>(null),
    [mapping, setMapping] = useState<ColumnMapping>({}),
    [connector, setConnector] = useState<
      "google" | "mysql" | "postgresql" | null
    >(null);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set("kind", kind);
    setUploading(true);
    try {
      const file = f.get("file") as File;
      let payload: FormData | Record<string, unknown> = f;
      if (file.size > 2_000_000) {
        if (actor.demo || file.size > 20 * 1024 * 1024)
          throw new Error(
            actor.demo
              ? "The local demo supports files up to 2 MB."
              : "Choose a file smaller than 20 MB.",
          );
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        const mime = (
          {
            csv: "text/csv",
            xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            pdf: "application/pdf",
            txt: "text/plain",
            md: "text/markdown",
            json: "application/json",
          } as Record<string, string>
        )[extension];
        if (!mime) throw new Error("This file type is not supported.");
        const prepared = await request<{
          assetId: string;
          upload: {
            url: string;
            method: string;
            headers: Record<string, string>;
          };
        }>("/api/assets", {
          action: "prepare",
          name: file.name,
          mime,
          size: file.size,
        });
        const sent = await fetch(prepared.upload.url, {
          method: prepared.upload.method,
          headers: prepared.upload.headers,
          body: file,
          credentials: "omit",
        });
        if (!sent.ok)
          throw new Error("The private file upload failed. Please retry.");
        await request("/api/assets", {
          action: "complete",
          assetId: prepared.assetId,
        });
        payload = {
          action: "asset",
          assetId: prepared.assetId,
          kind,
          ...(destination && kind === "catalog"
            ? { sourceId: destination }
            : {}),
        };
      }
      const result = await request<{
        batch?: ImportBatch;
        created?: number | string[];
      }>("/api/integrations/imports", payload);
      if (result.batch) {
        setBatch(result.batch);
        setMapping(result.batch.mapping);
      } else
        notify(
          `${Array.isArray(result.created) ? result.created.length : result.created || 0} draft knowledge entries created. Review before publishing.`,
        );
      await refresh();
      await reload();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to prepare the import.",
        true,
      );
    } finally {
      setUploading(false);
    }
  }
  async function review() {
    if (!batch) return;
    try {
      const result = await request<{ batch: ImportBatch }>(
        "/api/integrations/imports",
        { action: "review", batchId: batch.id, mapping },
      );
      setBatch(result.batch);
      notify("Mapping reviewed. Check the rows below before publishing.");
    } catch {}
  }
  async function publish() {
    if (!batch) return;
    try {
      const result = await request<{ imported: number; errors: unknown[] }>(
        "/api/integrations/imports",
        { action: "publish", batchId: batch.id, retireMissing: false },
      );
      setBatch(null);
      notify(
        `${result.imported} records imported. Source details and the review history are saved.`,
      );
      await refresh();
      await reload();
    } catch {}
  }
  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      let result: { batch?: ImportBatch };
      if (connector === "google")
        result = await request<{ batch?: ImportBatch }>("/api/integrations/sources", {
          action: "google",
          name: f.get("name"),
          spreadsheetId: f.get("spreadsheetId"),
          sheetName: f.get("sheetName"),
        });
      else
        result = await request<{ batch?: ImportBatch }>("/api/integrations/sources", {
          action: "connect",
          kind: connector,
          name: f.get("name"),
          config: {
            host: f.get("host"),
            port: Number(f.get("port")),
            database: f.get("database"),
            user: f.get("user"),
            password: f.get("password"),
            schema: f.get("schema") || "public",
            table: f.get("table"),
            columns: String(f.get("columns"))
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            keyColumn: f.get("keyColumn"),
            ...(f.get("ca") ? { ca: f.get("ca") } : {}),
          },
        });
      setConnector(null);
      if (result.batch) { setBatch(result.batch); setMapping(result.batch.mapping); }
      notify("Source connected. Review its columns and records before publishing.");
      await reload();
      await refresh();
    } catch {}
  }
  return (
    <>
      <Heading
        title="Bring what you already know."
        description="Turn your files and existing tools into reviewed business knowledge."
      />
      <div className="two-col">
        <section className="panel panel-pad">
          <h2>Upload and review</h2>
          <p className="small-text">
            Start with a file. We’ll help you map the columns before anything is
            published.
          </p>
          <div className="tabs segmented" style={{ marginBottom: 20 }}>
            {(["catalog", "document", "history"] as const).map((k) => (
              <button
                key={k}
                className={`tab ${kind === k ? "active" : ""}`}
                onClick={() => setKind(k)}
              >
                {k === "catalog"
                  ? "Product catalog"
                  : k === "document"
                    ? "Document"
                    : "Past conversations"}
              </button>
            ))}
          </div>
          <form onSubmit={upload}>
            {kind === "catalog" && (
              <label className="label" style={{ marginBottom: 16 }}>
                Import destination
                <select
                  className="input"
                  name="sourceId"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  <option value="">Create a new source</option>
                  {data?.sources
                    .filter(
                      (v) =>
                        ["csv", "xlsx"].includes(v.kind) &&
                        v.status !== "disconnected",
                    )
                    .map((v) => (
                      <option value={v.id} key={v.id}>
                        Replace {v.name}
                      </option>
                    ))}
                </select>
                <small>
                  Replace an existing source to update its records without
                  duplication.
                </small>
              </label>
            )}
            <label className="dropzone">
              <UploadSimple size={32} />
              <strong>
                {kind === "catalog"
                  ? "Choose a CSV or XLSX spreadsheet"
                  : kind === "document"
                    ? "Choose a text, Markdown, or text PDF"
                    : "Choose a documented CSV, JSON, or TXT export"}
              </strong>
              <input
                type="file"
                name="file"
                required
                accept={
                  kind === "catalog"
                    ? ".csv,.xlsx"
                    : kind === "document"
                      ? ".txt,.md,.pdf"
                      : ".csv,.json,.txt"
                }
              />
              <p>
                Maximum {actor.demo ? "2" : "20"} MB. Catalogs: 2,000 rows.
                PDFs: 50 pages; scanned PDFs require OCR.
              </p>
            </label>
            <div className="form-actions">
              <a
                className="text-link small-text"
                href="/samples/catalog.csv"
                download
              >
                Download sample CSV
              </a>
              <a
                className="text-link small-text"
                href="/samples/catalog.xlsx"
                download
              >
                Sample XLSX
              </a>
              <button className="button" disabled={busy || uploading}>
                {busy || uploading ? "Preparing preview…" : "Upload for review"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </section>
        <aside className="stack" style={{ alignContent: "start" }}>
          <section className="welcome-card">
            <h2>
              Review first.
              <br />
              Reply with confidence.
            </h2>
            <p>
              Unclear prices and missing currencies are flagged. Unknown stock
              stays unknown. Past chats become private drafts for your review.
            </p>
            <Link
              href="/workspace/knowledge"
              className="button secondary small"
            >
              Review knowledge
              <ArrowRight size={14} />
            </Link>
          </section>
          <div className="notice warning">
            Uploaded snapshots change only when you replace the file. Connected
            sources remain authoritative except for explicitly saved owner
            overrides.
          </div>
        </aside>
      </div>
      <h2 style={{ marginTop: 35 }}>Connect a data source</h2>
      <div className="connector-grid">
        <section className="panel connector">
          <div className="connector-header">
            <div className="channel-icon">
              <GoogleLogo size={24} />
            </div>
            <div>
              <h3>Google Sheets</h3>
              <Badge tone="neutral">Read-only</Badge>
            </div>
          </div>
          <p>
            Authorize your Google account, then select a spreadsheet and
            worksheet. Every synchronization returns to review.
          </p>
          <footer>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  const result = await request<{ url: string }>(
                    "/api/integrations/oauth",
                    { provider: "google" },
                  );
                  location.href = result.url;
                } catch {}
              }}
            >
              Connect Google
            </button>
            <button
              className="button secondary"
              onClick={() => setConnector("google")}
            >
              Choose spreadsheet
            </button>
          </footer>
        </section>
        <section className="panel connector">
          <div className="connector-header">
            <div className="channel-icon">
              <Database size={24} />
            </div>
            <div>
              <h3>Your existing database</h3>
              <Badge tone="neutral">TLS + read-only credentials</Badge>
            </div>
          </div>
          <p>
            Connect a public, reachable PostgreSQL or MySQL view with a stable
            identifier. Private networks need a separate secure connector.
          </p>
          <footer>
            <button
              className="button secondary"
              onClick={() => setConnector("postgresql")}
            >
              PostgreSQL
            </button>
            <button
              className="button secondary"
              onClick={() => setConnector("mysql")}
            >
              MySQL
            </button>
          </footer>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 25 }}>
        <div className="panel-head">
          <h2>Source health & history</h2>
          <button className="button ghost small" onClick={() => reload()}>
            Refresh
            <ArrowClockwise size={14} />
          </button>
        </div>
        {error && <div className="notice error">{error}</div>}
        {s.sources.map((source) => (
          <div className="row-item" key={source.id}>
            <div className="channel-icon">
              <FileCsv size={20} />
            </div>
            <div className="grow">
              <h3>{source.name}</h3>
              <p>
                {source.rowCount} records · Last success:{" "}
                {source.lastSyncAt
                  ? dateTime(source.lastSyncAt, s.business.timezone)
                  : "not yet synchronized"}
              </p>
              {source.error && (
                <p style={{ color: "var(--danger)" }}>{source.error}</p>
              )}
              <details className="small-text" style={{ marginTop: 6 }}>
                <summary>Sync history</summary>
                {source.history.map((h) => (
                  <p key={h.id}>
                    {dateTime(h.at)}: {h.status}, {h.rows} rows {h.error}
                  </p>
                ))}
              </details>
            </div>
            <Badge tone={source.status === "error" ? "error" : "neutral"}>
              {source.status}
            </Badge>
            {data?.sources.some(
              (v) => v.id === source.id && v.status !== "disconnected",
            ) && (
              <>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={async () => {
                    if (["csv", "xlsx"].includes(source.type)) {
                      setKind("catalog");
                      setDestination(source.id);
                      document
                        .querySelector<HTMLInputElement>('input[type="file"]')
                        ?.focus();
                      notify(
                        "Choose the replacement file above, then upload and review it.",
                      );
                      return;
                    }
                    try {
                      const r = await request<{ batch?: ImportBatch }>(
                        "/api/integrations/sources",
                        { action: "sync", sourceId: source.id },
                      );
                      if (r.batch) {
                        setBatch(r.batch);
                        setMapping(r.batch.mapping);
                      }
                      await reload();
                      await refresh();
                    } catch {}
                  }}
                >
                  <ArrowClockwise size={14} />
                  {["csv", "xlsx"].includes(source.type)
                    ? "Replace file"
                    : "Sync"}
                </button>
                <button
                  className="button ghost small"
                  disabled={busy}
                  onClick={() =>
                    setDisconnecting(
                      data.sources.find((item) => item.id === source.id) ||
                        null,
                    )
                  }
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        ))}
        {data?.imports
          .filter((b) => b.status === "review")
          .map((b) => (
            <div className="row-item" key={b.id}>
              <div className="grow">
                <h3>{b.name}</h3>
                <p>
                  {b.candidates.length} valid rows · {b.errors.length} row
                  errors
                </p>
              </div>
              <button
                className="button secondary small"
                onClick={() => {
                  setBatch(b);
                  setMapping(b.mapping);
                }}
              >
                Review import
              </button>
            </div>
          ))}
      </section>
      <Dialog
        open={!!disconnecting}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title="Disconnect this source?"
        description="Future synchronization stops and saved connection credentials are removed. Previously approved catalog records remain until you archive them."
      >
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDisconnecting(null)}
          >
            Keep source
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (!disconnecting) return;
              try {
                await request("/api/integrations/sources", {
                  action: "disconnect",
                  sourceId: disconnecting.id,
                });
                setDisconnecting(null);
                await reload();
                await refresh();
                notify("Source disconnected.");
              } catch {}
            }}
          >
            Disconnect source
          </button>
        </div>
      </Dialog>
      <Dialog
        open={!!batch}
        onOpenChange={(v) => !v && setBatch(null)}
        title="Review your catalog mapping"
        description="Confirm what each column means. Review mapping after any changes, then publish the validated rows."
      >
        {batch && (
          <>
            <div className="field-grid">
              {(
                [
                  "sourceId",
                  "sku",
                  "name",
                  "description",
                  "price",
                  "currency",
                  "stock",
                  "image",
                  "category",
                  "variant",
                ] as const
              ).map((field) => (
                <label className="label" key={field}>
                  {
                    {
                      sourceId: "Stable source ID",
                      sku: "SKU",
                      name: "Name",
                      description: "Description",
                      price: "Price (major units)",
                      currency: "Currency",
                      stock: "Stock",
                      image: "Approved image",
                      category: "Category",
                      variant: "Variant",
                    }[field]
                  }
                  <select
                    className="input"
                    value={mapping[field] || ""}
                    onChange={(e) =>
                      setMapping({ ...mapping, [field]: e.target.value })
                    }
                  >
                    <option value="">Not mapped</option>
                    {batch.headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="form-actions">
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  try {
                    const r = await request<{
                      mapping: ColumnMapping;
                      notice?: string;
                    }>("/api/integrations/imports", {
                      action: "suggest",
                      batchId: batch.id,
                    });
                    setMapping(r.mapping);
                    notify(
                      r.notice ||
                        "Suggested mapping ready. Review it before publishing.",
                    );
                  } catch {}
                }}
              >
                Suggest mapping
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={review}
              >
                Review mapping
              </button>
            </div>
            {batch.errors.length > 0 && (
              <div
                className="notice warning"
                style={{ marginTop: 18, display: "block" }}
              >
                <strong>{batch.errors.length} issues to correct</strong>
                {batch.errors.slice(0, 12).map((r, i) => (
                  <p key={i}>
                    Row {r.row}, {r.field}: {r.message}
                  </p>
                ))}
                <p>
                  Correct the source and re-upload to update these rows without
                  duplication.
                </p>
              </div>
            )}
            <div className="table-scroll" style={{ marginTop: 18 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.candidates.slice(0, 8).map((c) => (
                    <tr key={c.sourceId}>
                      <td>{c.name}</td>
                      <td>{money(c.priceMinor, c.currency)}</td>
                      <td>{c.stock ?? "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small-text muted">
              {batch.candidates.length} valid records. Missing items are not
              automatically deleted.
            </p>
            <div className="form-actions">
              <button
                className="button secondary"
                onClick={() => setBatch(null)}
              >
                Review later
              </button>
              <button
                className="button"
                disabled={
                  busy ||
                  !batch.candidates.length ||
                  JSON.stringify(mapping) !== JSON.stringify(batch.mapping)
                }
                onClick={publish}
              >
                Approve & import
              </button>
            </div>
          </>
        )}
      </Dialog>
      <Dialog
        open={!!connector}
        onOpenChange={(v) => !v && setConnector(null)}
        title={
          connector === "google"
            ? "Select a Google spreadsheet"
            : `Connect ${connector === "mysql" ? "MySQL" : "PostgreSQL"}`
        }
        description={
          connector === "google"
            ? "Connect Google first. Use a spreadsheet you authorized and a worksheet with a header row."
            : "Use a dedicated read-only account, an allowlisted view/table, TLS, and a stable primary key. Credentials are encrypted server-side."
        }
      >
        <form className="form-stack" onSubmit={connect} key={connector}>
          <label className="label">
            Source name
            <input className="input" name="name" required />
          </label>
          {connector === "google" ? (
            <>
              <label className="label">
                Spreadsheet ID
                <input className="input" name="spreadsheetId" required />
              </label>
              <label className="label">
                Worksheet name
                <input
                  className="input"
                  name="sheetName"
                  required
                  defaultValue="Sheet1"
                />
              </label>
            </>
          ) : (
            <>
              <div className="field-grid">
                {[
                  ["host", "Hostname"],
                  ["port", "Port"],
                  ["database", "Database"],
                  ["user", "Read-only username"],
                  ["password", "Password"],
                  ["schema", "Schema (PostgreSQL)"],
                  ["table", "Selected table or view"],
                  ["keyColumn", "Stable key column"],
                ].map(([name, label]) => (
                  <label className="label" key={name}>
                    {label}
                    <input
                      className="input"
                      name={name}
                      type={
                        name === "password"
                          ? "password"
                          : name === "port"
                            ? "number"
                            : "text"
                      }
                      autoComplete={
                        name === "password" ? "new-password" : "off"
                      }
                      defaultValue={
                        name === "port"
                          ? connector === "mysql"
                            ? 3306
                            : 5432
                          : name === "schema"
                            ? "public"
                            : undefined
                      }
                      required={name !== "schema"}
                    />
                  </label>
                ))}
              </div>
              <label className="label">
                Allowed columns, comma separated
                <input
                  className="input"
                  name="columns"
                  placeholder="id, name, sku, price, currency, stock"
                  required
                />
              </label>
              <label className="label">
                CA certificate (optional)
                <textarea className="input monospace" name="ca" />
              </label>
            </>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setConnector(null)}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              Save source
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

type FBWindow = Window & {
  FB?: {
    init: (options: Record<string, unknown>) => void;
    login: (
      callback: (result: { authResponse?: { code?: string } }) => void,
      options: Record<string, unknown>,
    ) => void;
  };
};
export function Channels() {
  const { workspace: s, request, refresh, busy, notify } = useWorkspace(),
    { data, reload } = useIntegrations();
  const [widget, setWidget] = useState(false),
    [snippet, setSnippet] = useState(""),
    [reconciling, setReconciling] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      channel: ChannelKind;
      action: "disconnect" | "activate";
    } | null>(null),
    [pin, setPin] = useState("");
  async function action(channel: ChannelKind, operation: string) {
    try {
      const result = await request<{
        url?: string;
        sdk?: {
          appId: string;
          configId: string;
          state: string;
          version: string;
        };
      }>("/api/integrations/channels", { action: operation, channel });
      if (result.url) {
        location.href = result.url;
        return;
      }
      if (result.sdk) {
        const sdk = result.sdk;
        const fbWindow = window as FBWindow;
        if (!fbWindow.FB) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://connect.facebook.net/en_US/sdk.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () =>
              reject(
                new Error("Meta signup could not be loaded. Please try again."),
              );
            document.head.appendChild(script);
          });
        }
        fbWindow.FB?.init({
          appId: sdk.appId,
          version: sdk.version,
          cookie: true,
          xfbml: false,
        });
        fbWindow.FB?.login(
          async (result) => {
            const code = result.authResponse?.code;
            if (!code) {
              notify(
                "Signup was cancelled or authorization was not completed.",
                true,
              );
              return;
            }
            try {
              await request("/api/integrations/channels", {
                action: "signup",
                channel: "whatsapp",
                code,
                state: sdk.state,
              });
              await reload();
              await refresh();
            } catch {}
          },
          {
            config_id: sdk.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: "3" },
          },
        );
        return;
      }
      setConfirm(null);
      notify(
        operation === "test"
          ? "Provider connection checks completed."
          : `Channel ${operation === "pause" ? "paused" : operation === "activate" ? "activated" : "updated"}.`,
      );
      await refresh();
      await reload();
    } catch (e) {
      if (e instanceof Error && e.message.includes("Meta signup"))
        notify(e.message, true);
    }
  }
  async function saveWidget(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await request<{ snippet: string }>("/api/integrations/widget", {
        active: f.get("active") === "on",
        title: f.get("title"),
        allowedOrigins: String(f.get("origins"))
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      });
      setSnippet(r.snippet);
      await reload();
      await refresh();
      notify("Website chat settings saved.");
    } catch {}
  }
  return (
    <>
      <Heading
        title="Meet customers where they are."
        description="Connect official business accounts. Activate replies only when you’re ready."
      />
      <div className="notice">
        <Plugs size={19} />
        <p>
          Connection and automation are separate. Select the account you own
          through official authorization, then choose when to turn on replies.
        </p>
      </div>
      {data?.oauth.map((attempt) => (
        <section
          className="panel panel-pad"
          key={attempt.attemptId}
          style={{ marginBottom: 20 }}
        >
          <h3>Select your {attempt.provider} account</h3>
          {attempt.provider === "whatsapp" && (
            <label className="label">
              WhatsApp two-step verification PIN
              <input
                className="input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <small>
                Sent only to Meta for phone registration. Not stored by
                RelayDesk.
              </small>
            </label>
          )}
          <div
            className="form-actions"
            style={{ justifyContent: "flex-start" }}
          >
            {attempt.candidates.map((candidate) => (
              <button
                className="button secondary"
                key={candidate.id}
                disabled={busy}
                onClick={async () => {
                  try {
                    await request("/api/integrations/channels", {
                      action: "select",
                      channel: attempt.provider,
                      attemptId: attempt.attemptId,
                      assetId: candidate.id,
                      ...(attempt.provider === "whatsapp"
                        ? { registrationPin: pin }
                        : {}),
                    });
                    setPin("");
                    await reload();
                    await refresh();
                    notify(
                      "Account verified and connected. Replies are paused until activated.",
                    );
                  } catch {}
                }}
              >
                {candidate.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      <div className="connector-grid">
        {s.channels.map((channel) => (
          <section className="panel connector" key={channel.id}>
            <div className="connector-header">
              <div className="channel-icon" style={{ width: 45, height: 45 }}>
                <ChannelIcon kind={channel.kind} size={27} />
              </div>
              <div>
                <h3>{channel.label}</h3>
                <Badge
                  tone={
                    channel.status === "connected"
                      ? ""
                      : channel.status === "needs_attention"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {channel.simulated && channel.status === "connected"
                    ? "Simulated demo"
                    : channel.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </div>
            <p>
              {
                {
                  messenger:
                    "Connect a Facebook Page through Facebook Login for Business. No personal inboxes or password sharing.",
                  instagram:
                    "Connect an Instagram Business or Creator account directly through Instagram Login.",
                  whatsapp:
                    "Connect an eligible business phone number through official WhatsApp Embedded Signup.",
                  website:
                    "A small, isolated chat widget for your website. Uses approved public knowledge and scoped customer sessions.",
                }[channel.kind]
              }
            </p>
            {channel.error && (
              <div className="notice error">{channel.error}</div>
            )}
            {channel.accountName && (
              <p className="small-text">Account: {channel.accountName}</p>
            )}
            <footer>
              {channel.kind === "website" ? (
                <button
                  className="button secondary"
                  onClick={() => setWidget(true)}
                >
                  <Code size={16} />
                  Configure widget
                </button>
              ) : channel.status === "connected" ||
                channel.status === "automation_paused" ? (
                <>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => action(channel.kind, "test")}
                  >
                    Check connection
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      channel.automationEnabled
                        ? action(channel.kind, "pause")
                        : setConfirm({
                            channel: channel.kind,
                            action: "activate",
                          })
                    }
                  >
                    {channel.automationEnabled
                      ? "Pause replies"
                      : "Activate replies"}
                  </button>
                  <button
                    className="button ghost small"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        channel: channel.kind,
                        action: "disconnect",
                      })
                    }
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => action(channel.kind, "connect")}
                >
                  Connect {channel.label}
                  <ArrowRight size={14} />
                </button>
              )}
              <span className="small-text muted">
                {channel.automationEnabled
                  ? "Replies enabled"
                  : "Replies paused"}
              </span>
            </footer>
          </section>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 25 }}>
        <div className="panel-head">
          <h2>Processing & delivery</h2>
          <button className="button ghost small" onClick={() => reload()}>
            Refresh
            <ArrowClockwise size={14} />
          </button>
        </div>
        {data?.jobs.length ? (
          data.jobs.slice(-8).map((job) => (
            <div className="row-item" key={job.id}>
              <div className="grow">
                <h3>{job.id}</h3>
                <p>
                  {job.error || dateTime(job.createdAt, s.business.timezone)}
                </p>
              </div>
              <Badge tone={job.status === "failed" ? "error" : "neutral"}>
                {job.status}
              </Badge>
              {(job.status === "pending" ||
                (job.status === "processing" &&
                  (job.leaseUntil || 0) < Date.now())) && (
                <button
                  className="button secondary small"
                  onClick={async () => {
                    try {
                      await request("/api/integrations/jobs", {
                        kind: "inbound",
                        id: job.id,
                      });
                      await reload();
                    } catch {}
                  }}
                >
                  Resume job
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="Ready when conversations arrive"
            description="Verified events, processing jobs, and delivery errors appear here. Demo messages do not contact social providers."
          />
        )}
        {data?.outbox.slice(-10).map((item) => (
          <div className="row-item" key={item.id}>
            <ChannelIcon kind={item.channel} />
            <div className="grow">
              <h3>Outbound reply</h3>
              <p>
                {item.error || dateTime(item.createdAt, s.business.timezone)}
              </p>
              <p className="monospace">{item.id}</p>
            </div>
            <Badge
              tone={
                item.status === "ambiguous" || item.status === "failed"
                  ? "warning"
                  : "neutral"
              }
            >
              {item.status}
            </Badge>
            {item.status === "prepared" && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  try {
                    await request("/api/integrations/jobs", {
                      kind: "outbound",
                      id: item.id,
                    });
                    await reload();
                  } catch {}
                }}
              >
                Resume delivery
              </button>
            )}
            {item.status === "ambiguous" && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => setReconciling(item.id)}
              >
                Review delivery
              </button>
            )}
          </div>
        ))}
      </section>
      <Dialog
        open={!!reconciling}
        onOpenChange={(open) => !open && setReconciling(null)}
        title="Resolve uncertain delivery"
        description="Check the provider’s message record first. A timed-out request may already have been delivered. This records your finding without sending the reply again."
      >
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            try {
              await request("/api/integrations/channels", {
                action: "reconcile",
                responseId: reconciling,
                decision: values.get("decision"),
                ...(values.get("providerId")
                  ? { providerId: values.get("providerId") }
                  : {}),
              });
              setReconciling(null);
              await reload();
              await refresh();
              notify("Delivery finding recorded.");
            } catch {}
          }}
        >
          <label className="label">
            Provider finding
            <select className="input" name="decision">
              <option value="accepted">
                Provider confirms message was accepted
              </option>
              <option value="failed">
                Provider confirms message was not accepted
              </option>
            </select>
          </label>
          <label className="label">
            Provider message ID
            <input className="input" name="providerId" maxLength={250} />
            <small>
              Required when confirming acceptance. Use the exact ID from the
              provider.
            </small>
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setReconciling(null)}
            >
              Keep unresolved
            </button>
            <button className="button" disabled={busy}>
              Record finding
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={widget}
        onOpenChange={setWidget}
        title="Website chat"
        description="Allow exact website origins, including https://. Origin restrictions protect embedding; customers still receive scoped sessions."
      >
        <form onSubmit={saveWidget} className="form-stack">
          <label className="label">
            Widget title
            <input
              className="input"
              name="title"
              defaultValue={data?.widget?.title || "How can we help?"}
              required
              maxLength={80}
            />
          </label>
          <label className="label">
            Allowed website origins, one per line
            <textarea
              className="input"
              name="origins"
              defaultValue={
                data?.widget?.allowedOrigins.join("\n") ||
                (typeof window !== "undefined" ? location.origin : "")
              }
              required
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="active"
              defaultChecked={data?.widget?.active ?? false}
            />
            Activate website replies
          </label>
          <button className="button" disabled={busy}>
            Save widget settings
          </button>
        </form>
        {snippet && (
          <>
            <h3 style={{ marginTop: 22 }}>Installation snippet</h3>
            <pre className="code">{snippet}</pre>
            <button
              className="button secondary small"
              onClick={() =>
                navigator.clipboard
                  .writeText(snippet)
                  .then(() => notify("Installation snippet copied."))
                  .catch(() =>
                    notify("Select and copy the snippet manually.", true),
                  )
              }
            >
              Copy snippet
            </button>
          </>
        )}
        {data?.widget?.active && (
          <a
            className="button secondary"
            style={{ marginTop: 18 }}
            href={`/api/widget/frame?widget=${encodeURIComponent(data.widget.id)}&parent=${typeof location !== "undefined" ? encodeURIComponent(location.origin) : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            Open widget preview
            <ArrowRight size={14} />
          </a>
        )}
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          confirm?.action === "activate"
            ? "Activate customer replies?"
            : "Disconnect this channel?"
        }
        description={
          confirm?.action === "activate"
            ? "Future eligible messages may receive automated replies using your published settings and approved business knowledge."
            : "Sends will stop and the stored credential will be revoked or removed. Existing conversations follow your retention policy."
        }
      >
        <div className="form-actions">
          <button className="button secondary" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            className={`button ${confirm?.action === "disconnect" ? "danger" : ""}`}
            disabled={busy}
            onClick={() => confirm && action(confirm.channel, confirm.action)}
          >
            {confirm?.action === "activate"
              ? "Activate replies"
              : "Disconnect channel"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
