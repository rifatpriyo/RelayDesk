export type SocialChannel = "messenger" | "instagram" | "whatsapp";
export type SourceKind =
  | "csv"
  | "xlsx"
  | "google_sheets"
  | "postgresql"
  | "mysql"
  | "document"
  | "history";
export type ColumnMapping = Partial<
  Record<
    | "sourceId"
    | "sku"
    | "name"
    | "description"
    | "price"
    | "currency"
    | "stock"
    | "image"
    | "category"
    | "variant",
    string
  >
>;
export type ImportRow = Record<string, string>;
export type CatalogCandidate = {
  sourceId: string;
  sku: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  stock: number | null;
  image: string;
  category: string;
  variant: string;
  attributes: Record<string, string>;
  row: number;
  hash: string;
};
export type RowError = { row: number; field: string; message: string };
export type ImportBatch = {
  id: string;
  sourceId: string;
  name: string;
  kind: SourceKind;
  status: "review" | "published" | "failed";
  createdAt: string;
  publishedAt?: string;
  headers: string[];
  rows: ImportRow[];
  mapping: ColumnMapping;
  candidates: CatalogCandidate[];
  errors: RowError[];
  hash: string;
  complete: boolean;
  mappingVersion: number;
};
export type SourceRecord = {
  id: string;
  name: string;
  kind: SourceKind;
  status: "review" | "connected" | "needs_attention" | "disconnected";
  credential?: string;
  options?: Record<string, unknown>;
  lastSuccess?: string;
  error?: string;
  nextSyncAt?: string;
  mapping?: ColumnMapping;
  mappingVersion: number;
  freshnessHours: number;
  syncMinutes: number;
};
export type NormalizedEvent = {
  id: string;
  channel: SocialChannel;
  assetId: string;
  customerId: string;
  timestamp: number;
  kind: "message" | "echo" | "status" | "unsupported";
  text?: string;
  providerMessageId: string;
  status?: "sent" | "delivered" | "read" | "failed";
  failureCode?: string;
};
export type ChannelConnection = {
  id: string;
  channel: SocialChannel;
  assetId: string;
  name: string;
  wabaId?: string;
  credential: string;
  expiresAt?: number;
  state: "connected" | "needs_attention" | "disconnected";
  active: boolean;
  permissions: string[];
  verifiedAt: string;
  revision: number;
};
export type OAuthAttempt = {
  stateHash: string;
  provider: SocialChannel | "google";
  userId: string;
  expiresAt: number;
  verifier?: string;
  consumed?: boolean;
  candidateCredential?: string;
  candidates?: { id: string; name: string; wabaId?: string }[];
};
export type InboundJob = {
  id: string;
  event: NormalizedEvent;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  attempts: number;
  error?: string;
  leaseUntil?: number;
  responseId: string;
  conversationId?: string;
  runId?: string;
};
export type OutboundRecord = {
  id: string;
  jobId: string;
  channel: SocialChannel;
  connectionId: string;
  conversationId: string;
  customerId: string;
  text: string;
  mode: "ai" | "human";
  status:
    | "prepared"
    | "sending"
    | "accepted"
    | "delivered"
    | "read"
    | "failed"
    | "ambiguous"
    | "cancelled";
  providerId?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  revision: number;
  rulesFingerprint?: string;
  billed?: boolean;
  reversed?: boolean;
  parentResponseId?: string;
  imageProductId?: string;
  imageReference?: string;
};
export type WidgetConfig = {
  id: string;
  active: boolean;
  allowedOrigins: string[];
  title: string;
};
export type WidgetSession = {
  id: string;
  tokenHash: string;
  origin: string;
  expiresAt: number;
  createdAt: number;
  count: number;
  windowStart: number;
  conversationId: string;
  responses: Record<
    string,
    { text: string; handover: boolean; at: number; simulated?: boolean }
  >;
};
export type SpendRecord = {
  id: string;
  day: string;
  purpose: "playground" | "customer" | "import";
  reservedMicros: number;
  actualMicros?: number;
  status: "reserved" | "settled" | "uncertain";
  promptTokens?: number;
  completionTokens?: number;
};
export type IntegrationState = {
  sources: SourceRecord[];
  imports: ImportBatch[];
  connections: ChannelConnection[];
  oauth: OAuthAttempt[];
  inbox: InboundJob[];
  outbox: OutboundRecord[];
  spend: SpendRecord[];
  widget?: WidgetConfig;
  sessions: WidgetSession[];
  counters: Record<string, { count: number; start: number }>;
};
export function integrationState(state: {
  integrations: Record<string, unknown>;
}): IntegrationState {
  const existing = state.integrations.relaydesk as IntegrationState | undefined;
  if (existing) return existing;
  const created: IntegrationState = {
    sources: [],
    imports: [],
    connections: [],
    oauth: [],
    inbox: [],
    outbox: [],
    spend: [],
    sessions: [],
    counters: {},
  };
  state.integrations.relaydesk = created;
  return created;
}
export function enforceRate(
  state: IntegrationState,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  let bucket = state.counters[key];
  if (!bucket || now - bucket.start >= windowMs)
    bucket = state.counters[key] = { count: 0, start: now };
  if (bucket.count >= limit)
    throw new Error(
      "This action is temporarily rate limited. Please try again later.",
    );
  bucket.count++;
  for (const [id, value] of Object.entries(state.counters))
    if (now - value.start > 86_400_000) delete state.counters[id];
}
