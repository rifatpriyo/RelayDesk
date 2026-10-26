import { z } from "zod";
import { ownerRequest, readJson, apiError } from "@/lib/integrations/http";
import { generateReply } from "@/lib/integrations/ai";
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request),
      body = await readJson(
        request,
        z
          .object({
            question: z.string().min(1).max(2000),
            asOf: z.string().optional(),
            draft: z.boolean().optional(),
          })
          .strict(),
      );
    return Response.json(
      await generateReply(actor, body.question, {
        responseId: `playground-${crypto.randomUUID()}`,
        purpose: "playground",
        asOf: body.asOf,
        draft: body.draft,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
