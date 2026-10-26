import { z } from "zod";
import {
  prepareUpload,
  completeUpload,
  deleteUploadedAsset,
  listUploadedAssets,
  uploadSchema,
} from "@/lib/core/assets";
import { getRequestContext, requireSameOrigin } from "@/lib/core/server";
import { errorResponse, json, rateLimit, readJson } from "@/lib/core/http";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  uploadSchema.extend({ action: z.literal("prepare") }),
  z
    .object({ action: z.literal("complete"), assetId: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("delete"), assetId: z.string().uuid() })
    .strict(),
]);
export async function GET() {
  try {
    return json(await listUploadedAssets(await getRequestContext()));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await getRequestContext();
    requireSameOrigin(request, actor);
    rateLimit(`assets:${actor.businessId}`, 30);
    const input = schema.parse(await readJson(request));
    if (input.action === "prepare") {
      const { action: _, ...value } = input;
      return json(await prepareUpload(actor, value));
    }
    if (input.action === "complete")
      return json(await completeUpload(actor, input.assetId));
    await deleteUploadedAsset(actor, input.assetId);
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
