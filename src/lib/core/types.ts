export type Role = "owner" | "admin" | "agent";
export type ChannelKind = "messenger" | "instagram" | "whatsapp" | "website";
export type Actor = {
  userId: string;
  businessId: string;
  role: Role;
  demo: boolean;
  csrfToken: string;
  service?: boolean;
};
export type Currency = "BDT" | "USD" | "EUR" | "GBP" | "INR";
export type Business = {
  id: string;
  name: string;
  kind: "retail" | "service";
  timezone: string;
  currency: Currency;
  dashboardLanguage: "en" | "bn";
  onboardingStep: number;
  retentionDays: number;
  createdAt: string;
  deletedAt?: string;
  allowedWidgetOrigins: string[];
};
export type Product = {
  id: string;
  businessId: string;
  name: string;
  description: string;
  sku: string;
  kind: "product" | "service";
  priceMinor: number;
  currency: Currency;
  stock: number | null;
  image: string;
  imageApproved: boolean;
  attributes: Record<string, string>;
  variants: {
    id: string;
    name: string;
    priceMinor: number;
    stock: number | null;
  }[];
  sourceId: string;
  sourceRecordId: string;
  updatedAt: string;
  freshnessHours: number;
  overrides: string[];
  archived: boolean;
};
export type Knowledge = {
  id: string;
  businessId: string;
  title: string;
  content: string;
  status: "draft" | "published" | "archived";
  source: string;
  version: number;
  updatedAt: string;
};
export type TemporaryRule = {
  id: string;
  businessId: string;
  title: string;
  scope: "shipping" | "hours" | "orders" | "general";
  startsAt: string;
  endsAt: string;
  timezone: string;
  priority: number;
  status: "draft" | "scheduled" | "active" | "expired" | "cancelled";
  acceptOrders: boolean;
  dispatchResumesAt: string | null;
  explanation: string;
};
export type Message = {
  id: string;
  role: "customer" | "assistant" | "staff" | "system";
  text: string;
  createdAt: string;
  status: "received" | "queued" | "sent" | "failed" | "uncertain";
  sourceIds?: string[];
  providerId?: string;
};
export type Conversation = {
  id: string;
  businessId: string;
  customerName: string;
  customerId: string;
  channel: ChannelKind;
  status: "ai" | "manual" | "handover";
  assignedTo: string | null;
  unread: boolean;
  updatedAt: string;
  lastInboundAt: string;
  messages: Message[];
  handoverReason?: string;
  generation: number;
};
export type ChannelConnection = {
  id: string;
  businessId: string;
  kind: ChannelKind;
  label: string;
  status:
    | "not_configured"
    | "authorization_pending"
    | "connected"
    | "needs_attention"
    | "disconnected"
    | "automation_paused";
  automationEnabled: boolean;
  simulated: boolean;
  accountName?: string;
  accountId?: string;
  lastCheckedAt?: string;
  error?: string;
};
export type AssistantStyle = {
  tone: "warm" | "professional" | "concise";
  languages: ("en" | "bn" | "banglish")[];
  replyLength: "short" | "balanced";
  maxDiscountPercent: number;
  handoverOnUncertainty: boolean;
  advancedInstructions: string;
  greeting: string;
};
export type DataSource = {
  id: string;
  businessId: string;
  name: string;
  type: "csv" | "xlsx" | "google_sheets" | "mysql" | "postgresql" | "history";
  status: "review" | "ready" | "syncing" | "error" | "disconnected";
  rowCount: number;
  lastSyncAt: string | null;
  error?: string;
  freshnessHours: number;
  mapping?: Record<string, string>;
  history: {
    id: string;
    at: string;
    status: string;
    rows: number;
    error?: string;
  }[];
};
export type PlanId = "free" | "starter" | "growth" | "scale";
export type Plan = {
  id: PlanId;
  name: string;
  priceMinor: number | null;
  currency: "BDT";
  replies: number;
  catalog: number;
  seats: number;
  sources: number;
  storageMb: number;
  syncMinutes: number;
  purchasable: boolean;
};
export type Subscription = {
  id: string;
  planId: PlanId;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  allowance: number;
  cancelAtPeriodEnd: boolean;
  status: "active" | "expired";
  pendingPlanId?: PlanId;
};
export type Checkout = {
  id: string;
  businessId: string;
  planId: PlanId;
  amountMinor: number;
  currency: "BDT";
  provider: "mock";
  paymentMode: "mock";
  status: "pending" | "succeeded" | "failed" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  subscriptionId: string;
  periodId: string;
  eventIds: string[];
  purpose: "upgrade" | "renewal";
  receipt?: string;
};
export type UsageReservation = {
  id: string;
  businessId: string;
  responseId: string;
  periodId: string;
  status: "reserved" | "committed" | "released" | "reversed";
  createdAt: string;
  updatedAt: string;
};
export type Billing = {
  subscription: Subscription;
  checkouts: Checkout[];
  reservations: UsageReservation[];
  usage: { periodId: string; used: number; reserved: number }[];
  events: { id: string; kind: string; at: string; description: string }[];
};
export type AuditEvent = {
  id: string;
  businessId: string;
  actorId: string;
  action: string;
  at: string;
  targetId?: string;
};
export type BusinessState = {
  schemaVersion: 1;
  revision: number;
  business: Business;
  members: { userId: string; name: string; email: string; role: Role }[];
  catalog: Product[];
  knowledge: Knowledge[];
  rules: TemporaryRule[];
  conversations: Conversation[];
  channels: ChannelConnection[];
  sources: DataSource[];
  settings: {
    draft: AssistantStyle;
    published: AssistantStyle;
    version: number;
    publishedAt: string | null;
  };
  billing: Billing;
  audit: AuditEvent[];
  integrations: Record<string, unknown>;
};
export type PublicWorkspace = Omit<BusinessState, "integrations">;
export type WorkspaceResponse = {
  workspace: PublicWorkspace;
  actor: Omit<Actor, "csrfToken" | "service">;
  csrfToken: string;
  plans: Plan[];
};
