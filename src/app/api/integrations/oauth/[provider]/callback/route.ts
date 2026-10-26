import { getRequestContext } from "@/lib/core/server";
import { completeOAuth, appOrigin } from "@/lib/integrations/oauth";
import { apiError } from "@/lib/integrations/http";
import { IntegrationError } from "@/lib/integrations/security";
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const actor = await getRequestContext(request),
      { provider } = await context.params,
      url = new URL(request.url);
    if (!["google", "messenger", "instagram"].includes(provider))
      throw new IntegrationError(
        "provider_invalid",
        "Unsupported OAuth redirect provider.",
      );
    if (url.searchParams.has("error"))
      throw new IntegrationError(
        "oauth_declined",
        "Authorization was declined. Return to Channels or Data sources to try again.",
      );
    const code = url.searchParams.get("code"),
      state = url.searchParams.get("state");
    if (!code || !state)
      throw new IntegrationError(
        "oauth_invalid",
        "The authorization callback is incomplete.",
      );
    await completeOAuth(
      actor,
      provider as "google" | "messenger" | "instagram",
      code,
      state,
    );
    return Response.redirect(
      `${appOrigin()}/workspace/${provider === "google" ? "sources" : "channels"}?connection=review`,
      303,
    );
  } catch (error) {
    return apiError(error);
  }
}
