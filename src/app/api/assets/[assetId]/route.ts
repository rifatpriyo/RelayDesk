import { getRequestContext, requireSameOrigin } from "@/lib/core/server";
import { putLocalUpload, readUploadedAsset } from "@/lib/core/assets";
import { errorResponse, json, rateLimit } from "@/lib/core/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getRequestContext(),
      { assetId } = await context.params;
    rateLimit(`asset-read:${actor.businessId}`, 180);
    const { buffer, name, mime } = await readUploadedAsset(actor, assetId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const actor = await getRequestContext();
    requireSameOrigin(request, actor);
    rateLimit(`asset-write:${actor.businessId}`, 30);
    const { assetId } = await context.params;
    await putLocalUpload(actor, assetId, request);
    return json({ uploaded: true });
  } catch (error) {
    return errorResponse(error);
  }
}
