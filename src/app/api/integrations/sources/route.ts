import { z } from "zod";
import { ownerRequest, readJson, apiError } from "@/lib/integrations/http";
import {
  connectDatabase,
  connectGoogleSource,
  disconnectSource,
  syncSource,
} from "@/lib/integrations/service";
import { databaseConfigSchema } from "@/lib/integrations/connectors";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("connect"),
      kind: z.enum(["mysql", "postgresql"]),
      name: z.string().min(1).max(100),
      config: databaseConfigSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("google"),
      name: z.string().min(1).max(100),
      spreadsheetId: z.string(),
      sheetName: z.string(),
    })
    .strict(),
  z
    .object({ action: z.enum(["sync", "disconnect"]), sourceId: z.string() })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request),
      body = await readJson(request, schema);
    if (body.action === "connect")
      return Response.json(
        await connectDatabase(actor, body.kind, body.name, body.config),
      );
    if (body.action === "google")
      return Response.json(
        await connectGoogleSource(
          actor,
          body.name,
          body.spreadsheetId,
          body.sheetName,
        ),
      );
    return Response.json(
      body.action === "sync"
        ? await syncSource(actor, body.sourceId)
        : await disconnectSource(actor, body.sourceId),
    );
  } catch (error) {
    return apiError(error);
  }
}
