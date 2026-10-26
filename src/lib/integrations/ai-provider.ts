import "server-only";
import type { Actor } from "../core/types";
import {
  transactBusiness,
  reserveGlobalSpend,
  settleGlobalSpend,
} from "../core/server";
import { IntegrationError, boundedJson } from "./security";
import { integrationState, type SpendRecord } from "./types";
function positive(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new IntegrationError(
      "configuration_required",
      `Operator configuration ${name} must be a positive integer.`,
      503,
    );
  return value;
}
export async function boundedModelJson(
  actor: Actor,
  options: {
    id: string;
    purpose: "customer" | "playground" | "import";
    messages: { role: string; content: string }[];
    outputLimit: number;
  },
) {
  if (
    process.env.AI_PROVIDER !== "deepseek" ||
    process.env.REAL_INFERENCE_ENABLED !== "true" ||
    !process.env.DEEPSEEK_API_KEY
  )
    throw new IntegrationError(
      "inference_disabled",
      "Real AI requires explicit operator enablement and independent budgets.",
      503,
    );
  const inputBound = Buffer.byteLength(JSON.stringify(options.messages)) + 512,
    outputBound = options.outputLimit;
  if (inputBound > 24_000 || outputBound > 600)
    throw new IntegrationError(
      "context_limit",
      "This model request exceeds the bounded context.",
    );
  const inputRate = positive("DEEPSEEK_INPUT_USD_MICROS_PER_MILLION"),
    outputRate = positive("DEEPSEEK_OUTPUT_USD_MICROS_PER_MILLION"),
    maxCost = Math.ceil(
      (inputBound * inputRate + outputBound * outputRate) / 1_000_000,
    ),
    day = new Date().toISOString().slice(0, 10),
    id = options.id;
  const purposeLimit = positive(
    options.purpose === "playground"
      ? "AI_TEST_DAILY_BUDGET_USD_MICROS"
      : options.purpose === "import"
        ? "AI_IMPORT_DAILY_BUDGET_USD_MICROS"
        : "AI_BUSINESS_DAILY_BUDGET_USD_MICROS",
  );
  const url = new URL(
    process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  );
  if (
    url.origin !== "https://api.deepseek.com" ||
    !["/", "/v1", "/v1/"].includes(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new IntegrationError(
      "provider_origin",
      "DeepSeek must use the official HTTPS API origin.",
      503,
    );
  await transactBusiness(actor, (draft) => {
    const data = integrationState(draft);
    if (data.spend.some((item) => item.id === id))
      throw new IntegrationError(
        "inference_already_attempted",
        "This response already has a model attempt. Reconcile before retrying.",
        409,
      );
    const today = data.spend.filter((item) => item.day === day),
      cost = (items: SpendRecord[]) =>
        items.reduce(
          (sum, item) => sum + (item.actualMicros ?? item.reservedMicros),
          0,
        );
    if (
      cost(today) + maxCost > positive("AI_BUSINESS_DAILY_BUDGET_USD_MICROS") ||
      cost(today.filter((item) => item.purpose === options.purpose)) + maxCost >
        purposeLimit
    )
      throw new IntegrationError(
        "spend_limit",
        "The independent real AI spending limit is reached.",
        429,
      );
    data.spend.push({
      id,
      day,
      purpose: options.purpose,
      reservedMicros: maxCost,
      status: "reserved",
    });
  });
  try {
    await reserveGlobalSpend(
      id,
      actor.businessId,
      day,
      maxCost,
      positive("AI_GLOBAL_DAILY_BUDGET_USD_MICROS"),
    );
  } catch (error) {
    await transactBusiness(actor, (draft) => {
      const item = integrationState(draft).spend.find(
        (item) => item.id === id,
      )!;
      item.status = "settled";
      item.actualMicros = 0;
    });
    throw error;
  }
  try {
    const model = process.env.DEEPSEEK_MODEL || "deepseek-flash",
      response = await fetch(
        `${url.toString().replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: options.messages,
            max_tokens: outputBound,
            thinking: { type: "disabled" },
            temperature: 0,
            response_format: { type: "json_object" },
            stream: false,
          }),
          signal: AbortSignal.timeout(20_000),
          redirect: "error",
        },
      );
    if (!response.ok)
      throw new IntegrationError(
        "provider_error",
        `DeepSeek returned HTTP ${response.status}. No automatic retry was made.`,
        502,
      );
    const value = await boundedJson(response, 60_000),
      usage = value.usage;
    if (
      !Number.isSafeInteger(usage?.prompt_tokens) ||
      !Number.isSafeInteger(usage?.completion_tokens) ||
      usage.prompt_tokens < 0 ||
      usage.completion_tokens < 0
    )
      throw new IntegrationError(
        "provider_usage",
        "DeepSeek omitted valid usage. Maximum spend remains reserved.",
        502,
      );
    const actual = Math.ceil(
      (usage.prompt_tokens * inputRate + usage.completion_tokens * outputRate) /
        1_000_000,
    );
    await transactBusiness(actor, (draft) => {
      const item = integrationState(draft).spend.find(
        (item) => item.id === id,
      )!;
      Object.assign(item, {
        status: "settled",
        actualMicros: actual,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
      });
    });
    await settleGlobalSpend(id, actual);
    let result: unknown;
    try {
      if (value.choices?.[0]?.finish_reason !== "stop") throw new Error();
      result = JSON.parse(value.choices[0].message.content);
    } catch {
      throw new IntegrationError(
        "provider_output",
        "The model returned incomplete or invalid JSON. Review manually.",
        502,
      );
    }
    return {
      result,
      model,
      usage: {
        promptTokens: usage.prompt_tokens as number,
        completionTokens: usage.completion_tokens as number,
        costMicros: actual,
      },
    };
  } catch (error) {
    await transactBusiness(actor, (draft) => {
      const record = integrationState(draft).spend.find(
        (item) => item.id === id,
      );
      if (record?.status === "reserved") record.status = "uncertain";
    });
    throw error;
  }
}
