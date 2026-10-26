import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { DomainError, invariant } from "./errors";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof ZodError)
    return json(
      {
        error: "VALIDATION_ERROR",
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        requestId,
      },
      400,
    );
  if (error instanceof DomainError)
    return json(
      { error: error.code, message: error.message, requestId },
      error.status,
    );
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      type: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return json(
    {
      error: "INTERNAL_ERROR",
      message:
        "Something went wrong. Try again or contact the operator with this request ID.",
      requestId,
    },
    500,
  );
}
export async function readJson(request: Request, maxBytes = 128000) {
  const size = Number(request.headers.get("content-length") || 0);
  invariant(
    size <= maxBytes,
    "PAYLOAD_TOO_LARGE",
    "This request is too large.",
    413,
  );
  const raw = await request.text();
  invariant(
    Buffer.byteLength(raw) <= maxBytes,
    "PAYLOAD_TOO_LARGE",
    "This request is too large.",
    413,
  );
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError(
      "INVALID_JSON",
      "The request must contain valid JSON.",
    );
  }
}
const buckets = new Map<string, { count: number; reset: number }>();
/** Instance-local shield; production routes also use persistent quotas for paid operations. */
export function rateLimit(key: string, limit = 60, windowMs = 60000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  invariant(
    ++b.count <= limit,
    "RATE_LIMIT",
    "Too many requests. Please wait and try again.",
    429,
  );
  if (buckets.size > 10000)
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
}
