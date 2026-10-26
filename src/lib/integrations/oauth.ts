import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Actor } from "../core/types";
import {
  assertManager,
  claimChannelAsset,
  readBusiness,
  releaseChannelAsset,
  transactBusiness,
} from "../core/server";
import {
  IntegrationError,
  nonce,
  hash,
  encryptCredential,
  decryptCredential,
  boundedJson,
} from "./security";
import { graphVersion, providerJson, type ChannelCredential } from "./channels";
import {
  integrationState,
  enforceRate,
  type OAuthAttempt,
  type SocialChannel,
  type ChannelConnection,
} from "./types";
import { integrationAudit } from "./service";
import type { GoogleCredential } from "./connectors";

type Provider = SocialChannel | "google";
type CandidateTokens = {
  credentials: Record<string, ChannelCredential>;
  permissions: string[];
};
function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new IntegrationError(
      "configuration_required",
      `The operator must configure ${name} before this connection can start.`,
      503,
    );
  return value;
}
export function appOrigin() {
  const url = new URL(required("NEXT_PUBLIC_APP_URL"));
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new IntegrationError(
      "configuration_required",
      "The app origin must use HTTPS.",
      503,
    );
  return url.origin;
}
export function callbackUrl(provider: Provider) {
  return `${appOrigin()}/api/integrations/oauth/${provider}/callback`;
}
export async function beginOAuth(actor: Actor, provider: Provider) {
  assertManager(actor);
  if (actor.demo)
    throw new IntegrationError(
      "demo_connection_disabled",
      "This is an isolated demo. Sign in to a configured instance to authorize a real account.",
      409,
    );
  const state = nonce(),
    verifier = provider === "google" ? nonce() : undefined,
    attempt: OAuthAttempt = {
      stateHash: hash(state),
      provider,
      userId: actor.userId,
      expiresAt: Date.now() + 10 * 60_000,
      verifier,
    };
  let url: URL | undefined, sdk: Record<string, string> | undefined;
  if (provider === "google") {
    required("GOOGLE_CLIENT_SECRET");
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: required("GOOGLE_CLIENT_ID"),
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256")
        .update(verifier!)
        .digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
  } else if (provider === "instagram") {
    required("INSTAGRAM_APP_SECRET");
    url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: required("INSTAGRAM_APP_ID"),
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_manage_messages",
      state,
      enable_fb_login: "0",
      force_authentication: "1",
    }).toString();
  } else {
    required("META_APP_SECRET");
    const version = graphVersion(),
      appId = required("META_APP_ID");
    if (provider === "whatsapp")
      sdk = {
        appId,
        configId: required("META_WHATSAPP_CONFIG_ID"),
        state,
        version,
      };
    else {
      url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      url.search = new URLSearchParams({
        client_id: appId,
        redirect_uri: callbackUrl(provider),
        response_type: "code",
        state,
        config_id: required("META_MESSENGER_CONFIG_ID"),
        scope: "pages_show_list,pages_messaging,pages_manage_metadata",
      }).toString();
    }
  }
  await transactBusiness(actor, (draft) => {
    const data = integrationState(draft);
    enforceRate(data, `oauth:${actor.userId}`, 10, 600_000);
    data.oauth = data.oauth.filter((item) => item.expiresAt > Date.now());
    data.oauth.push(attempt);
    const channel = draft.channels.find((item) => item.kind === provider);
    if (channel) {
      channel.status = "authorization_pending";
      channel.automationEnabled = false;
    }
    integrationAudit(draft, actor, "authorization.start", provider);
  });
  return url ? { url: url.toString() } : { sdk };
}
async function consumeOAuth(
  actor: Actor,
  provider: Provider,
  state: string,
): Promise<OAuthAttempt> {
  return transactBusiness(actor, (draft) => {
    const attempt = integrationState(draft).oauth.find(
      (item) =>
        item.stateHash === hash(state) &&
        item.provider === provider &&
        item.userId === actor.userId,
    );
    if (!attempt || attempt.consumed || attempt.expiresAt <= Date.now())
      throw new IntegrationError(
        "oauth_state",
        "Authorization expired or was already used. Start Connect again.",
        403,
      );
    attempt.consumed = true;
    return { ...attempt };
  });
}
async function tokenExchange(
  url: string,
  values: Record<string, string>,
): Promise<Record<string, any>> {
  const response = await fetch(url, {
      method: "POST",
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    }),
    body = await boundedJson(response, 100_000);
  if (!response.ok || !body.access_token)
    throw new IntegrationError(
      "oauth_exchange",
      "The provider did not grant a usable token. Start Connect again and check the reviewed permissions.",
      502,
    );
  return body;
}
export async function completeOAuth(
  actor: Actor,
  provider: Provider,
  code: string,
  state: string,
) {
  assertManager(actor);
  const attempt = await consumeOAuth(actor, provider, state);
  if (provider === "google") {
    const token = await tokenExchange("https://oauth2.googleapis.com/token", {
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(provider),
      code_verifier: attempt.verifier!,
    });
    if (
      !String(token.scope || "")
        .split(" ")
        .includes("https://www.googleapis.com/auth/spreadsheets.readonly")
    )
      throw new IntegrationError(
        "scope_missing",
        "Google Sheets read-only permission was not granted.",
        403,
      );
    const credential: GoogleCredential = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
      scope: token.scope,
    };
    await transactBusiness(actor, (draft) => {
      const data = integrationState(draft),
        id = "google-authorization",
        existing = data.sources.find((item) => item.id === id),
        encrypted = encryptCredential(credential, actor.businessId, id);
      if (existing) {
        existing.credential = encrypted;
        existing.status = "connected";
        existing.error = undefined;
      } else
        data.sources.push({
          id,
          name: "Google authorization",
          kind: "google_sheets",
          status: "connected",
          credential: encrypted,
          mappingVersion: 0,
          freshnessHours: 24,
          syncMinutes: 1440,
        });
      integrationAudit(draft, actor, "google.authorized", id);
    });
    return { connected: true, provider };
  }
  const candidates: { id: string; name: string; wabaId?: string }[] = [],
    credentials: Record<string, ChannelCredential> = {};
  let permissions: string[] = [];
  if (provider === "instagram") {
    const token = await tokenExchange(
      "https://api.instagram.com/oauth/access_token",
      {
        client_id: required("INSTAGRAM_APP_ID"),
        client_secret: required("INSTAGRAM_APP_SECRET"),
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(provider),
        code,
      },
    );
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.search = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: required("INSTAGRAM_APP_SECRET"),
      access_token: token.access_token,
    }).toString();
    const long = await providerJson(longUrl.toString(), token.access_token),
      accessToken = String(long.access_token || "");
    if (!accessToken)
      throw new IntegrationError(
        "oauth_exchange",
        "Instagram did not return a long-lived access token.",
        502,
      );
    const account = await providerJson(
        `https://graph.instagram.com/${graphVersion()}/me?fields=user_id,username`,
        accessToken,
      ),
      id = String(account.user_id || account.id || "");
    if (!/^\d+$/.test(id))
      throw new IntegrationError(
        "asset_invalid",
        "Instagram did not return an authorized professional account.",
        502,
      );
    candidates.push({
      id,
      name: String(account.username || "Instagram professional account"),
    });
    credentials[id] = {
      accessToken,
      expiresAt: Date.now() + Number(long.expires_in || 5184000) * 1000,
    };
    permissions = [
      "instagram_business_basic",
      "instagram_business_manage_messages",
    ];
  } else {
    const token = await tokenExchange(
      `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
      {
        client_id: required("META_APP_ID"),
        client_secret: required("META_APP_SECRET"),
        code,
        ...(provider === "messenger"
          ? { redirect_uri: callbackUrl(provider) }
          : {}),
      },
    );
    const debugUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/debug_token`,
    );
    debugUrl.searchParams.set("input_token", token.access_token);
    const debug = (
      await providerJson(
        debugUrl.toString(),
        `${required("META_APP_ID")}|${required("META_APP_SECRET")}`,
      )
    ).data;
    if (!debug?.is_valid || String(debug.app_id) !== required("META_APP_ID"))
      throw new IntegrationError(
        "token_invalid",
        "The token was not issued for this Meta app.",
        403,
      );
    permissions = Array.isArray(debug.scopes) ? debug.scopes : [];
    const expected =
      provider === "messenger"
        ? ["pages_show_list", "pages_messaging", "pages_manage_metadata"]
        : ["whatsapp_business_management", "whatsapp_business_messaging"];
    if (expected.some((scope) => !permissions.includes(scope)))
      throw new IntegrationError(
        "scope_missing",
        `Required ${provider} permissions were not granted. Reconnect after app review.`,
        403,
      );
    if (provider === "messenger") {
      const pages = await providerJson(
        `https://graph.facebook.com/${graphVersion()}/me/accounts?fields=id,name,access_token,tasks&limit=100`,
        token.access_token,
      );
      for (const page of pages.data || [])
        if (
          page.access_token &&
          (page.tasks || []).some((task: string) =>
            ["MESSAGING", "MANAGE"].includes(task),
          )
        ) {
          const id = String(page.id);
          candidates.push({ id, name: String(page.name) });
          credentials[id] = {
            accessToken: String(page.access_token),
            expiresAt: debug.expires_at
              ? Number(debug.expires_at) * 1000
              : undefined,
          };
        }
      if (pages.paging?.next)
        throw new IntegrationError(
          "asset_pagination",
          "More than 100 Pages are authorized. Reconnect and grant access to only the required Page.",
        );
    } else {
      const scope = (debug.granular_scopes || []).find(
          (scope: { scope: string }) =>
            scope.scope === "whatsapp_business_management",
        ),
        wabas: string[] = scope?.target_ids || [];
      if (!wabas.length || wabas.length > 10)
        throw new IntegrationError(
          "whatsapp_assets",
          "Embedded Signup must grant a bounded WhatsApp Business Account. Complete signup with the required business assets.",
          409,
        );
      for (const wabaId of wabas) {
        const phones = await providerJson(
          `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=50`,
          token.access_token,
        );
        for (const phone of phones.data || []) {
          const id = String(phone.id);
          candidates.push({
            id,
            name: String(
              phone.verified_name ||
                phone.display_phone_number ||
                "WhatsApp number",
            ),
            wabaId,
          });
          credentials[id] = {
            accessToken: String(token.access_token),
            expiresAt: debug.expires_at
              ? Number(debug.expires_at) * 1000
              : undefined,
          };
        }
      }
    }
  }
  if (!candidates.length)
    throw new IntegrationError(
      "asset_missing",
      "No eligible messaging asset was authorized. Check your professional account/Page/phone access.",
      409,
    );
  const selectionId = hash(nonce());
  await transactBusiness(actor, (draft) => {
    integrationState(draft).oauth.push({
      stateHash: selectionId,
      provider,
      userId: actor.userId,
      expiresAt: Date.now() + 15 * 60_000,
      candidates,
      candidateCredential: encryptCredential(
        { credentials, permissions } satisfies CandidateTokens,
        actor.businessId,
        selectionId,
      ),
    });
    integrationAudit(draft, actor, "authorization.assets_verified", provider);
  });
  return { attemptId: selectionId, candidates, provider };
}
export async function selectAsset(
  actor: Actor,
  channel: SocialChannel,
  attemptId: string,
  assetId: string,
  registrationPin?: string,
) {
  assertManager(actor);
  const state = await readBusiness(actor),
    attempt = integrationState(state).oauth.find(
      (item) =>
        item.stateHash === attemptId &&
        item.provider === channel &&
        item.userId === actor.userId &&
        !item.consumed &&
        item.expiresAt > Date.now(),
    ),
    candidate = attempt?.candidates?.find((item) => item.id === assetId);
  if (!attempt?.candidateCredential || !candidate)
    throw new IntegrationError(
      "asset_not_authorized",
      "Select an asset from your current authorized account list.",
      403,
    );
  const values = decryptCredential<CandidateTokens>(
      attempt.candidateCredential,
      actor.businessId,
      attemptId,
    ),
    credential = values.credentials[assetId];
  if (!credential)
    throw new IntegrationError(
      "asset_not_authorized",
      "No credential was issued for this asset.",
      403,
    );
  if (channel === "whatsapp" && !/^\d{6}$/.test(registrationPin || ""))
    throw new IntegrationError(
      "registration_required",
      "Enter the six-digit WhatsApp two-step verification PIN to register this Cloud API phone. It is sent only to Meta and is not stored.",
    );
  await claimChannelAsset(actor, channel, assetId);
  const base =
      channel === "instagram"
        ? "https://graph.instagram.com"
        : "https://graph.facebook.com",
    subscriptionId = channel === "whatsapp" ? candidate.wabaId : assetId;
  try {
    const result = await providerJson(
      `${base}/${graphVersion()}/${subscriptionId}/subscribed_apps`,
      credential.accessToken,
      "POST",
      channel === "whatsapp"
        ? {}
        : {
            subscribed_fields:
              channel === "instagram"
                ? "messages,messaging_postbacks"
                : "messages,messaging_postbacks,message_deliveries,message_reads",
          },
    );
    if (result.success !== true && result.success !== "true")
      throw new IntegrationError(
        "subscription_failed",
        "The provider did not confirm the webhook subscription.",
        502,
      );
    if (channel === "whatsapp") {
      const registration = await providerJson(
        `${base}/${graphVersion()}/${assetId}/register`,
        credential.accessToken,
        "POST",
        { messaging_product: "whatsapp", pin: registrationPin },
      );
      if (registration.success !== true && registration.success !== "true")
        throw new IntegrationError(
          "phone_registration",
          "Meta did not confirm Cloud API phone registration. Check eligibility; coexistence and migration may require a different provider setup.",
          409,
        );
    }
    await providerJson(
      `${base}/${graphVersion()}/${assetId}?fields=id`,
      credential.accessToken,
    );
    const id = randomUUID(),
      now = new Date().toISOString();
    await transactBusiness(actor, (draft) => {
      const data = integrationState(draft),
        current = data.oauth.find((item) => item.stateHash === attemptId);
      if (!current || current.consumed || current.expiresAt <= Date.now())
        throw new IntegrationError(
          "oauth_state",
          "Selection expired. Reconnect.",
          409,
        );
      const previous = data.connections.find(
        (item) => item.channel === channel && item.state !== "disconnected",
      );
      if (previous && previous.assetId !== assetId)
        throw new IntegrationError(
          "disconnect_first",
          "Disconnect the current account before replacing it.",
          409,
        );
      current.consumed = true;
      delete current.candidateCredential;
      data.connections = data.connections.filter(
        (item) => item.channel !== channel,
      );
      data.connections.push({
        id,
        channel,
        assetId,
        name: candidate.name,
        wabaId: candidate.wabaId,
        credential: encryptCredential(credential, actor.businessId, id),
        expiresAt: credential.expiresAt,
        state: "connected",
        active: false,
        permissions: values.permissions,
        verifiedAt: now,
        revision: 0,
      });
      const visible = draft.channels.find((item) => item.kind === channel);
      if (visible)
        Object.assign(visible, {
          status: "automation_paused",
          automationEnabled: false,
          simulated: false,
          accountName: candidate.name,
          accountId: assetId,
          lastCheckedAt: now,
          error: undefined,
        });
      integrationAudit(draft, actor, "channel.connected", id);
    });
    return {
      connected: true,
      active: false,
      notice:
        "Account verified and subscribed. Review your assistant, then explicitly activate replies.",
    };
  } catch (error) {
    const latest = await readBusiness(actor);
    if (
      !integrationState(latest).connections.some(
        (item) =>
          item.channel === channel &&
          item.assetId === assetId &&
          item.state === "connected",
      )
    )
      await releaseChannelAsset(actor, channel, assetId);
    throw error;
  }
}
export async function connectionCredential(
  actor: Actor,
  connection: ChannelConnection,
): Promise<ChannelCredential> {
  if (connection.state !== "connected" || !connection.credential)
    throw new IntegrationError(
      "channel_disconnected",
      "Reconnect this channel.",
      409,
    );
  let credential = decryptCredential<ChannelCredential>(
    connection.credential,
    actor.businessId,
    connection.id,
  );
  if (
    connection.channel === "instagram" &&
    credential.expiresAt &&
    credential.expiresAt < Date.now() + 7 * 86400_000 &&
    credential.expiresAt > Date.now()
  ) {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: credential.accessToken,
    }).toString();
    const refreshed = await providerJson(
      url.toString(),
      credential.accessToken,
    );
    credential = {
      accessToken: String(refreshed.access_token),
      expiresAt: Date.now() + Number(refreshed.expires_in || 5184000) * 1000,
    };
    await transactBusiness(actor, (draft) => {
      const current = integrationState(draft).connections.find(
        (item) => item.id === connection.id,
      );
      if (!current || current.state !== "connected")
        throw new IntegrationError(
          "channel_disconnected",
          "The channel was disconnected.",
          409,
        );
      current.credential = encryptCredential(
        credential,
        actor.businessId,
        current.id,
      );
      current.expiresAt = credential.expiresAt;
    });
  }
  if (credential.expiresAt && credential.expiresAt <= Date.now())
    throw new IntegrationError(
      "token_expired",
      "The channel authorization expired. Reconnect.",
      409,
    );
  return credential;
}
export async function channelAction(
  actor: Actor,
  channel: SocialChannel,
  action: "activate" | "pause" | "test" | "disconnect",
) {
  assertManager(actor);
  const state = await readBusiness(actor),
    connection = integrationState(state).connections.find(
      (item) => item.channel === channel && item.state !== "disconnected",
    );
  if (!connection)
    throw new IntegrationError(
      "channel_not_connected",
      "Connect and select a verified account first.",
      409,
    );
  if (action === "test") {
    try {
      const credential = await connectionCredential(actor, connection),
        base =
          channel === "instagram"
            ? "https://graph.instagram.com"
            : "https://graph.facebook.com";
      await providerJson(
        `${base}/${graphVersion()}/${connection.assetId}?fields=id`,
        credential.accessToken,
      );
      const subscriptions = await providerJson(
        `${base}/${graphVersion()}/${connection.wabaId || connection.assetId}/subscribed_apps`,
        credential.accessToken,
      );
      if (
        !Array.isArray(subscriptions.data) ||
        !subscriptions.data.some(
          (item: Record<string, any>) =>
            String(item.id || item.whatsapp_business_api_data?.id) ===
            (channel === "instagram"
              ? process.env.INSTAGRAM_APP_ID
              : process.env.META_APP_ID),
        )
      )
        throw new IntegrationError(
          "subscription_missing",
          "This app is not subscribed to the selected account.",
          409,
        );
      return {
        verified: true,
        notice:
          "Credentials and account subscription checked. No customer message was sent.",
      };
    } catch (error) {
      await transactBusiness(actor, (draft) => {
        const current = integrationState(draft).connections.find(
          (item) => item.id === connection.id,
        );
        if (current) {
          current.state = "needs_attention";
          current.active = false;
        }
        const visible = draft.channels.find((item) => item.kind === channel);
        if (visible) {
          visible.status = "needs_attention";
          visible.automationEnabled = false;
          visible.error =
            "Connection check failed. Reconnect or check app permissions.";
        }
      });
      throw error;
    }
  }
  const credential =
    action === "disconnect"
      ? decryptCredential<ChannelCredential>(
          connection.credential,
          actor.businessId,
          connection.id,
        )
      : undefined;
  await transactBusiness(actor, (draft) => {
    const current = integrationState(draft).connections.find(
      (item) => item.id === connection.id,
    )!;
    if (action === "activate") {
      if (draft.billing.subscription.planId === "free")
        throw new IntegrationError(
          "plan_channel_limit",
          "The Free plan supports channel setup/testing. Choose Starter or Growth to activate social replies.",
          403,
        );
      if (!draft.settings.publishedAt)
        throw new IntegrationError(
          "assistant_unpublished",
          "Publish your assistant before activating it.",
          409,
        );
      if (current.state !== "connected")
        throw new IntegrationError(
          "connection_attention",
          "Reconnect the account before activation.",
          409,
        );
      current.active = true;
    } else current.active = false;
    if (action === "disconnect") {
      current.state = "disconnected";
      current.credential = "";
    }
    current.revision++;
    const visible = draft.channels.find((item) => item.kind === channel);
    if (visible) {
      visible.automationEnabled = current.active;
      visible.status =
        action === "disconnect"
          ? "disconnected"
          : current.active
            ? "connected"
            : "automation_paused";
    }
    for (const outbox of integrationState(draft).outbox)
      if (outbox.connectionId === current.id && outbox.status === "prepared") {
        outbox.status = "cancelled";
        outbox.error = "Channel paused or disconnected";
      }
    integrationAudit(draft, actor, `channel.${action}`, current.id);
  });
  if (action === "disconnect") {
    await releaseChannelAsset(actor, channel, connection.assetId);
    try {
      const base =
        channel === "instagram"
          ? "https://graph.instagram.com"
          : "https://graph.facebook.com";
      await providerJson(
        `${base}/${graphVersion()}/${connection.wabaId || connection.assetId}/subscribed_apps`,
        credential!.accessToken,
        "DELETE",
      );
      return { disconnected: true, providerRevoked: true };
    } catch {
      return {
        disconnected: true,
        providerRevoked: false,
        notice:
          "Local credentials were removed and sends stopped. Remove the app in the provider settings to finish revoking provider access.",
      };
    }
  }
  return { active: action === "activate" };
}
