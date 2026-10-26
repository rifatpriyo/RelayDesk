import { z } from "zod";
import { ownerRequest, readJson, apiError } from "@/lib/integrations/http";
import { configureWidget } from "@/lib/integrations/widget";
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request),
      body = await readJson(
        request,
        z
          .object({
            active: z.boolean(),
            allowedOrigins: z.array(z.string()).max(10),
            title: z.string().min(1).max(80),
          })
          .strict(),
      );
    return Response.json(await configureWidget(actor, body));
  } catch (error) {
    return apiError(error);
  }
}
