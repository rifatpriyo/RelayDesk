import { start } from "workflow/api";
import { z } from "zod";
import { normalizeMeta } from "@/lib/integrations/channels";
import { persistInbound } from "@/lib/integrations/pipeline";
import { readBytes, apiError } from "@/lib/integrations/http";
import {
  IntegrationError,
  verifyMetaSignature,
  equalSecret,
} from "@/lib/integrations/security";
import { inboundMessageWorkflow } from "@/workflows/messages";
import { serviceActor, transactBusiness } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ channel: string }> },
) {
  try {
    const { channel } = await context.params;
    z.enum(["messenger", "instagram", "whatsapp"]).parse(channel);
    const url = new URL(request.url),
      secret = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      !secret ||
      url.searchParams.get("hub.mode") !== "subscribe" ||
      !equalSecret(url.searchParams.get("hub.verify_token") || "", secret)
    )
      throw new IntegrationError(
        "verification_rejected",
        "Webhook verification was rejected.",
        403,
      );
    const challenge = url.searchParams.get("hub.challenge");
    if (!challenge || challenge.length > 200)
      throw new IntegrationError(
        "challenge_invalid",
        "Invalid webhook challenge.",
      );
    return new Response(challenge, {
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ channel: string }> },
) {
  try {
    const channel = z
        .enum(["messenger", "instagram", "whatsapp"])
        .parse((await context.params).channel),
      raw = await readBytes(request, 1_000_000),
      secret =
        channel === "instagram"
          ? process.env.INSTAGRAM_APP_SECRET
          : process.env.META_APP_SECRET;
    if (!secret)
      throw new IntegrationError(
        "webhook_unconfigured",
        "This webhook is not configured.",
        503,
      );
    if (
      !verifyMetaSignature(
        raw,
        request.headers.get("x-hub-signature-256"),
        secret,
      )
    )
      throw new IntegrationError(
        "signature_invalid",
        "Invalid webhook signature.",
        401,
      );
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new IntegrationError("webhook_json", "Invalid webhook JSON.");
    }
    const events = normalizeMeta(channel, payload),
      jobs: { businessId: string; jobId: string }[] = [];
    for (const event of events) {
      const job = await persistInbound(event);
      if (job) jobs.push(job);
    }
    for (const job of jobs) {
      const run = await start(inboundMessageWorkflow, [
        job.businessId,
        job.jobId,
      ]);
      await transactBusiness(serviceActor(job.businessId), (state) => {
        const saved = integrationState(state).inbox.find(
          (item) => item.id === job.jobId,
        );
        if (saved) saved.runId = run.runId;
      });
    }
    return Response.json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
