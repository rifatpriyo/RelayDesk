import "server-only";
import { z } from "zod";
import {
  assertManager,
  getRequestContext,
  requireSameOrigin,
} from "../core/server";
import { IntegrationError } from "./security";
export async function ownerRequest(request: Request) {
  const actor = await getRequestContext(request);
  assertManager(actor);
  if (request.method !== "GET") requireSameOrigin(request, actor);
  return actor;
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const bytes = await readBytes(request, 100_000);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new IntegrationError("json_invalid", "Send a valid JSON request.");
  }
  return schema.parse(input);
}
export async function readBytes(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new IntegrationError(
      "request_size",
      "The request exceeds the allowed size.",
      413,
    );
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new IntegrationError(
        "request_size",
        "The request exceeds the allowed size.",
        413,
      );
    }
    parts.push(next.value);
  }
  return Buffer.concat(parts);
}
export function apiError(error: unknown): Response {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: error.issues
          .map((item) => `${item.path.join(".") || "input"}: ${item.message}`)
          .join("; ")
          .slice(0, 500),
        code: "validation_error",
      },
      { status: 400 },
    );
  if (
    error instanceof IntegrationError ||
    (error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      "message" in error)
  ) {
    const known = error as { code: string; message: string; status: number };
    return Response.json(
      { error: known.message, code: known.code },
      { status: known.status },
    );
  }
  return Response.json(
    {
      error:
        "The operation could not be completed. Check integration configuration or try again.",
      code: "integration_failed",
    },
    { status: 500 },
  );
}
