import { z } from "zod";
import { start } from "workflow/api";
import { ownerRequest, readJson, apiError } from "@/lib/integrations/http";
import { readBusiness, transactBusiness } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";
import { IntegrationError } from "@/lib/integrations/security";
import {
  inboundMessageWorkflow,
  outboundMessageWorkflow,
} from "@/workflows/messages";
export async function POST(request: Request) {
  try {
    const actor = await ownerRequest(request),
      body = await readJson(
        request,
        z
          .object({ kind: z.enum(["inbound", "outbound"]), id: z.string() })
          .strict(),
      ),
      state = await readBusiness(actor),
      data = integrationState(state);
    if (body.kind === "outbound") {
      const item = data.outbox.find((item) => item.id === body.id);
      if (!item || item.status !== "prepared")
        throw new IntegrationError(
          "retry_not_safe",
          "Only unsent prepared records can be restarted. Reconcile ambiguous sends first.",
          409,
        );
      const run = await start(outboundMessageWorkflow, [
        actor.businessId,
        item.id,
      ]);
      return Response.json({ runId: run.runId });
    }
    const item = data.inbox.find((item) => item.id === body.id);
    if (
      !item ||
      !["pending", "processing"].includes(item.status) ||
      (item.status === "processing" && (item.leaseUntil || 0) > Date.now())
    )
      throw new IntegrationError(
        "retry_not_safe",
        "Only pending or expired-lease jobs can be resumed.",
        409,
      );
    if (
      data.spend.some((record) => record.id === item.responseId) &&
      !data.outbox.some((record) => record.id === item.responseId)
    )
      throw new IntegrationError(
        "generation_uncertain",
        "A real inference attempt exists without a saved reply. Staff review is required; no automatic spend retry.",
        409,
      );
    await transactBusiness(actor, (draft) => {
      integrationState(draft).inbox.find((job) => job.id === body.id)!.status =
        "pending";
    });
    const run = await start(inboundMessageWorkflow, [
      actor.businessId,
      item.id,
    ]);
    return Response.json({ runId: run.runId });
  } catch (error) {
    return apiError(error);
  }
}
