import { z } from "zod";
import { readJson, apiError } from "@/lib/integrations/http";
import { widgetChat, widgetMessages } from "@/lib/integrations/widget";
import { appOrigin } from "@/lib/integrations/oauth";
import { IntegrationError } from "@/lib/integrations/security";
const base = {
  widgetId: z.string(),
  sessionId: z.string().uuid(),
  token: z.string().min(40).max(60),
  origin: z.string().max(300),
};
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== appOrigin())
      throw new IntegrationError(
        "widget_request_origin",
        "The widget request origin was rejected.",
        403,
      );
    const body = await readJson(
      request,
      z.union([
        z.object({ ...base, action: z.literal("messages") }).strict(),
        z
          .object({
            ...base,
            message: z.string().min(1).max(2000),
            requestId: z.string().uuid(),
          })
          .strict(),
      ]),
    );
    return Response.json(
      "action" in body ? await widgetMessages(body) : await widgetChat(body),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
