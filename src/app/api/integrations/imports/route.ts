import { z } from "zod";
import {
  ownerRequest,
  readBytes,
  readJson,
  apiError,
} from "@/lib/integrations/http";
import {
  uploadImport,
  reviewImport,
  publishImport,
} from "@/lib/integrations/service";
import { IntegrationError } from "@/lib/integrations/security";
import { suggestImportMapping } from "@/lib/integrations/ai";
import { readUploadedAsset } from "@/lib/core/assets";
const column = z.string().max(120).optional();
const mapping = z
  .object({
    sourceId: column,
    sku: column,
    name: column,
    description: column,
    price: column,
    currency: column,
    stock: column,
    image: column,
    category: column,
    variant: column,
  })
  .strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request);
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const bytes = await readBytes(request, 2_100_000),
        form = await new Response(bytes as BodyInit, {
          headers: { "content-type": request.headers.get("content-type")! },
        }).formData(),
        file = form.get("file"),
        kind = String(form.get("kind") || "catalog");
      if (
        !(file instanceof File) ||
        !["catalog", "document", "history"].includes(kind)
      )
        throw new IntegrationError(
          "upload_invalid",
          "Choose a file and a supported import kind.",
        );
      return Response.json(
        await uploadImport(
          actor,
          file,
          kind,
          form.get("sourceId") ? String(form.get("sourceId")) : undefined,
        ),
      );
    }
    const body = await readJson(
      request,
      z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("asset"),
            assetId: z.string().uuid(),
            kind: z.enum(["catalog", "document", "history"]),
            sourceId: z.string().optional(),
          })
          .strict(),
        z
          .object({ action: z.literal("suggest"), batchId: z.string() })
          .strict(),
        z
          .object({ action: z.literal("review"), batchId: z.string(), mapping })
          .strict(),
        z
          .object({
            action: z.literal("publish"),
            batchId: z.string(),
            retireMissing: z.boolean().optional(),
          })
          .strict(),
      ]),
    );
    if (body.action === "asset") {
      const asset = await readUploadedAsset(actor, body.assetId);
      return Response.json(
        await uploadImport(
          actor,
          new File([new Uint8Array(asset.buffer)], asset.name, {
            type: asset.mime,
          }),
          body.kind,
          body.sourceId,
          actor.demo ? 2 * 1024 * 1024 : 20 * 1024 * 1024,
        ),
      );
    }
    if (body.action === "suggest")
      return Response.json(await suggestImportMapping(actor, body.batchId));
    return Response.json(
      body.action === "review"
        ? { batch: await reviewImport(actor, body.batchId, body.mapping) }
        : await publishImport(actor, body.batchId, body.retireMissing),
    );
  } catch (error) {
    return apiError(error);
  }
}
