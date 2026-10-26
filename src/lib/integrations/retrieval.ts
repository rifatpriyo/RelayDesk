import type { BusinessState, Product, TemporaryRule } from "../core/types";

export type Language = "en" | "bn" | "banglish";
export type Evidence = {
  id: string;
  kind: "catalog" | "knowledge" | "rule";
  text: string;
  source: string;
  version: string;
  updatedAt: string;
  stale: boolean;
  product?: Product;
  variant?: Product["variants"][number];
  rule?: TemporaryRule;
};
export type Retrieval = {
  businessId: string;
  question: string;
  language: Language;
  evidence: Evidence[];
  outcome: "answer" | "clarify" | "handover";
  reason: string;
  asOf: string;
};
const equivalent: Record<string, string> = {
  dam: "price",
  daam: "price",
  দাম: "price",
  মূল্য: "price",
  koto: "price",
  কত: "price",
  ডেলিভারি: "delivery",
  পাঠানো: "shipping",
  delivery: "shipping",
  dispatch: "shipping",
  courier: "shipping",
  shipping: "shipping",
  পাঞ্জাবি: "panjabi",
  punjabi: "panjabi",
  kurta: "panjabi",
  kurti: "kurti",
  কুর্তি: "kurti",
  ব্যাগ: "tote",
  bag: "tote",
  scarf: "scarf",
  ওড়না: "scarf",
  স্টক: "stock",
  ache: "stock",
  আছে: "stock",
  available: "stock",
  availability: "stock",
  ফেরত: "return",
  বদল: "exchange",
  বিনিময়: "exchange",
  deliverycharge: "shipping",
  ঈদ: "holiday",
  eid: "holiday",
  ছুটি: "holiday",
  holiday: "holiday",
  বন্ধ: "holiday",
  রিটার্ন: "return",
  ফ্রি: "free",
  discount: "discount",
  ছাড়: "discount",
  ছাড়: "discount",
  service: "service",
  সার্ভিস: "service",
  এসি: "ac",
  technician: "staff",
  মানুষ: "staff",
  human: "staff",
  agent: "staff",
  staff: "staff",
  কর্মী: "staff",
  refund: "refund",
  রিফান্ড: "refund",
};
const ignored = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "in",
  "of",
  "for",
  "to",
  "it",
  "my",
  "your",
  "you",
  "please",
  "can",
  "i",
  "me",
  "do",
  "have",
  "what",
  "how",
  "want",
  "with",
  "er",
  "ki",
  "ta",
  "amake",
  "eta",
  "এই",
  "কি",
  "কী",
  "একটি",
  "আমি",
  "আমার",
  "আপনার",
  "আমাকে",
  "হবে",
]);
export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[০-৯]/g, (char) => String("০১২৩৪৫৬৭৮৯".indexOf(char)))
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, " ")
    .trim();
}
export function terms(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((word) => word && !ignored.has(word))
    .map(
      (word) =>
        equivalent[equivalent[word] || word] || equivalent[word] || word,
    );
}
export function detectLanguage(value: string): Language {
  if (/[\u0980-\u09ff]/.test(value)) return "bn";
  if (
    /\b(koto|ache|nai|chai|diben|hobe|apnar|amar|er|ki|kobe|korbo)\b/i.test(
      value,
    )
  )
    return "banglish";
  return "en";
}
export function activeRules(
  rules: TemporaryRule[],
  businessId: string,
  now: Date,
): TemporaryRule[] {
  const at = now.getTime();
  return rules
    .filter(
      (rule) =>
        rule.businessId === businessId &&
        !["draft", "cancelled", "expired"].includes(rule.status) &&
        Date.parse(rule.startsAt) <= at &&
        at < Date.parse(rule.endsAt),
    )
    .sort((a, b) => b.priority - a.priority);
}
function score(query: string[], content: string): number {
  const words = new Set(terms(content));
  return query.reduce((sum, word) => sum + (words.has(word) ? 1 : 0), 0);
}
const productIntentWords = new Set([
  "price",
  "stock",
  "shipping",
  "return",
  "exchange",
  "discount",
  "holiday",
  "photo",
  "picture",
  "image",
  "show",
]);
const sizeAliases: Record<string, string> = {
  small: "s",
  medium: "m",
  large: "l",
  extralarge: "xl",
  মিডিয়াম: "m",
  মিডিয়াম: "m",
  মাঝারি: "m",
  ছোট: "s",
  বড়: "l",
  বড়: "l",
};
function variantTerms(value: string) {
  return normalize(value)
    .replace(/extra large/g, "extralarge")
    .split(/\s+/)
    .map((word) => sizeAliases[word] || word);
}
function matchingVariants(product: Product, question: string) {
  const words = new Set(variantTerms(question));
  return product.variants.filter((variant) => {
    const names = variantTerms(variant.name);
    return names.length > 0 && names.every((word) => words.has(word));
  });
}
export function retrieve(
  state: BusinessState,
  question: string,
  now = new Date(),
): Retrieval {
  const businessId = state.business.id,
    language = detectLanguage(question),
    query = terms(question),
    evidence: Evidence[] = [];
  const result: Retrieval = {
    businessId,
    question: question.slice(0, 2000),
    language,
    evidence,
    outcome: "answer",
    reason: "",
    asOf: now.toISOString(),
  };
  if (
    /(ignore (all|previous|system)|system prompt|api.?key|password|credential|another business|other business|tenant|database dump|নির্দেশ.*উপেক্ষা|পাসওয়ার্ড)/i.test(
      question,
    )
  )
    return { ...result, outcome: "handover", reason: "privacy_boundary" };
  if (
    query.includes("staff") ||
    /(talk to someone|speak to|মানুষের সাথে|কারো সাথে কথা)/i.test(question)
  )
    return {
      ...result,
      outcome: "handover",
      reason: "customer_requested_staff",
    };
  if (
    /(order\s*(status|number|#|id)|track.*order|my order|আমার অর্ডার|payment|refund|booking|book an|appointment.*confirm)/i.test(
      question,
    )
  )
    return {
      ...result,
      outcome: "handover",
      reason: "verified_customer_or_staff_required",
    };
  const products = state.catalog.filter(
    (product) => product.businessId === businessId && !product.archived,
  );
  const exact = products.filter(
    (product) =>
      normalize(product.sku) &&
      ` ${normalize(question)} `.includes(` ${normalize(product.sku)} `),
  );
  // Intent words such as "stock" must not make an unrelated product's description a match.
  const productQuery = query.filter((word) => !productIntentWords.has(word));
  const ranked = (exact.length ? exact : products)
    .map((product) => ({
      product,
      rank: exact.length
        ? 100
        : score(productQuery, `${product.name} ${product.sku}`) * 3 +
          score(productQuery, product.description),
    }))
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank);
  const intentPrice =
    (query.includes("price") || query.includes("stock")) &&
    !query.includes("shipping") &&
    !query.includes("exchange") &&
    !query.includes("return");
  if (query.includes("discount") || query.includes("refund"))
    return {
      ...result,
      outcome: "handover",
      reason: "staff_approval_required",
    };
  if (ranked.length > 1 && ranked[0].rank === ranked[1].rank && intentPrice)
    return { ...result, outcome: "clarify", reason: "ambiguous_product" };
  if (intentPrice && !ranked.length)
    return { ...result, outcome: "clarify", reason: "missing_product" };
  if (
    ranked[0]?.product.variants.length &&
    matchingVariants(ranked[0].product, question).length !== 1
  )
    return { ...result, outcome: "clarify", reason: "ambiguous_variant" };
  for (const { product } of ranked.slice(0, 2)) {
    const stale =
      now.getTime() - Date.parse(product.updatedAt) >
      product.freshnessHours * 3600_000;
    const variant = matchingVariants(product, question)[0];
    if (product.variants.length && !variant) continue;
    evidence.push({
      id: product.id,
      kind: "catalog",
      text: `${product.name}${variant ? ` (${variant.name})` : ""}: ${product.currency} ${((variant?.priceMinor ?? product.priceMinor) / 100).toFixed(2)}. ${product.description}`,
      source: product.sourceId,
      version: product.updatedAt,
      updatedAt: product.updatedAt,
      stale,
      product,
      variant,
    });
  }
  // Only published, tenant-qualified records. Historical drafts never participate.
  const approved = state.knowledge.filter(
    (entry) =>
      entry.businessId === businessId &&
      entry.status === "published" &&
      !/(ignore (all|previous|system)|system prompt|api.?key|password|credential|execute sql|switch tenant)/i.test(
        entry.content,
      ),
  );
  for (const { entry } of approved
    .map((entry) => ({
      entry,
      rank: score(query, `${entry.title} ${entry.content}`),
    }))
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)) {
    // Catalog is the only price/stock authority. A policy mentioning a product price cannot override it.
    if (intentPrice) continue;
    evidence.push({
      id: entry.id,
      kind: "knowledge",
      text: entry.content.slice(0, 1800),
      source: entry.source,
      version: String(entry.version),
      updatedAt: entry.updatedAt,
      stale: false,
    });
  }
  const relevant = activeRules(state.rules, businessId, now).filter(
    (rule) =>
      rule.scope === "general" ||
      (rule.scope === "shipping" &&
        (query.includes("shipping") ||
          query.includes("holiday") ||
          ranked.length > 0)) ||
      (rule.scope === "hours" &&
        /(hour|open|close|সময়|সময়|খোলা)/i.test(question)) ||
      (rule.scope === "orders" && /(order|অর্ডার)/i.test(question)),
  );
  const topByScope = new Map<string, TemporaryRule>();
  for (const rule of relevant) {
    const existing = topByScope.get(rule.scope);
    if (
      existing &&
      existing.priority === rule.priority &&
      existing.explanation !== rule.explanation
    )
      return {
        ...result,
        evidence: [],
        outcome: "handover",
        reason: "conflicting_rules",
      };
    if (!existing) topByScope.set(rule.scope, rule);
  }
  for (const rule of topByScope.values())
    evidence.push({
      id: rule.id,
      kind: "rule",
      text: rule.explanation,
      source: "Owner-approved temporary change",
      version: `${rule.startsAt}/${rule.endsAt}`,
      updatedAt: rule.startsAt,
      stale: false,
      rule,
    });
  if (!evidence.length)
    return { ...result, outcome: "handover", reason: "missing_evidence" };
  return result;
}
const copy = {
  en: {
    clarify:
      "Which product or service do you mean? Please share its name, size or SKU so I can check the right information.",
    handover:
      "I am the business assistant. I do not have enough verified information to answer safely. I have flagged this for our team; you can ask to speak to a person here.",
    greet: "Here is the information approved by our team:",
    stock: "in stock",
    unknown: "Stock needs confirmation from our team.",
    stale:
      "Stock information is out of date; our team needs to confirm availability.",
    pause: "Temporary change:",
    dispatch: "Dispatch resumes",
    noArrival: "This is a dispatch date, not a guaranteed arrival date.",
  },
  bn: {
    clarify:
      "কোন পণ্য বা সেবাটি জানতে চান? সঠিক তথ্য দিতে নাম, সাইজ বা SKU লিখুন।",
    handover:
      "আমি ব্যবসার সহকারী। নিশ্চিত তথ্য ছাড়া উত্তর দিতে পারছি না। বিষয়টি আমাদের টিমের জন্য চিহ্নিত করেছি; এখানে একজন কর্মীর সাহায্য চাইতে পারেন।",
    greet: "আমাদের টিমের অনুমোদিত তথ্য:",
    stock: "টি মজুদ আছে",
    unknown: "মজুদের তথ্য আমাদের টিম নিশ্চিত করবে।",
    stale: "মজুদের তথ্য পুরোনো; আমাদের টিমকে বর্তমান মজুদ নিশ্চিত করতে হবে।",
    pause: "সাময়িক পরিবর্তন:",
    dispatch: "পাঠানো আবার শুরু হবে",
    noArrival: "এটি পাঠানোর তারিখ, পৌঁছানোর নিশ্চয়তা নয়।",
  },
  banglish: {
    clarify:
      "Kon product ba service er kotha bolchen? Name, size ba SKU bolle shothik information dite parbo.",
    handover:
      "Ami business assistant. Verified information chara nishchit bolte parchi na. Amader team er jonno request mark korechi; ekhane staff er help chaite paren.",
    greet: "Amader team er approved information:",
    stock: "ti stock e ache",
    unknown: "Stock amader team confirm korbe.",
    stale:
      "Stock information purono; amader team current availability confirm korbe.",
    pause: "Temporary change:",
    dispatch: "Dispatch abar shuru hobe",
    noArrival: "Eta dispatch date, delivery arrival guarantee noy.",
  },
};
export function renderGroundedReply(
  retrieval: Retrieval,
  selectedIds?: string[],
): { text: string; sourceIds: string[]; handover: boolean } {
  const language = copy[retrieval.language];
  if (retrieval.outcome === "handover")
    return { text: language.handover, sourceIds: [], handover: true };
  if (retrieval.outcome === "clarify")
    return { text: language.clarify, sourceIds: [], handover: false };
  // Rules cannot be removed by the model. Critical figures are rendered from structured catalog only.
  const selected = retrieval.evidence.filter(
    (item) =>
      item.kind === "rule" || !selectedIds || selectedIds.includes(item.id),
  );
  if (!selected.length)
    return { text: language.handover, sourceIds: [], handover: true };
  const lines = selected.map((item) => {
    if (item.product) {
      const product = item.product,
        variant = item.variant,
        quantity = variant ? variant.stock : product.stock;
      const amount = new Intl.NumberFormat(
        retrieval.language === "bn" ? "bn-BD" : "en-BD",
        {
          style: "currency",
          currency: product.currency,
          maximumFractionDigits: 2,
        },
      ).format((variant?.priceMinor ?? product.priceMinor) / 100);
      const stock =
        product.kind === "service"
          ? ""
          : item.stale
            ? language.stale
            : quantity === null
              ? language.unknown
              : `${quantity} ${language.stock}.`;
      return `${product.name}${variant ? ` (${variant.name})` : ""} — ${amount}. ${stock}`;
    }
    if (item.rule) {
      const dispatch = item.rule.dispatchResumesAt
        ? ` ${language.dispatch}: ${new Intl.DateTimeFormat(retrieval.language === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: item.rule.timezone }).format(new Date(item.rule.dispatchResumesAt))} (${item.rule.timezone}). ${language.noArrival}`
        : "";
      return `${language.pause} ${item.text}${dispatch}`;
    }
    return item.text;
  });
  return {
    text: `${language.greet}\n${lines.join("\n\n")}`.slice(0, 3900),
    sourceIds: selected.map((item) => item.id),
    handover: false,
  };
}
/** Optional future embedding provider. No vectors are generated by the chat API. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], businessId: string): Promise<number[][]>;
}
