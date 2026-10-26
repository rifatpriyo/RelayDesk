import type { Actor, BusinessState, PlanId, Product } from "./types";
import { planById } from "./plans";
export const DEMO_RETAIL_ID = "a1111111-1111-4111-8111-111111111111";
export const DEMO_SERVICE_ID = "b2222222-2222-4222-8222-222222222222";
export const DEMO_USER_ID = "d3333333-3333-4333-8333-333333333333";
export function emptyBusiness(
  id: string,
  userId: string,
  name: string,
  kind: "retail" | "service" = "retail",
  now = new Date(),
): BusinessState {
  const at = now.toISOString();
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const style = {
    tone: "warm" as const,
    languages: ["en", "bn", "banglish"] as ("en" | "bn" | "banglish")[],
    replyLength: "balanced" as const,
    maxDiscountPercent: 0,
    handoverOnUncertainty: true,
    advancedInstructions: "",
    greeting:
      "Hello! I am the business assistant. I can help with products and policies, or connect you to our team.",
  };
  return {
    schemaVersion: 1,
    revision: 0,
    business: {
      id,
      name,
      kind,
      timezone: "Asia/Dhaka",
      currency: "BDT",
      dashboardLanguage: "en",
      onboardingStep: 0,
      retentionDays: 90,
      createdAt: at,
      allowedWidgetOrigins: [],
    },
    members: [{ userId, name: "Business owner", email: "", role: "owner" }],
    catalog: [],
    knowledge: [],
    rules: [],
    conversations: [],
    sources: [],
    channels: (["messenger", "instagram", "whatsapp", "website"] as const).map(
      (k) => ({
        id: `${id}-${k}`,
        businessId: id,
        kind: k,
        label:
          k === "website" ? "Website chat" : k[0].toUpperCase() + k.slice(1),
        status: "not_configured",
        automationEnabled: false,
        simulated: false,
      }),
    ),
    settings: {
      draft: { ...style },
      published: { ...style },
      version: 0,
      publishedAt: null,
    },
    billing: {
      subscription: {
        id: `subscription-${id}`,
        planId: "free",
        periodId: `period-${at}`,
        periodStart: at,
        periodEnd: end.toISOString(),
        allowance: 200,
        cancelAtPeriodEnd: false,
        status: "active",
      },
      checkouts: [],
      reservations: [],
      usage: [{ periodId: `period-${at}`, used: 0, reserved: 0 }],
      events: [],
    },
    audit: [],
    integrations: {},
  };
}
export function seedBusiness(
  kind: "retail" | "service",
  now = new Date(),
): BusinessState {
  const retail = kind === "retail",
    id = retail ? DEMO_RETAIL_ID : DEMO_SERVICE_ID;
  const s = emptyBusiness(
    id,
    DEMO_USER_ID,
    retail ? "Dhaka Thread" : "Care & Repair",
    kind,
    now,
  );
  const at = now.toISOString();
  s.business.onboardingStep = 4;
  s.members[0] = {
    userId: DEMO_USER_ID,
    name: "Samira Rahman",
    email: "owner@example.test",
    role: "owner",
  };
  s.members.push({
    userId: "agent-demo",
    name: "Rafi Ahmed",
    email: "rafi@example.test",
    role: "agent",
  });
  const items = retail
    ? [
        [
          "Sage Linen Panjabi",
          "PUN-SAGE",
          185000,
          24,
          "/samples/panjabi.svg",
          "Breathable cotton-linen panjabi in sage. Sizes M, L and XL.",
        ],
        [
          "Everyday Cotton Tote",
          "TOTE-NAT",
          45000,
          18,
          "/samples/tote.svg",
          "Natural cotton tote with reinforced handles.",
        ],
        [
          "Ivory Cotton Kurti",
          "KUR-IVORY",
          145000,
          12,
          "/samples/kurti.svg",
          "Soft cotton kurti in ivory. Sizes S, M and L.",
        ],
        [
          "Indigo Handwoven Scarf",
          "SCARF-IND",
          65000,
          null,
          "/samples/scarf.svg",
          "Handwoven cotton scarf. Stock needs confirmation.",
        ],
      ]
    : [
        [
          "Home AC Service",
          "AC-CLEAN",
          120000,
          null,
          "/samples/service.svg",
          "Cleaning and inspection for one residential air conditioner. Parts quoted separately.",
        ],
        [
          "Plumbing Visit",
          "PLUMB-VISIT",
          50000,
          null,
          "/samples/service.svg",
          "A technician assessment visit. Repair and parts quoted after inspection.",
        ],
      ];
  s.catalog = items.map((p, i): Product => ({
    id: `${kind}-product-${i + 1}`,
    businessId: id,
    name: String(p[0]),
    sku: String(p[1]),
    priceMinor: Number(p[2]),
    stock: p[3] === null ? null : Number(p[3]),
    image: String(p[4]),
    description: String(p[5]),
    kind: retail ? "product" : "service",
    currency: "BDT",
    imageApproved: true,
    attributes: retail
      ? { material: "Cotton", origin: "Bangladesh" }
      : { area: "Dhaka" },
    variants: [],
    sourceId: "sample-catalog",
    sourceRecordId: String(p[1]),
    updatedAt: at,
    freshnessHours: 24,
    overrides: [],
    archived: false,
  }));
  s.knowledge = [
    {
      id: `${kind}-faq-delivery`,
      businessId: id,
      title: retail ? "Delivery across Bangladesh" : "Service availability",
      content: retail
        ? "Dhaka delivery costs ৳80; outside Dhaka ৳130. We usually dispatch within two working days. Delivery arrival depends on the courier and cannot be guaranteed."
        : "We serve Dhanmondi, Mohammadpur and nearby Dhaka areas. A staff member confirms appointment availability. The assistant cannot book an appointment.",
      status: "published",
      source: "Owner-approved sample policy",
      version: 1,
      updatedAt: at,
    },
    {
      id: `${kind}-faq-return`,
      businessId: id,
      title: retail ? "Returns and exchanges" : "Service follow-up",
      content: retail
        ? "Unused items with original tags can be exchanged within seven days of delivery. Contact staff with the order reference. Customer-specific order details require staff verification."
        : "Contact our team within seven days if the serviced issue returns. Staff will review the work and arrange next steps.",
      status: "published",
      source: "Owner-approved sample policy",
      version: 1,
      updatedAt: at,
    },
    {
      id: `${kind}-faq-draft`,
      businessId: id,
      title: "Do you offer a bulk discount?",
      content:
        "Draft suggestion from synthetic conversations. Ask the owner to confirm the bulk order policy before publishing.",
      status: "draft",
      source: "Synthetic chat import — review required",
      version: 1,
      updatedAt: at,
    },
  ];
  const future = new Date(now);
  future.setUTCDate(future.getUTCDate() + 14);
  future.setUTCHours(18, 0, 0, 0);
  const futureEnd = new Date(future);
  futureEnd.setUTCDate(futureEnd.getUTCDate() + 4);
  s.rules = [
    {
      id: `${kind}-rule-future`,
      businessId: id,
      title: "Sample holiday dispatch pause",
      scope: "shipping",
      startsAt: future.toISOString(),
      endsAt: futureEnd.toISOString(),
      timezone: "Asia/Dhaka",
      priority: 10,
      status: "scheduled",
      acceptOrders: true,
      dispatchResumesAt: futureEnd.toISOString(),
      explanation:
        "This is a sample owner-selected closure. Requests are welcome; dispatch resumes after the pause. Arrival dates depend on the courier.",
    },
    {
      id: `${kind}-rule-expired`,
      businessId: id,
      title: "Previous sample opening-hours change",
      scope: "hours",
      startsAt: "2025-01-01T00:00:00+06:00",
      endsAt: "2025-01-02T00:00:00+06:00",
      timezone: "Asia/Dhaka",
      priority: 5,
      status: "expired",
      acceptOrders: true,
      dispatchResumesAt: null,
      explanation: "Expired sample notice; normal hours apply.",
    },
  ];
  s.sources = [
    {
      id: "sample-catalog",
      businessId: id,
      name: "Sample catalog.csv",
      type: "csv",
      status: "ready",
      rowCount: s.catalog.length,
      lastSyncAt: at,
      freshnessHours: 24,
      history: [
        { id: "sample-sync", at, status: "completed", rows: s.catalog.length },
      ],
    },
  ];
  s.channels = s.channels.map((c) => ({
    ...c,
    simulated: true,
    status: c.kind === "website" ? "connected" : "not_configured",
    automationEnabled: c.kind === "website",
    accountName: c.kind === "website" ? "Local demo widget" : undefined,
    lastCheckedAt: at,
  }));
  s.settings.version = 1;
  s.settings.publishedAt = at;
  const names = ["Nusrat Jahan", "Farhan Ahmed", "Mehedi Hasan", "Ayesha Noor"];
  s.conversations = names.map((name, i) => ({
    id: `${kind}-conversation-${i + 1}`,
    businessId: id,
    customerName: name,
    customerId: `synthetic-${kind}-${i}`,
    channel: (["messenger", "instagram", "whatsapp", "website"] as const)[i],
    status: i === 2 ? "handover" : "ai",
    assignedTo: null,
    unread: i < 2,
    updatedAt: new Date(now.getTime() - i * 600000).toISOString(),
    lastInboundAt: at,
    generation: 0,
    handoverReason: i === 2 ? "Customer requested a team member" : undefined,
    messages: [
      {
        id: `${kind}-msg-${i}-1`,
        role: "customer",
        text: retail
          ? [
              "Is the sage panjabi available in medium?",
              "ঢাকায় ডেলিভারি চার্জ কত?",
              "I need help with an exchange. Can I talk to someone?",
              "Tote bag er price koto?",
            ][i]
          : [
              "Can you service an AC in Dhanmondi?",
              "সার্ভিসের দাম কত?",
              "Please connect me to a technician.",
              "When are appointments available?",
            ][i],
        createdAt: at,
        status: "received",
      },
      {
        id: `${kind}-msg-${i}-2`,
        role: "assistant",
        text:
          i === 2
            ? "I have passed your request to our team. Someone will help you here."
            : retail
              ? [
                  "The Sage Linen Panjabi is ৳1,850. We carry M, L and XL. Would you like our team to confirm your size?",
                  "ঢাকার মধ্যে ডেলিভারি চার্জ ৮০ টাকা। সাধারণত দুই কর্মদিবসের মধ্যে পাঠানো হয়।",
                  "",
                  "Everyday Cotton Tote er price ৳450. Apni ki aro details chan?",
                ][i]
              : "Our team can help. Please share the service you need and your area.",
        createdAt: at,
        status: "sent",
        sourceIds: [s.catalog[0].id],
      },
    ],
  }));
  return s;
}
export function demoActor(
  kind: "retail" | "service" = "retail",
  role: Actor["role"] = "owner",
): Actor {
  return {
    userId: role === "agent" ? "agent-demo" : DEMO_USER_ID,
    businessId: kind === "retail" ? DEMO_RETAIL_ID : DEMO_SERVICE_ID,
    role,
    demo: true,
    csrfToken: "test-csrf",
  };
}
export function setSeedPlan(s: BusinessState, id: PlanId) {
  s.billing.subscription.planId = id;
  s.billing.subscription.allowance = planById(id).replies;
}
