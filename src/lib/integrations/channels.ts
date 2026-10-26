import { IntegrationError, boundedJson, hash } from "./security";
import type {
  ChannelConnection,
  NormalizedEvent,
  SocialChannel,
} from "./types";

export type ChannelCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};
export type SendRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};
export type SendResult =
  | { status: "accepted"; providerId: string }
  | { status: "failed" | "ambiguous"; code: string; retryable: boolean };
export function graphVersion(): string {
  const version = process.env.META_GRAPH_VERSION;
  if (!version || !/^v\d{2}\.\d+$/.test(version))
    throw new IntegrationError(
      "configuration_required",
      "Configure META_GRAPH_VERSION to the version enabled for the reviewed Meta app.",
      503,
    );
  return version;
}
function string(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function timestamp(value: unknown, seconds = false): number {
  const number = Number(value) * (seconds ? 1000 : 1);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
export function normalizeMeta(
  channel: SocialChannel,
  input: unknown,
): NormalizedEvent[] {
  const payload = input as { object?: unknown; entry?: unknown };
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.entry))
    throw new IntegrationError("webhook_shape", "Invalid webhook envelope.");
  const expected =
    channel === "messenger"
      ? "page"
      : channel === "instagram"
        ? "instagram"
        : "whatsapp_business_account";
  if (payload.object !== expected)
    throw new IntegrationError(
      "webhook_channel",
      "Webhook object does not match the configured channel.",
    );
  const events: NormalizedEvent[] = [];
  for (const entry of payload.entry.slice(0, 100)) {
    if (channel === "whatsapp") {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const value = change?.value,
          assetId = string(value?.metadata?.phone_number_id, 120);
        if (!assetId) continue;
        for (const item of Array.isArray(value.messages)
          ? value.messages
          : []) {
          const id = string(item.id, 250),
            customerId = string(item.from, 120);
          if (!id || !customerId) continue;
          const text =
            item.type === "text" ? string(item.text?.body) : undefined;
          events.push({
            id: `${assetId}:${id}`,
            channel,
            assetId,
            customerId,
            providerMessageId: id,
            timestamp: timestamp(item.timestamp, true),
            kind: text ? "message" : "unsupported",
            text,
          });
        }
        for (const status of Array.isArray(value.statuses)
          ? value.statuses
          : []) {
          const id = string(status.id, 250),
            state = string(status.status);
          if (!id || !["sent", "delivered", "read", "failed"].includes(state))
            continue;
          events.push({
            id: `${assetId}:${id}:${state}`,
            channel,
            assetId,
            customerId: string(status.recipient_id, 120),
            providerMessageId: id,
            timestamp: timestamp(status.timestamp, true),
            kind: "status",
            status: state as NormalizedEvent["status"],
            failureCode: string(String(status.errors?.[0]?.code || ""), 40),
          });
        }
      }
    } else {
      const assetId = string(entry.id, 120);
      if (!assetId) continue;
      for (const item of Array.isArray(entry.messaging)
        ? entry.messaging
        : []) {
        const message = item.message,
          echo = message?.is_echo === true,
          customerId = string(echo ? item.recipient?.id : item.sender?.id, 120),
          at = timestamp(item.timestamp);
        if (message) {
          const id = string(message.mid, 250);
          if (!id || !customerId) continue;
          events.push({
            id: `${assetId}:${id}`,
            channel,
            assetId,
            customerId,
            providerMessageId: id,
            timestamp: at,
            kind: echo
              ? "echo"
              : message.is_deleted || !message.text
                ? "unsupported"
                : "message",
            text: string(message.text) || undefined,
          });
        }
        const status = item.delivery
          ? "delivered"
          : item.read
            ? "read"
            : undefined;
        if (status)
          for (const id of item.delivery?.mids || [
            string(item.read?.mid) || `watermark:${item.read?.watermark || 0}`,
          ])
            events.push({
              id: `${assetId}:${id}:${status}`,
              channel,
              assetId,
              customerId,
              providerMessageId: id,
              timestamp: at,
              kind: "status",
              status,
            });
      }
    }
  }
  if (events.length > 500)
    throw new IntegrationError(
      "webhook_limit",
      "Webhook event batch exceeds the supported bound.",
    );
  return events;
}
export function channelEligibility(
  channel: SocialChannel,
  lastInboundAt: string,
  now = Date.now(),
): { allowed: boolean; code: string } {
  const age = now - Date.parse(lastInboundAt);
  if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000)
    return {
      allowed: false,
      code:
        channel === "whatsapp"
          ? "whatsapp_template_required"
          : channel === "instagram"
            ? "instagram_window_closed"
            : "messenger_window_closed",
    };
  return { allowed: true, code: "customer_service_window" };
}
export function buildSendRequest(
  connection: ChannelConnection,
  credential: ChannelCredential,
  recipient: string,
  text: string,
  version = graphVersion(),
): SendRequest {
  const length =
    connection.channel === "instagram"
      ? Buffer.byteLength(text, "utf8")
      : text.length;
  const limit =
    connection.channel === "instagram"
      ? 1000
      : connection.channel === "messenger"
        ? 2000
        : 3900;
  if (!/^[\w:.-]{1,200}$/.test(recipient) || !text || length > limit)
    throw new IntegrationError(
      "send_invalid",
      "Invalid message recipient or channel text length.",
    );
  const root =
    connection.channel === "instagram"
      ? "https://graph.instagram.com"
      : "https://graph.facebook.com";
  const body =
    connection.channel === "whatsapp"
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: false, body: text },
        }
      : connection.channel === "messenger"
        ? {
            recipient: { id: recipient },
            messaging_type: "RESPONSE",
            message: { text },
          }
        : { recipient: { id: recipient }, message: { text } };
  return {
    url: `${root}/${version}/${encodeURIComponent(connection.assetId)}/messages`,
    method: "POST",
    headers: {
      authorization: `Bearer ${credential.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
/** Caller supplies only an approved, freshly resolved private-storage URL. */
export function buildImageSendRequest(
  connection: ChannelConnection,
  credential: ChannelCredential,
  recipient: string,
  imageUrl: string,
  version = graphVersion(),
): SendRequest {
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new IntegrationError(
      "image_url",
      "Provider images require an approved HTTPS asset URL.",
    );
  const request = buildSendRequest(
    connection,
    credential,
    recipient,
    "Approved product image",
    version,
  );
  const body = JSON.parse(request.body);
  if (connection.channel === "whatsapp") {
    delete body.text;
    body.type = "image";
    body.image = { link: imageUrl };
  } else if (connection.channel === "instagram")
    body.message = {
      attachments: [{ type: "image", payload: { url: imageUrl } }],
    };
  else
    body.message = {
      attachment: { type: "image", payload: { url: imageUrl } },
    };
  return { ...request, body: JSON.stringify(body) };
}
export async function sendChannel(
  request: SendRequest,
  transport: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await transport(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    // A timeout, 5xx or malformed acceptance is ambiguous: no blind automatic resend.
    if (response.status >= 500)
      return {
        status: "ambiguous",
        code: `provider_http_${response.status}`,
        retryable: false,
      };
    const value = await boundedJson(response, 60_000);
    if (!response.ok)
      return {
        status: "failed",
        code: `provider_${value.error?.code || response.status}`,
        retryable: response.status === 429,
      };
    const id = value.messages?.[0]?.id || value.message_id;
    if (typeof id !== "string" || !id)
      return {
        status: "ambiguous",
        code: "missing_provider_message_id",
        retryable: false,
      };
    return { status: "accepted", providerId: id };
  } catch {
    return {
      status: "ambiguous",
      code: "transport_or_response_uncertain",
      retryable: false,
    };
  }
}
export async function providerJson(
  url: string,
  token: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<Record<string, any>> {
  const parsed = new URL(url);
  if (
    ![
      "https://graph.facebook.com",
      "https://graph.instagram.com",
      "https://api.instagram.com",
      "https://oauth2.googleapis.com",
    ].includes(parsed.origin)
  )
    throw new IntegrationError(
      "provider_origin",
      "Unsupported provider origin.",
    );
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  const value = await boundedJson(response, 800_000);
  if (!response.ok || value.error)
    throw new IntegrationError(
      "provider_request",
      `The provider rejected this operation (HTTP ${response.status}; code ${String(value.error?.code || "unknown").slice(0, 30)}). Check access, permissions and app review.`,
      502,
    );
  return value;
}
export const responseIdForEvent = (
  businessId: string,
  event: NormalizedEvent,
) => `reply-${hash(`${businessId}:${event.channel}:${event.id}`).slice(0, 40)}`;
