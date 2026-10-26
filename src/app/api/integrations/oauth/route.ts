import { z } from "zod";
import { ownerRequest, readJson, apiError } from "@/lib/integrations/http";
import { beginOAuth } from "@/lib/integrations/oauth";
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request),
      body = await readJson(
        request,
        z
          .object({
            provider: z.enum(["google", "messenger", "instagram", "whatsapp"]),
          })
          .strict(),
      );
    return Response.json(await beginOAuth(actor, body.provider));
  } catch (error) {
    return apiError(error);
  }
}
