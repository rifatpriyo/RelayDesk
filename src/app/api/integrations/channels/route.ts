import { z } from "zod";
import { start } from "workflow/api";
import {
  getRequestContext,
  requireSameOrigin,
  transactBusiness,
} from "@/lib/core/server";
import { readJson, apiError } from "@/lib/integrations/http";
import {
  beginOAuth,
  completeOAuth,
  selectAsset,
  channelAction,
} from "@/lib/integrations/oauth";
import {
  queueStaffReply,
  reconcileOutbound,
} from "@/lib/integrations/pipeline";
import { outboundMessageWorkflow } from "@/workflows/messages";
import { integrationState } from "@/lib/integrations/types";
const channel = z.enum(["messenger", "instagram", "whatsapp"]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), channel }).strict(),
  z
    .object({
      action: z.literal("signup"),
      channel: z.literal("whatsapp"),
      code: z.string().min(1).max(4000),
      state: z.string().min(20).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      channel,
      attemptId: z.string().min(1),
      assetId: z.string().min(1),
      registrationPin: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["activate", "pause", "disconnect", "test"]),
      channel,
    })
    .strict(),
  z
    .object({
      action: z.literal("reply"),
      conversationId: z.string(),
      text: z.string().min(1).max(3900),
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile"),
      responseId: z.string(),
      decision: z.enum(["failed", "accepted"]),
      providerId: z.string().max(250).optional(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const actor = await getRequestContext(request);
    requireSameOrigin(request, actor);
    const body = await readJson(request, schema);
    if (body.action === "connect")
      return Response.json(await beginOAuth(actor, body.channel));
    if (body.action === "signup")
      return Response.json(
        await completeOAuth(actor, "whatsapp", body.code, body.state),
      );
    if (body.action === "select")
      return Response.json(
        await selectAsset(
          actor,
          body.channel,
          body.attemptId,
          body.assetId,
          body.registrationPin,
        ),
      );
    if (body.action === "reconcile")
      return Response.json(
        await reconcileOutbound(
          actor,
          body.responseId,
          body.decision,
          body.providerId,
        ),
      );
    if (body.action === "reply") {
      const queued = await queueStaffReply(
        actor,
        body.conversationId,
        body.text,
      );
      try {
        const run = await start(outboundMessageWorkflow, [
          queued.businessId,
          queued.responseId,
        ]);
        return Response.json(
          { ...queued, runId: run.runId, status: "queued" },
          { status: 202 },
        );
      } catch {
        await transactBusiness(actor, (state) => {
          const item = integrationState(state).outbox.find(
            (item) => item.id === queued.responseId,
          );
          if (item)
            item.error =
              "Workflow start failed. Operator can start the persisted outbound record.";
        });
        return Response.json(
          {
            ...queued,
            status: "queued",
            notice:
              "The message is durably queued; workflow startup requires operator attention.",
          },
          { status: 202 },
        );
      }
    }
    return Response.json(await channelAction(actor, body.channel, body.action));
  } catch (error) {
    return apiError(error);
  }
}
