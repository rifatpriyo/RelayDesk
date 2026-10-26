import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor, BusinessState, Product } from "../core/types";
import { readBusiness, transactBusiness, assertManager } from "../core/server";
import { planById } from "../core/plans";
import {
  IntegrationError,
  hash,
  encryptCredential,
  decryptCredential,
} from "./security";
import {
  parseCatalogFile,
  parseDocument,
  parseHistory,
  proposeMapping,
  reviewRows,
  documentChunks,
} from "./imports";
import {
  integrationState,
  enforceRate,
  type ColumnMapping,
  type ImportBatch,
  type ImportRow,
  type SourceKind,
  type SourceRecord,
} from "./types";
import {
  databaseConfigSchema,
  readDatabase,
  readGoogleSheet,
  refreshGoogle,
  type DatabaseConfig,
  type GoogleCredential,
} from "./connectors";

export function integrationAudit(
  state: BusinessState,
  actor: Actor,
  action: string,
  targetId?: string,
) {
  state.audit.push({
    id: randomUUID(),
    businessId: actor.businessId,
    actorId: actor.userId,
    action,
    targetId,
    at: new Date().toISOString(),
  });
}
export async function createImport(
  actor: Actor,
  rows: ImportRow[],
  name: string,
  kind: SourceKind,
  sourceId?: string,
  complete = false,
): Promise<ImportBatch> {
  assertManager(actor);
  const id = randomUUID(),
    createdAt = new Date().toISOString(),
    contentHash = hash(JSON.stringify(rows));
  return transactBusiness(actor, (state) => {
    const data = integrationState(state),
      plan = planById(state.billing.subscription.planId);
    enforceRate(data, "imports:daily", 20, 86_400_000);
    let source = sourceId
      ? data.sources.find((item) => item.id === sourceId)
      : undefined;
    if (sourceId && !source)
      throw new IntegrationError(
        "source_not_found",
        "Data source not found.",
        404,
      );
    if (!source) {
      if (
        state.sources.filter((item) => item.status !== "disconnected").length >=
        plan.sources
      )
        throw new IntegrationError(
          "source_limit",
          "The source allowance is reached. Replace an existing source or change plan.",
          403,
        );
      source = {
        id: randomUUID(),
        name,
        kind,
        status: "review",
        mappingVersion: 0,
        freshnessHours: 24,
        syncMinutes: plan.syncMinutes,
      };
      data.sources.push(source);
    }
    const previous = data.imports.find(
      (batch) =>
        batch.sourceId === source!.id &&
        batch.hash === contentHash &&
        batch.status === "published",
    );
    if (previous) return previous;
    const mapping =
        source.mapping || proposeMapping(Object.keys(rows[0] || {})),
      review = reviewRows(rows, mapping);
    const batch: ImportBatch = {
      id,
      sourceId: source.id,
      name,
      kind,
      status: "review",
      createdAt,
      headers: Object.keys(rows[0] || {}),
      rows,
      mapping,
      ...review,
      hash: contentHash,
      complete,
      mappingVersion: source.mappingVersion + 1,
    };
    data.imports.unshift(batch);
    if (data.imports.length > 20) data.imports = data.imports.slice(0, 20);
    source.status = "review";
    let visible = state.sources.find((item) => item.id === source!.id);
    if (!visible && kind !== "document") {
      visible = {
        id: source.id,
        businessId: actor.businessId,
        name,
        type: kind as Exclude<SourceKind, "document">,
        status: "review",
        rowCount: rows.length,
        lastSyncAt: null,
        freshnessHours: 24,
        history: [],
      };
      state.sources.push(visible);
    }
    if (visible) {
      visible.status = "review";
      visible.rowCount = rows.length;
      visible.history.unshift({
        id,
        at: createdAt,
        status: "review",
        rows: rows.length,
      });
    }
    integrationAudit(state, actor, "import.preview", id);
    return batch;
  });
}
export async function uploadImport(
  actor: Actor,
  file: File,
  kind: string,
  sourceId?: string,
  maxBytes = 2_000_000,
) {
  assertManager(actor);
  if (!["catalog", "document", "history"].includes(kind))
    throw new IntegrationError(
      "upload_kind",
      "Choose catalog, document, or history.",
    );
  if (file.size > maxBytes)
    throw new IntegrationError(
      "upload_size",
      `Files must be no larger than ${maxBytes / 1_000_000} MB.`,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "catalog") {
    const rows = await parseCatalogFile(file.name, bytes, maxBytes);
    return {
      batch: await createImport(
        actor,
        rows,
        file.name,
        /\.xlsx$/i.test(file.name) ? "xlsx" : "csv",
        sourceId,
        true,
      ),
    };
  }
  const text =
    kind === "document"
      ? await parseDocument(file.name, bytes, maxBytes)
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const pairs =
    kind === "history"
      ? parseHistory(file.name, text)
      : documentChunks(text).map((content, index) => ({
          question: `${file.name} — part ${index + 1}`,
          answer: content,
        }));
  const created = await transactBusiness(actor, (state) => {
    const data = integrationState(state);
    enforceRate(data, "imports:daily", 20, 86_400_000);
    if (state.knowledge.length + pairs.length > 300)
      throw new IntegrationError(
        "knowledge_limit",
        "Archive or delete old knowledge before adding more than 300 entries.",
      );
    const at = new Date().toISOString();
    const ids = pairs.map((pair) => {
      const id = randomUUID();
      state.knowledge.push({
        id,
        businessId: actor.businessId,
        title: pair.question.slice(0, 160),
        content: pair.answer,
        status: "draft",
        source: `${kind === "history" ? "Historical chat — review and privacy check required" : "Uploaded document"}: ${file.name}`,
        version: 1,
        updatedAt: at,
      });
      return id;
    });
    integrationAudit(state, actor, `${kind}.draft`, ids[0]);
    return ids;
  });
  return {
    created,
    status: "draft",
    notice:
      "Review privacy, accuracy and current policy before publishing. Draft content is never used for customer replies.",
  };
}
export async function reviewImport(
  actor: Actor,
  batchId: string,
  mapping: ColumnMapping,
): Promise<ImportBatch> {
  assertManager(actor);
  return transactBusiness(actor, (state) => {
    const batch = integrationState(state).imports.find(
      (item) => item.id === batchId,
    );
    if (!batch)
      throw new IntegrationError("import_not_found", "Import not found.", 404);
    if (batch.status !== "review")
      throw new IntegrationError(
        "import_terminal",
        "Create a new import to change a published mapping.",
        409,
      );
    Object.assign(batch, { mapping, ...reviewRows(batch.rows, mapping) });
    return batch;
  });
}
export async function publishImport(
  actor: Actor,
  batchId: string,
  retireMissing = false,
) {
  assertManager(actor);
  return transactBusiness(actor, (state) => {
    const data = integrationState(state),
      batch = data.imports.find((item) => item.id === batchId);
    if (!batch)
      throw new IntegrationError("import_not_found", "Import not found.", 404);
    if (batch.status === "published")
      return {
        imported: batch.candidates.length,
        errors: batch.errors,
        duplicate: true,
      };
    const source = data.sources.find((item) => item.id === batch.sourceId)!;
    if (source.status === "disconnected")
      throw new IntegrationError(
        "source_disconnected",
        "Reconnect this source before publishing.",
        409,
      );
    if (batch.errors.length)
      throw new IntegrationError(
        "review_errors",
        "Correct every invalid row and retry the snapshot before publishing. No records have changed.",
        409,
      );
    if (!batch.candidates.length)
      throw new IntegrationError(
        "empty_import",
        "There are no valid products to publish.",
      );
    if (
      batch.candidates.some((item) => item.currency !== state.business.currency)
    )
      throw new IntegrationError(
        "currency_mismatch",
        `This business currently uses ${state.business.currency}. Correct the source currency; conversion is never guessed.`,
      );
    const newCount = batch.candidates.filter(
      (row) =>
        !state.catalog.some(
          (product) =>
            product.sourceId === batch.sourceId &&
            product.sourceRecordId === row.sourceId,
        ),
    ).length;
    if (
      state.catalog.filter((item) => !item.archived).length + newCount >
      planById(state.billing.subscription.planId).catalog
    )
      throw new IntegrationError(
        "catalog_limit",
        "This import exceeds the plan catalog limit.",
        403,
      );
    const now = new Date().toISOString();
    for (const row of batch.candidates) {
      const existing = state.catalog.find(
          (item) =>
            item.sourceId === batch.sourceId &&
            item.sourceRecordId === row.sourceId,
        ),
        values = {
          name: row.name,
          description: row.description,
          sku: row.sku,
          priceMinor: row.priceMinor,
          stock: row.stock,
          image: row.image,
          attributes: {
            ...row.attributes,
            ...(row.category ? { category: row.category } : {}),
            ...(row.variant ? { variant: row.variant } : {}),
          },
        };
      if (existing) {
        for (const [field, value] of Object.entries(values))
          if (!existing.overrides.includes(field))
            (existing as unknown as Record<string, unknown>)[field] = value;
        existing.updatedAt = now;
        existing.archived = false;
      } else {
        const product: Product = {
          id: randomUUID(),
          businessId: actor.businessId,
          ...values,
          kind: state.business.kind === "service" ? "service" : "product",
          currency: state.business.currency,
          imageApproved: !!row.image,
          variants: [],
          sourceId: batch.sourceId,
          sourceRecordId: row.sourceId,
          updatedAt: now,
          freshnessHours: source.freshnessHours,
          overrides: [],
          archived: false,
        };
        state.catalog.push(product);
      }
    }
    if (retireMissing) {
      if (!batch.complete)
        throw new IntegrationError(
          "partial_snapshot",
          "This source snapshot is bounded or incomplete. Missing records cannot be retired.",
        );
      const ids = new Set(batch.candidates.map((row) => row.sourceId));
      for (const product of state.catalog)
        if (
          product.sourceId === batch.sourceId &&
          !ids.has(product.sourceRecordId)
        )
          product.archived = true;
    }
    batch.status = "published";
    batch.publishedAt = now;
    source.status = "connected";
    source.lastSuccess = now;
    source.mapping = batch.mapping;
    source.mappingVersion = batch.mappingVersion;
    source.error = undefined;
    const visible = state.sources.find((item) => item.id === source.id);
    if (visible) {
      visible.status = "ready";
      visible.lastSyncAt = now;
      visible.mapping = batch.mapping as Record<string, string>;
      visible.error = undefined;
      visible.history.unshift({
        id: randomUUID(),
        at: now,
        status: "published",
        rows: batch.candidates.length,
      });
    }
    integrationAudit(state, actor, "import.publish", batch.id);
    return {
      imported: batch.candidates.length,
      errors: batch.errors,
      duplicate: false,
    };
  });
}
export async function connectDatabase(
  actor: Actor,
  kind: "mysql" | "postgresql",
  name: string,
  input: unknown,
) {
  assertManager(actor);
  if (actor.demo)
    throw new IntegrationError(
      "demo_connection_disabled",
      "The isolated demo uses fixtures. Sign in to a configured instance to connect a database.",
      409,
    );
  const config = databaseConfigSchema.parse(input),
    snapshot = await readDatabase(kind, config),
    id = randomUUID();
  await transactBusiness(actor, (state) => {
    if (
      state.sources.length >=
      planById(state.billing.subscription.planId).sources
    )
      throw new IntegrationError(
        "source_limit",
        "The source limit is reached.",
        403,
      );
    const source: SourceRecord = {
      id,
      name,
      kind,
      status: "review",
      credential: encryptCredential(config, actor.businessId, id),
      mappingVersion: 0,
      freshnessHours: 24,
      syncMinutes: planById(state.billing.subscription.planId).syncMinutes,
    };
    integrationState(state).sources.push(source);
    state.sources.push({
      id,
      businessId: actor.businessId,
      name,
      type: kind,
      status: "review",
      rowCount: snapshot.rows.length,
      lastSyncAt: null,
      freshnessHours: 24,
      history: [],
    });
    integrationAudit(state, actor, "source.connect", id);
  });
  return {
    batch: await createImport(
      actor,
      snapshot.rows,
      name,
      kind,
      id,
      snapshot.complete,
    ),
  };
}
export async function connectGoogleSource(
  actor: Actor,
  name: string,
  spreadsheetId: string,
  sheetName: string,
) {
  assertManager(actor);
  const state = await readBusiness(actor),
    oauth = integrationState(state).sources.find(
      (source) =>
        source.id === "google-authorization" && source.status === "connected",
    );
  if (!oauth?.credential)
    throw new IntegrationError(
      "google_not_connected",
      "Connect your Google account first.",
      409,
    );
  const credential = await refreshGoogle(
      decryptCredential<GoogleCredential>(
        oauth.credential,
        actor.businessId,
        oauth.id,
      ),
    ),
    snapshot = await readGoogleSheet(credential, spreadsheetId, sheetName),
    id = randomUUID();
  await transactBusiness(actor, (state) => {
    if (
      state.sources.length >=
      planById(state.billing.subscription.planId).sources
    )
      throw new IntegrationError(
        "source_limit",
        "The source limit is reached.",
        403,
      );
    integrationState(state).sources.push({
      id,
      name,
      kind: "google_sheets",
      status: "review",
      options: { spreadsheetId, sheetName },
      mappingVersion: 0,
      freshnessHours: 24,
      syncMinutes: planById(state.billing.subscription.planId).syncMinutes,
    });
    state.sources.push({
      id,
      businessId: actor.businessId,
      name,
      type: "google_sheets",
      status: "review",
      rowCount: snapshot.rows.length,
      lastSyncAt: null,
      freshnessHours: 24,
      history: [],
    });
    integrationState(state).sources.find(
      (item) => item.id === oauth.id,
    )!.credential = encryptCredential(credential, actor.businessId, oauth.id);
  });
  return {
    batch: await createImport(
      actor,
      snapshot.rows,
      name,
      "google_sheets",
      id,
      snapshot.complete,
    ),
  };
}
export async function syncSource(actor: Actor, id: string) {
  assertManager(actor);
  const state = await readBusiness(actor),
    source = integrationState(state).sources.find(
      (source) => source.id === id && source.status !== "disconnected",
    );
  if (!source)
    throw new IntegrationError(
      "source_not_found",
      "Data source not found.",
      404,
    );
  await transactBusiness(actor, (state) => {
    const data = integrationState(state);
    enforceRate(
      data,
      `sync:${id}`,
      1,
      Math.max(60, source.syncMinutes) * 60_000,
    );
  });
  try {
    let snapshot;
    if (source.kind === "mysql" || source.kind === "postgresql") {
      if (!source.credential)
        throw new IntegrationError(
          "source_credential",
          "Reconnect this database.",
          409,
        );
      snapshot = await readDatabase(
        source.kind,
        decryptCredential<DatabaseConfig>(
          source.credential,
          actor.businessId,
          id,
        ),
      );
    } else if (source.kind === "google_sheets") {
      const auth = integrationState(state).sources.find(
        (item) =>
          item.id === "google-authorization" && item.status === "connected",
      );
      if (!auth?.credential)
        throw new IntegrationError(
          "google_not_connected",
          "Reconnect Google Sheets.",
          409,
        );
      const credential = await refreshGoogle(
        decryptCredential<GoogleCredential>(
          auth.credential,
          actor.businessId,
          auth.id,
        ),
      );
      snapshot = await readGoogleSheet(
        credential,
        String(source.options?.spreadsheetId),
        String(source.options?.sheetName),
      );
      await transactBusiness(actor, (state) => {
        const current = integrationState(state).sources.find(
          (item) => item.id === auth.id,
        );
        if (current?.status === "connected")
          current.credential = encryptCredential(
            credential,
            actor.businessId,
            auth.id,
          );
      });
    } else
      throw new IntegrationError(
        "snapshot_replace",
        "Uploaded files are snapshots. Upload a replacement using the same source ID.",
      );
    return {
      batch: await createImport(
        actor,
        snapshot.rows,
        source.name,
        source.kind,
        id,
        snapshot.complete,
      ),
    };
  } catch (error) {
    await transactBusiness(actor, (state) => {
      const source = integrationState(state).sources.find(
        (item) => item.id === id,
      );
      if (source) {
        source.status = "needs_attention";
        source.error =
          error instanceof IntegrationError
            ? error.message
            : "Source connection failed. Check access, TLS and network reachability.";
      }
      const visible = state.sources.find((item) => item.id === id);
      if (visible) {
        visible.status = "error";
        visible.error = source?.error;
        visible.history.unshift({
          id: randomUUID(),
          at: new Date().toISOString(),
          status: "failed",
          rows: 0,
          error: source?.error,
        });
      }
    });
    throw error;
  }
}
export async function disconnectSource(actor: Actor, id: string) {
  assertManager(actor);
  await transactBusiness(actor, (state) => {
    const source = integrationState(state).sources.find(
      (item) => item.id === id,
    );
    if (!source)
      throw new IntegrationError(
        "source_not_found",
        "Data source not found.",
        404,
      );
    source.status = "disconnected";
    delete source.credential;
    const visible = state.sources.find((item) => item.id === id);
    if (visible) visible.status = "disconnected";
    integrationAudit(state, actor, "source.disconnect", id);
  });
  return { disconnected: true };
}
