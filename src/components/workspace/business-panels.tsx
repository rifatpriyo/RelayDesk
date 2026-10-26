"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  UploadSimple,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  BookOpen,
  CalendarBlank,
  CheckCircle,
  ArrowRight,
  Flask,
  Leaf,
} from "@phosphor-icons/react";
import { Badge, Dialog, Empty, money, dateTime } from "@/components/ui";
import { useWorkspace } from "./provider";
import { CatalogImageUpload } from "./asset-upload";
import { Button } from "@/components/primitives/button";
import type {
  Product,
  Knowledge as KnowledgeType,
  TemporaryRule,
  AssistantStyle,
} from "@/lib/core/types";

export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-heading-actions">{children}</div>
    </div>
  );
}
export function Catalog() {
  const { workspace: s, command, busy, notify } = useWorkspace();
  const [query, setQuery] = useState(""),
    [edit, setEdit] = useState<Product | "new" | null>(null),
    [remove, setRemove] = useState<Product | null>(null),
    [image, setImage] = useState(""),
    [imageUploading, setImageUploading] = useState(false),
    [imageApproved, setImageApproved] = useState(false),
    [variantRows, setVariantRows] = useState<Product["variants"]>([]);
  useEffect(() => {
    setImage(edit && edit !== "new" ? edit.image : "");
    setImageApproved(edit && edit !== "new" ? edit.imageApproved : false);
    setVariantRows(
      edit && edit !== "new" ? structuredClone(edit.variants) : [],
    );
  }, [edit]);
  const products = s.catalog.filter(
    (p) =>
      !p.archived &&
      `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("catalog.save", {
        product: {
          ...(edit && edit !== "new" ? { id: edit.id } : {}),
          name: f.get("name"),
          sku: f.get("sku"),
          description: f.get("description"),
          priceMinor: Math.round(Number(f.get("price")) * 100),
          stock:
            String(f.get("stock")).trim() === ""
              ? null
              : Number(f.get("stock")),
          kind: f.get("kind"),
          image,
          imageApproved: !!image && imageApproved,
          variants: variantRows,
          freshnessHours: Number(f.get("freshnessHours")),
          attributes: JSON.parse(String(f.get("attributes") || "{}")),
        },
      });
      setEdit(null);
      notify(
        "Catalog saved. Your assistant can use the latest approved details.",
      );
    } catch (e) {
      if (e instanceof SyntaxError)
        notify("Custom attributes must be a valid JSON object.", true);
    }
  }
  return (
    <>
      <Heading
        title="Good answers start here."
        description="The products, prices, and details your assistant can trust."
      >
        <Link href="/workspace/sources" className="button secondary">
          <UploadSimple size={16} />
          Import catalog
        </Link>
        <Button onClick={() => setEdit("new")}>
          <Plus size={16} />
          Add item
        </Button>
      </Heading>
      <div className="toolbar">
        <div className="search-input">
          <MagnifyingGlass size={16} />
          <input
            className="input"
            aria-label="Search catalog"
            placeholder="Search by name or SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="small-text muted">
          {products.length} items · Prices in {s.business.currency}
        </span>
      </div>
      <div className="product-grid">
        {products.map((p) => (
          <article className="panel product-card" key={p.id}>
            {p.image ? (
              <img
                src={p.image}
                alt={
                  p.image.startsWith("/samples/")
                    ? `Sample catalog image: ${p.name}`
                    : p.name
                }
                width={400}
                height={240}
              />
            ) : (
              <div className="empty" style={{ height: 205 }}>
                <Leaf size={45} />
                <span className="small-text">No approved image</span>
              </div>
            )}
            <div className="product-body">
              <h3>{p.name}</h3>
              <p>
                {p.sku} · {p.kind === "service" ? "Service" : "Product"}
              </p>
              <div className="product-price">
                {money(p.priceMinor, p.currency)}
              </div>
              <div className="product-bottom">
                <Badge
                  tone={
                    p.stock === null ? "warning" : p.stock === 0 ? "error" : ""
                  }
                >
                  {p.stock === null
                    ? "Availability to confirm"
                    : p.stock === 0
                      ? "Out of stock"
                      : `${p.stock} in stock`}
                </Badge>
                <span style={{ display: "flex" }}>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => setEdit(p)}
                  >
                    <PencilSimple size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Archive ${p.name}`}
                    onClick={() => setRemove(p)}
                  >
                    <Trash size={16} />
                  </button>
                </span>
              </div>
              <div
                className="small-text muted"
                style={{ fontSize: 9, marginTop: 12 }}
              >
                Source: {p.sourceId} · Updated{" "}
                {dateTime(p.updatedAt, s.business.timezone)}
              </div>
              {p.variants.length > 0 && (
                <details className="small-text">
                  <summary>{p.variants.length} variants</summary>
                  {p.variants.map((v) => (
                    <p key={v.id}>
                      {v.name}: {money(v.priceMinor, p.currency)},{" "}
                      {v.stock ?? "unknown"} available
                    </p>
                  ))}
                </details>
              )}
            </div>
          </article>
        ))}
      </div>
      {!products.length && (
        <Empty
          title="Let’s add your first item"
          description="Add a product or service, or bring your catalog from a spreadsheet."
        >
          <button className="button" onClick={() => setEdit("new")}>
            Add item
          </button>
        </Empty>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={
          edit === "new" ? "Add a product or service" : "Edit catalog item"
        }
        description="These details are authoritative. Your assistant uses this price rather than historical conversations."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={save}
            key={edit === "new" ? "new" : edit.id}
          >
            <div className="field-grid">
              <label className="label wide">
                Name
                <input
                  className="input"
                  name="name"
                  defaultValue={edit === "new" ? "" : edit.name}
                  required
                  maxLength={150}
                />
              </label>
              <label className="label">
                SKU or stable identifier
                <input
                  className="input"
                  name="sku"
                  defaultValue={edit === "new" ? "" : edit.sku}
                  required
                />
              </label>
              <label className="label">
                Type
                <select
                  className="input"
                  name="kind"
                  defaultValue={edit === "new" ? "product" : edit.kind}
                >
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                </select>
              </label>
              <label className="label">
                Price in {s.business.currency}
                <input
                  className="input"
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={edit === "new" ? "" : edit.priceMinor / 100}
                />
              </label>
              <label className="label">
                Stock
                <input
                  className="input"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={edit === "new" ? "" : (edit.stock ?? "")}
                />
                <small>Leave blank when availability needs confirmation.</small>
              </label>
              <label className="label wide">
                Description
                <textarea
                  className="input"
                  name="description"
                  defaultValue={edit === "new" ? "" : edit.description}
                />
              </label>
              <label className="label wide">
                Image reference
                <input
                  className="input"
                  name="image"
                  value={image}
                  onChange={(event) => {
                    setImage(event.target.value);
                    setImageApproved(false);
                  }}
                />
                <small>
                  Upload an image below, or use a local sample asset. External
                  image URLs are not fetched.
                </small>
              </label>
              <CatalogImageUpload
                onBusy={setImageUploading}
                onUploaded={(value) => {
                  setImage(value);
                  setImageApproved(false);
                }}
              />
              <label className="checkbox wide">
                <input
                  type="checkbox"
                  checked={imageApproved}
                  disabled={!image}
                  onChange={(event) => setImageApproved(event.target.checked)}
                />
                Approve this image for customer replies
              </label>
            </div>
            <label className="label">
              Confirm stock freshness every (hours)
              <input
                className="input"
                name="freshnessHours"
                type="number"
                min={1}
                max={8760}
                defaultValue={edit === "new" ? 24 : edit.freshnessHours}
              />
            </label>
            <fieldset
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <legend className="small-text">Sizes and variants</legend>
              {variantRows.map((variant, index) => (
                <div
                  className="field-grid"
                  style={{ marginBottom: 12 }}
                  key={variant.id}
                >
                  <label className="label">
                    Variant name
                    <input
                      className="input"
                      required
                      value={variant.name}
                      onChange={(e) =>
                        setVariantRows((rows) =>
                          rows.map((v, i) =>
                            i === index ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="label">
                    Variant price
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={variant.priceMinor / 100}
                      onChange={(e) =>
                        setVariantRows((rows) =>
                          rows.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  priceMinor: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="label">
                    Variant stock
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={variant.stock ?? ""}
                      onChange={(e) =>
                        setVariantRows((rows) =>
                          rows.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  stock:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() =>
                      setVariantRows((rows) =>
                        rows.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove variant
                  </button>
                </div>
              ))}
              <button
                className="button secondary small"
                type="button"
                onClick={() =>
                  setVariantRows((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      priceMinor: 0,
                      stock: null,
                    },
                  ])
                }
              >
                <Plus size={14} />
                Add variant
              </button>
            </fieldset>
            <details>
              <summary className="small-text">Custom attributes</summary>
              <label className="label" style={{ marginTop: 12 }}>
                Attributes as JSON
                <textarea
                  className="input monospace"
                  name="attributes"
                  defaultValue={
                    edit === "new"
                      ? "{}"
                      : JSON.stringify(edit.attributes, null, 2)
                  }
                />
              </label>
            </details>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="button" disabled={busy || imageUploading}>
                {imageUploading
                  ? "Uploading image…"
                  : busy
                    ? "Saving…"
                    : "Save item"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Archive this item?"
        description="It will no longer appear in customer answers. Past conversations retain their audit history."
      >
        <p>{remove?.name}</p>
        <div className="form-actions">
          <button className="button secondary" onClick={() => setRemove(null)}>
            Keep item
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              try {
                await command("catalog.delete", { id: remove?.id });
                setRemove(null);
                notify("Item archived.");
              } catch {}
            }}
          >
            Archive item
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function Knowledge() {
  const { workspace: s, command, busy, notify } = useWorkspace(),
    [filter, setFilter] = useState("all"),
    [edit, setEdit] = useState<KnowledgeType | "new" | null>(null),
    [remove, setRemove] = useState<KnowledgeType | null>(null);
  const entries = s.knowledge.filter(
    (k) => filter === "all" || k.status === filter,
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("knowledge.save", {
        entry: {
          ...(edit && edit !== "new" ? { id: edit.id } : {}),
          title: f.get("title"),
          content: f.get("content"),
          status: f.get("status"),
        },
      });
      setEdit(null);
      notify("Business knowledge saved.");
    } catch {}
  }
  return (
    <>
      <Heading
        title="Your knowledge. Their answers."
        description="Give your assistant the things you already know by heart."
      >
        <Link className="button secondary" href="/workspace/sources">
          <UploadSimple size={16} />
          Upload document
        </Link>
        <button className="button" onClick={() => setEdit("new")}>
          <Plus size={16} />
          Add answer
        </button>
      </Heading>
      <div className="toolbar">
        <div className="tabs">
          {["all", "published", "draft", "archived"].map((f) => (
            <button
              key={f}
              className={`tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All knowledge"
                : f === "published"
                  ? "Approved answers"
                  : f === "draft"
                    ? "Needs review"
                    : "Archived"}{" "}
              <span className="muted">
                {
                  s.knowledge.filter((k) => f === "all" || k.status === f)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
      </div>
      {filter === "draft" && (
        <div className="notice warning">
          Imported history and documents stay private until you review and
          publish them. Remove personal details and one-off promises.
        </div>
      )}
      <div className="equal-col">
        {entries.map((k) => (
          <article className="panel knowledge-card" key={k.id}>
            <Badge
              tone={
                k.status === "draft"
                  ? "warning"
                  : k.status === "archived"
                    ? "neutral"
                    : ""
              }
            >
              {k.status === "published"
                ? "Approved"
                : k.status === "draft"
                  ? "Review needed"
                  : "Archived"}
            </Badge>
            <h3>{k.title}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{k.content}</p>
            <footer>
              <span>
                {k.source}
                <br />
                Version {k.version} ·{" "}
                {dateTime(k.updatedAt, s.business.timezone)}
              </span>
              <span>
                <button
                  className="icon-button"
                  aria-label={`Edit ${k.title}`}
                  onClick={() => setEdit(k)}
                >
                  <PencilSimple size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${k.title}`}
                  onClick={() => setRemove(k)}
                >
                  <Trash size={16} />
                </button>
              </span>
            </footer>
          </article>
        ))}
      </div>
      {!entries.length && (
        <Empty
          title="A little knowledge goes a long way"
          description="Add delivery policies, service information, or answers to frequently asked questions."
        />
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={
          edit === "new" ? "Add a helpful answer" : "Review business knowledge"
        }
        description="Only approved answers are available to customers. Drafts remain private."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={save}
            key={edit === "new" ? "new" : edit.id}
          >
            <label className="label">
              Question or title
              <input
                className="input"
                name="title"
                defaultValue={edit === "new" ? "" : edit.title}
                required
                maxLength={160}
              />
            </label>
            <label className="label">
              Your approved answer
              <textarea
                className="input"
                name="content"
                rows={6}
                defaultValue={edit === "new" ? "" : edit.content}
                required
                maxLength={12000}
              />
            </label>
            <label className="label">
              Availability
              <select
                className="input"
                name="status"
                defaultValue={edit === "new" ? "draft" : edit.status}
              >
                <option value="draft">Draft: review before use</option>
                <option value="published">
                  Approved: available to customers
                </option>
                <option value="archived">Archived: no longer used</option>
              </select>
            </label>
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="button" disabled={busy}>
                Save answer
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Delete this answer?"
        description="The answer will be removed from business knowledge and future retrieval."
      >
        <p>{remove?.title}</p>
        <div className="form-actions">
          <button className="button secondary" onClick={() => setRemove(null)}>
            Keep answer
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              try {
                await command("knowledge.delete", { id: remove?.id });
                setRemove(null);
                notify("Answer deleted.");
              } catch {}
            }}
          >
            Delete answer
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function Rules() {
  const { workspace: s, command, busy, notify } = useWorkspace(),
    [edit, setEdit] = useState<TemporaryRule | "new" | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("rule.save", {
        rule: {
          ...(edit && edit !== "new" ? { id: edit.id } : {}),
          title: f.get("title"),
          scope: f.get("scope"),
          startsAt: new Date(String(f.get("startsAt"))).toISOString(),
          endsAt: new Date(String(f.get("endsAt"))).toISOString(),
          timezone: f.get("timezone"),
          priority: Number(f.get("priority")),
          status: f.get("status"),
          acceptOrders: f.get("acceptOrders") === "on",
          dispatchResumesAt: f.get("dispatchResumesAt")
            ? new Date(String(f.get("dispatchResumesAt"))).toISOString()
            : null,
          explanation: f.get("explanation"),
        },
      });
      setEdit(null);
      notify(
        "Temporary change saved. It is checked whenever the assistant replies.",
      );
    } catch (e) {
      if (e instanceof RangeError)
        notify(
          "Use a complete ISO date with timezone, for example 2027-03-08T00:00:00+06:00.",
          true,
        );
    }
  }
  return (
    <>
      <Heading
        title="Life changes. Keep customers informed."
        description="Owner-approved holidays, shipping pauses, and opening-hour changes."
      >
        <button className="button" onClick={() => setEdit("new")}>
          <Plus size={16} />
          Add change
        </button>
      </Heading>
      <div className="notice">
        <CalendarBlank size={19} />
        <p>
          Rules apply at reply time in their stated timezone. Dispatch
          resumption is never an arrival guarantee. Business timezone:{" "}
          <strong>{s.business.timezone}</strong>.
        </p>
      </div>
      <div className="stack">
        {s.rules.map((r) => {
          const now = Date.now(),
            status =
              r.status === "cancelled" || r.status === "draft"
                ? r.status
                : now < new Date(r.startsAt).getTime()
                  ? "scheduled"
                  : now >= new Date(r.endsAt).getTime()
                    ? "expired"
                    : "active";
          return (
            <article className="panel rule-card" key={r.id}>
              <div className="rule-icon">
                <CalendarBlank size={23} />
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <h3 style={{ margin: 0 }}>{r.title}</h3>
                  <Badge
                    tone={
                      status === "active"
                        ? ""
                        : status === "scheduled"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {status}
                  </Badge>
                </div>
                <p>{r.explanation}</p>
                <div className="rule-meta">
                  <span>
                    {dateTime(r.startsAt, r.timezone)} to{" "}
                    {dateTime(r.endsAt, r.timezone)}
                  </span>
                  <span>{r.timezone}</span>
                  <span>
                    {r.scope} · Priority {r.priority}
                  </span>
                </div>
              </div>
              <button
                className="button secondary small"
                onClick={() => setEdit(r)}
              >
                <PencilSimple size={15} />
                Edit
              </button>
            </article>
          );
        })}
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={
          edit === "new" ? "Plan a temporary change" : "Edit temporary change"
        }
        description="Choose your actual business dates. Include the timezone offset in each date, such as +06:00 for Bangladesh."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={save}
            key={edit === "new" ? "new" : edit.id}
          >
            <label className="label">
              Title
              <input
                className="input"
                name="title"
                defaultValue={edit === "new" ? "" : edit.title}
                required
              />
            </label>
            <div className="field-grid">
              <label className="label">
                Affects
                <select
                  className="input"
                  name="scope"
                  defaultValue={edit === "new" ? "shipping" : edit.scope}
                >
                  {["shipping", "hours", "orders", "general"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                Status
                <select
                  className="input"
                  name="status"
                  defaultValue={edit === "new" ? "scheduled" : edit.status}
                >
                  {["draft", "scheduled", "active", "expired", "cancelled"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="label wide">
                Starts at, with timezone
                <input
                  className="input"
                  name="startsAt"
                  placeholder="2027-03-08T00:00:00+06:00"
                  defaultValue={edit === "new" ? "" : edit.startsAt}
                  required
                />
              </label>
              <label className="label wide">
                Ends at, with timezone
                <input
                  className="input"
                  name="endsAt"
                  placeholder="2027-03-12T09:00:00+06:00"
                  defaultValue={edit === "new" ? "" : edit.endsAt}
                  required
                />
              </label>
              <label className="label">
                Business timezone
                <input
                  className="input"
                  name="timezone"
                  defaultValue={
                    edit === "new" ? s.business.timezone : edit.timezone
                  }
                  required
                />
              </label>
              <label className="label">
                Priority
                <input
                  className="input"
                  name="priority"
                  type="number"
                  defaultValue={edit === "new" ? 10 : edit.priority}
                  min={0}
                  max={100}
                />
              </label>
              <label className="label wide">
                Dispatch resumes (optional)
                <input
                  className="input"
                  name="dispatchResumesAt"
                  defaultValue={
                    edit === "new" ? "" : edit.dispatchResumesAt || ""
                  }
                />
              </label>
            </div>
            <label className="label">
              What customers should know
              <textarea
                className="input"
                name="explanation"
                defaultValue={edit === "new" ? "" : edit.explanation}
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="acceptOrders"
                defaultChecked={edit === "new" ? true : edit.acceptOrders}
              />
              Customers may still request orders
            </label>
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="button" disabled={busy}>
                Save change
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function Assistant() {
  const { workspace: s, command, busy, notify } = useWorkspace();
  const [form, setForm] = useState<AssistantStyle>(s.settings.draft),
    [publish, setPublish] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await command("settings.save", { settings: form });
      notify("Draft saved. Test it before publishing.");
    } catch {}
  }
  return (
    <>
      <Heading
        title="Helpful, in your own way."
        description="Set the tone. Your business knowledge supplies the facts."
      >
        <Link className="button secondary" href="/workspace/playground">
          <Flask size={16} />
          Test draft
        </Link>
        <button className="button" onClick={() => setPublish(true)}>
          Publish changes
        </button>
      </Heading>
      <div className="two-col">
        <form className="panel panel-pad form-stack" onSubmit={save}>
          <div>
            <h2>Assistant style</h2>
            <p className="small-text">
              Simple choices that make your conversations feel familiar.
            </p>
          </div>
          <label className="label">
            How should it sound?
            <select
              className="input"
              value={form.tone}
              onChange={(e) =>
                setForm({
                  ...form,
                  tone: e.target.value as AssistantStyle["tone"],
                })
              }
            >
              <option value="warm">Warm and friendly</option>
              <option value="professional">Clear and professional</option>
              <option value="concise">Brief and to the point</option>
            </select>
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 10 }}>
              Conversation languages
            </legend>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {(["en", "bn", "banglish"] as const).map((l) => (
                <label key={l} className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.languages.includes(l)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        languages: e.target.checked
                          ? [...form.languages, l]
                          : form.languages.filter((v) => v !== l),
                      })
                    }
                  />
                  {{ en: "English", bn: "বাংলা", banglish: "Banglish" }[l]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="label">
            Reply length
            <select
              className="input"
              value={form.replyLength}
              onChange={(e) =>
                setForm({
                  ...form,
                  replyLength: e.target.value as AssistantStyle["replyLength"],
                })
              }
            >
              <option value="short">Short and helpful</option>
              <option value="balanced">A little more detail</option>
            </select>
          </label>
          <label className="label">
            First greeting
            <textarea
              className="input"
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            />
            <small>Always identify it as your business assistant.</small>
          </label>
          <label className="label">
            Maximum permitted discount (%)
            <input
              className="input"
              type="number"
              value={form.maxDiscountPercent}
              min={0}
              max={50}
              onChange={(e) =>
                setForm({ ...form, maxDiscountPercent: Number(e.target.value) })
              }
            />
            <small>
              A limit is not an automatic offer. Set 0 for no discounts.
            </small>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.handoverOnUncertainty}
              onChange={(e) =>
                setForm({ ...form, handoverOnUncertainty: e.target.checked })
              }
            />
            Ask your team when an answer needs more care
          </label>
          <details>
            <summary className="small-text">
              Advanced instructions (optional)
            </summary>
            <label className="label" style={{ marginTop: 13 }}>
              Additional guidance
              <textarea
                className="input"
                value={form.advancedInstructions}
                onChange={(e) =>
                  setForm({ ...form, advancedInstructions: e.target.value })
                }
              />
              <small>
                Cannot override privacy, permissions, verified prices, or
                channel rules.
              </small>
            </label>
          </details>
          <div className="form-actions">
            <button className="button" disabled={busy}>
              Save draft
            </button>
          </div>
        </form>
        <aside className="stack" style={{ alignContent: "start" }}>
          <section className="welcome-card">
            <Leaf size={28} weight="duotone" style={{ marginBottom: 20 }} />
            <h2>
              A little personality.
              <br />
              Always grounded.
            </h2>
            <p>
              Your assistant uses approved knowledge and current prices. If it
              cannot find an answer, it asks for help.
            </p>
          </section>
          <section className="panel panel-pad">
            <h3>Currently published</h3>
            <Badge>Version {s.settings.version}</Badge>
            <p className="small-text" style={{ marginTop: 17 }}>
              {s.settings.publishedAt
                ? `Published ${dateTime(s.settings.publishedAt, s.business.timezone)}`
                : "No settings published yet."}
            </p>
            <p className="small-text">
              Saving a draft leaves live replies unchanged. Publishing is a
              separate, explicit action.
            </p>
          </section>
        </aside>
      </div>
      <Dialog
        open={publish}
        onOpenChange={setPublish}
        title="Publish your saved assistant style?"
        description="The saved draft will be used for future replies. Save your latest edits first, and test a few questions."
      >
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setPublish(false)}
          >
            Keep testing
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              try {
                await command("settings.publish");
                setPublish(false);
                notify("Assistant style published.");
              } catch {}
            }}
          >
            Publish saved draft
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function Onboarding() {
  const { workspace: s, command, busy, notify } = useWorkspace();
  const steps = [
    [
      "Your business",
      "Name, timezone, and how customers know you.",
      "settings",
    ],
    [
      "Bring your information",
      "Upload a catalog or connect a supported source.",
      "sources",
    ],
    [
      "Review your knowledge",
      "Check prices and approve helpful answers.",
      "knowledge",
    ],
    [
      "Make it sound like you",
      "Choose tone, languages, and when to ask your team.",
      "assistant",
    ],
    [
      "Try a conversation",
      "Ask a few questions and check the sources.",
      "playground",
    ],
    [
      "Connect your channels",
      "Authorize the official accounts you want to use.",
      "channels",
    ],
    [
      "Activate when you’re ready",
      "Review your settings, then explicitly activate each channel.",
      "channels",
    ],
  ];
  return (
    <>
      <Heading
        title="Let’s make it yours."
        description="A few thoughtful steps, saved as you go."
      />
      <div className="two-col">
        <section>
          <div className="notice">
            <CheckCircle size={18} />
            Your progress is saved. You can test your assistant before
            connecting a channel.
          </div>
          <div className="onboarding-steps">
            {steps.map(([title, desc, path], i) => (
              <article
                className={`onboarding-step ${i < s.business.onboardingStep ? "complete" : ""}`}
                key={title}
              >
                {i < s.business.onboardingStep ? (
                  <CheckCircle size={24} weight="fill" color="#66855b" />
                ) : (
                  <span className="avatar">{i + 1}</span>
                )}
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
                <Link
                  className="button secondary small"
                  href={`/workspace/${path}`}
                >
                  {i < s.business.onboardingStep ? "Review" : "Open"}
                  <ArrowRight size={13} />
                </Link>
              </article>
            ))}
          </div>
          <button
            className="button"
            disabled={busy || s.business.onboardingStep >= 7}
            onClick={async () => {
              try {
                await command("onboarding.advance", {
                  step: Math.min(7, s.business.onboardingStep + 1),
                });
                notify("Setup progress saved.");
              } catch {}
            }}
          >
            {s.business.onboardingStep >= 7
              ? "Setup reviewed"
              : "Mark current step reviewed"}
          </button>
        </section>
        <aside className="welcome-card" style={{ alignSelf: "start" }}>
          <BookOpen size={30} style={{ marginBottom: 20 }} />
          <h2>
            Start small.
            <br />
            Build confidence.
          </h2>
          <p>
            A clear product catalog and a few good answers are enough to start
            testing. You stay in control of what gets published and when replies
            go live.
          </p>
        </aside>
      </div>
    </>
  );
}
