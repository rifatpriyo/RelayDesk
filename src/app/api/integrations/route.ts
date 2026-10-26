import { ownerRequest, apiError } from "@/lib/integrations/http";
import { readBusiness } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";
export async function GET(request: Request) {
  try {
    const actor = await ownerRequest(request),
      state = await readBusiness(actor),
      data = integrationState(state);
    return Response.json(
      {
        sources: data.sources.map(({ credential, ...source }) => source),
        imports: data.imports.map(({ rows, ...batch }) => batch),
        connections: data.connections.map(
          ({ credential, ...connection }) => connection,
        ),
        oauth: data.oauth
          .filter(
            (item) =>
              item.candidates && !item.consumed && item.expiresAt > Date.now(),
          )
          .map((item) => ({
            attemptId: item.stateHash,
            provider: item.provider,
            candidates: item.candidates,
          })),
        widget: data.widget,
        jobs: data.inbox
          .map(({ event, ...job }) => ({
            ...job,
            channel: event.channel,
            kind: event.kind,
          }))
          .slice(-50),
        outbox: data.outbox
          .map(({ text, customerId, ...record }) => record)
          .slice(-50),
        spend: data.spend.map((item) => ({ ...item })),
        configuration: {
          demo: actor.demo,
          aiProvider: actor.demo
            ? "deterministic-demo"
            : process.env.AI_PROVIDER || "not configured",
          realInferenceEnabled: process.env.REAL_INFERENCE_ENABLED === "true",
          meta:
            !!process.env.META_APP_ID &&
            !!process.env.META_APP_SECRET &&
            !!process.env.META_GRAPH_VERSION,
          instagram:
            !!process.env.INSTAGRAM_APP_ID &&
            !!process.env.INSTAGRAM_APP_SECRET,
          google:
            !!process.env.GOOGLE_CLIENT_ID &&
            !!process.env.GOOGLE_CLIENT_SECRET,
          payments: "mock",
          providerCosts: "unknown unless configured by operator",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
