import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor, BusinessState } from "../core/types";
import {
  readBusiness,
  transactBusiness,
  serviceActor,
  lookupChannelAsset,
  assertManager,
} from "../core/server";
import { resolveApprovedProductImage } from "../core/assets";
import { fileAssets } from "../core/asset-policy";
import {
  reserveReply,
  finalizeReply,
  releaseReply,
  reverseReply,
  reconcileSubscription,
} from "../core/billing";
import { applyRetention } from "../core/commands";
import { IntegrationError, hash } from "./security";
import {
  integrationState,
  enforceRate,
  type NormalizedEvent,
  type OutboundRecord,
} from "./types";
import {
  buildSendRequest,
  buildImageSendRequest,
  channelEligibility,
  responseIdForEvent,
  sendChannel,
} from "./channels";
import { connectionCredential } from "./oauth";
import { generateReply } from "./ai";
import { integrationAudit } from "./service";
import { activeRules } from "./retrieval";

function conversationKey(event: NormalizedEvent) {
  return `channel-${hash(`${event.channel}:${event.assetId}:${event.customerId}`).slice(0, 36)}`;
}
/** Provider limits are bytes for Instagram, characters for the other supported text APIs. */
export function splitChannelText(text: string, channel: string): string[] {
  const parts: string[] = [];
  let part = "",
    size = 0;
  const max =
    channel === "instagram" ? 1000 : channel === "messenger" ? 2000 : 3900;
  for (const char of text) {
    const weight =
      channel === "instagram" ? Buffer.byteLength(char, "utf8") : char.length;
    if (size + weight > max) {
      parts.push(part);
      part = "";
      size = 0;
    }
    part += char;
    size += weight;
  }
  if (part) parts.push(part);
  return parts;
}
function rootResponse(item: OutboundRecord) {
  return item.parentResponseId || item.id;
}
const acceptedStates = ["accepted", "delivered", "read"];
function responseParts(state: BusinessState, item: OutboundRecord) {
  return integrationState(state).outbox.filter(
    (part) => rootResponse(part) === rootResponse(item),
  );
}
/** One reservation belongs to the whole customer-facing response, including image/text bubbles. */
function settleResponse(state: BusinessState, item: OutboundRecord) {
  const data = integrationState(state),
    parts = responseParts(state, item),
    root = parts.find((part) => part.id === rootResponse(item));
  if (!root) return;
  const failure = parts.find((part) =>
    ["failed", "cancelled"].includes(part.status),
  );
  if (failure) {
    for (const part of parts.filter((part) => part.status === "prepared")) {
      part.status = "cancelled";
      part.error =
        "Another part of this response failed. Staff review is required.";
      const message = state.conversations
        .find((conversation) => conversation.id === part.conversationId)
        ?.messages.find((message) => message.id === part.id);
      if (message) message.status = "failed";
    }
    if (root.mode === "ai") {
      releaseReply(state, root.id);
      const reservation = reverseReply(state, root.id);
      if (reservation?.status === "reversed") root.reversed = true;
    }
  }
  const complete = parts.every((part) => acceptedStates.includes(part.status)),
    uncertain = parts.some((part) => part.status === "ambiguous");
  if (complete && root.mode === "ai") {
    finalizeReply(state, root.id);
    root.billed = true;
  }
  const conversation = state.conversations.find(
    (conversation) => conversation.id === root.conversationId,
  );
  if (
    conversation?.status === "ai" &&
    (failure || (complete && conversation.handoverReason))
  ) {
    conversation.status = "handover";
    conversation.generation++;
    conversation.handoverReason ||= failure
      ? "A response could not be delivered. Staff review is required."
      : "Assistant requested staff review.";
  }
  const job = data.inbox.find((job) => job.id === root.jobId);
  if (job) {
    job.status =
      failure || uncertain ? "failed" : complete ? "completed" : "processing";
    job.error =
      failure?.error ||
      parts.find((part) => part.status === "ambiguous")?.error;
    if (job.status !== "processing") job.leaseUntil = undefined;
  }
}
export async function persistInbound(
  event: NormalizedEvent,
): Promise<{ businessId: string; jobId: string } | null> {
  const businessId = await lookupChannelAsset(event.channel, event.assetId);
  if (!businessId) return null;
  const actor = serviceActor(businessId),
    jobId = `event-${hash(`${event.channel}:${event.id}`).slice(0, 40)}`;
  await transactBusiness(actor, (state) => {
    const data = integrationState(state),
      connection = data.connections.find(
        (item) =>
          item.channel === event.channel &&
          item.assetId === event.assetId &&
          item.state !== "disconnected",
      );
    if (!connection)
      throw new IntegrationError(
        "mapping_stale",
        "This channel mapping is no longer active.",
        409,
      );
    if (data.inbox.some((item) => item.id === jobId)) return;
    enforceRate(data, `webhook:${event.channel}`, 500, 60_000);
    if (
      data.inbox.filter(
        (item) => !["completed", "failed"].includes(item.status),
      ).length >= 1000
    )
      throw new IntegrationError(
        "queue_full",
        "The business message queue is full.",
        503,
      );
    data.inbox.push({
      id: jobId,
      event,
      status: "pending",
      createdAt: new Date().toISOString(),
      attempts: 0,
      responseId: responseIdForEvent(businessId, event),
    });
  });
  return { businessId, jobId };
}
function updateDelivery(
  state: Awaited<ReturnType<typeof readBusiness>>,
  event: NormalizedEvent,
) {
  const data = integrationState(state),
    outbound = data.outbox.find(
      (item) =>
        item.channel === event.channel &&
        item.providerId === event.providerMessageId,
    );
  if (!outbound) return;
  const status = event.status;
  if (!status) return;
  const rank = {
    prepared: 0,
    sending: 1,
    accepted: 2,
    delivered: 3,
    read: 4,
    failed: 5,
    ambiguous: 1,
    cancelled: 5,
  };
  if (status === "failed") {
    if (["delivered", "read"].includes(outbound.status)) return;
    outbound.status = "failed";
    outbound.error = `Provider delivery failure ${event.failureCode || ""}`;
  } else {
    const target = status === "sent" ? "accepted" : status;
    if (rank[target] > rank[outbound.status]) outbound.status = target;
  }
  const message = state.conversations
    .find((item) => item.id === outbound.conversationId)
    ?.messages.find((item) => item.id === outbound.id);
  if (message && status === "failed") message.status = "failed";
  settleResponse(state, outbound);
}
export async function prepareInbound(
  businessId: string,
  jobId: string,
): Promise<boolean> {
  const actor = serviceActor(businessId),
    initial = await readBusiness(actor),
    stored = integrationState(initial).inbox.find((item) => item.id === jobId);
  if (!stored) return false;
  if (
    (await lookupChannelAsset(stored.event.channel, stored.event.assetId)) !==
    businessId
  )
    throw new IntegrationError(
      "job_tenant",
      "The verified channel mapping no longer belongs to this business.",
      403,
    );
  return transactBusiness(actor, (state) => {
    const data = integrationState(state),
      job = data.inbox.find((item) => item.id === jobId)!;
    if (job.status === "completed" || job.status === "failed") return false;
    if (job.status === "processing" && (job.leaseUntil || 0) > Date.now())
      return false;
    if (job.attempts >= 3) {
      job.status = "failed";
      job.error = "Retry limit reached; operator review required.";
      return false;
    }
    const event = job.event,
      conversationId = conversationKey(event);
    job.conversationId = conversationId;
    if (event.kind === "status") {
      updateDelivery(state, event);
      job.status = "completed";
      return false;
    }
    if (!event.customerId) {
      job.status = "completed";
      return false;
    }
    let conversation = state.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) {
      conversation = {
        id: conversationId,
        businessId,
        customerName: `${event.channel} customer`,
        customerId: event.customerId,
        channel: event.channel,
        status: "ai",
        assignedTo: null,
        unread: true,
        updatedAt: new Date().toISOString(),
        lastInboundAt: new Date(event.timestamp || 0).toISOString(),
        messages: [],
        generation: 0,
      };
      state.conversations.push(conversation);
    }
    if (event.kind === "echo") {
      if (
        data.outbox.some(
          (item) =>
            item.channel === event.channel &&
            item.customerId === event.customerId &&
            item.status === "sending",
        )
      )
        throw new IntegrationError(
          "echo_pending_acceptance",
          "Wait for the in-flight send before classifying this echo.",
          409,
        );
      if (
        !data.outbox.some((item) => item.providerId === event.providerMessageId)
      ) {
        conversation.status = "manual";
        conversation.generation++;
        conversation.messages.push({
          id: jobId,
          role: "staff",
          text: event.text || "[Message sent in provider inbox]",
          createdAt: new Date(event.timestamp || Date.now()).toISOString(),
          status: "sent",
          providerId: event.providerMessageId,
        });
      }
      job.status = "completed";
      return false;
    }
    if (!conversation.messages.some((item) => item.id === jobId)) {
      conversation.messages.push({
        id: jobId,
        role: "customer",
        text:
          event.kind === "unsupported"
            ? "[Unsupported attachment or deleted message]"
            : event.text || "",
        createdAt: new Date(event.timestamp || Date.now()).toISOString(),
        status: "received",
        providerId: event.providerMessageId,
      });
      conversation.unread = true;
      conversation.updatedAt = new Date().toISOString();
      if (
        event.timestamp <= Date.now() + 60_000 &&
        event.timestamp > Date.parse(conversation.lastInboundAt)
      )
        conversation.lastInboundAt = new Date(event.timestamp).toISOString();
    }
    if (event.kind === "unsupported") {
      conversation.status = "handover";
      conversation.handoverReason =
        "Unsupported attachment or message. Staff review required.";
      conversation.generation++;
      job.status = "completed";
      return false;
    }
    const connection = data.connections.find(
      (item) =>
        item.channel === event.channel &&
        item.assetId === event.assetId &&
        item.state === "connected" &&
        item.active,
    );
    if (
      !connection ||
      conversation.status !== "ai" ||
      !channelEligibility(event.channel, conversation.lastInboundAt).allowed ||
      state.billing.subscription.planId === "free"
    ) {
      job.status = "completed";
      return false;
    }
    const blocking = data.inbox.some(
      (item) =>
        item.id !== job.id &&
        item.conversationId === conversationId &&
        item.status === "processing" &&
        (item.leaseUntil || 0) > Date.now(),
    );
    if (blocking)
      throw new IntegrationError(
        "conversation_busy",
        "Another message in this conversation is being processed.",
        409,
      );
    if (data.outbox.some((item) => item.id === job.responseId)) {
      job.status = "processing";
      return true;
    }
    reserveReply(state, job.responseId);
    job.status = "processing";
    job.attempts++;
    job.leaseUntil = Date.now() + 90_000;
    return true;
  });
}
export async function generateInbound(businessId: string, jobId: string) {
  const actor = serviceActor(businessId),
    state = await readBusiness(actor),
    data = integrationState(state),
    job = data.inbox.find((item) => item.id === jobId);
  if (
    !job ||
    job.status !== "processing" ||
    data.outbox.some((item) => item.id === job.responseId)
  )
    return;
  const generation = state.conversations.find(
    (item) => item.id === job.conversationId,
  )?.generation;
  try {
    const reply = await generateReply(actor, job.event.text || "", {
      responseId: job.responseId,
      purpose: "customer",
    });
    await transactBusiness(actor, (state) => {
      const data = integrationState(state),
        current = data.inbox.find((item) => item.id === jobId)!,
        conversation = state.conversations.find(
          (item) => item.id === current.conversationId,
        ),
        connection = data.connections.find(
          (item) =>
            item.channel === job.event.channel &&
            item.assetId === job.event.assetId &&
            item.state === "connected" &&
            item.active,
        );
      if (
        !conversation ||
        !connection ||
        conversation.status !== "ai" ||
        conversation.generation !== generation
      ) {
        releaseReply(state, current.responseId);
        current.status = "completed";
        return;
      }
      if (data.outbox.some((item) => item.id === current.responseId)) return;
      const at = new Date().toISOString(),
        base: OutboundRecord = {
          id: current.responseId,
          jobId,
          channel: job.event.channel,
          connectionId: connection.id,
          conversationId: conversation.id,
          customerId: job.event.customerId,
          text: reply.text,
          mode: "ai",
          status: "prepared",
          createdAt: at,
          updatedAt: at,
          revision: conversation.generation,
          rulesFingerprint: hash(
            JSON.stringify(activeRules(state.rules, businessId, new Date())),
          ),
        };
      splitChannelText(reply.text, job.event.channel).forEach((text, index) => {
        const id = index
          ? `${current.responseId}-part-${index}`
          : current.responseId;
        data.outbox.push({
          ...base,
          id,
          text,
          parentResponseId: index ? current.responseId : undefined,
        });
        conversation.messages.push({
          id,
          role: "assistant",
          text,
          createdAt: at,
          status: "queued",
          sourceIds: reply.sourceIds,
        });
      });
      const matches =
        /(photo|picture|image|ছবি|chobi)/i.test(job.event.text || "") &&
        !reply.handover
          ? state.catalog.filter(
              (item) =>
                reply.sourceIds.includes(item.id) &&
                item.businessId === businessId &&
                item.imageApproved &&
                !item.archived &&
                fileAssets(state).some(
                  (asset) =>
                    item.image === `/api/assets/${asset.id}` &&
                    asset.businessId === businessId &&
                    asset.status === "ready" &&
                    ["image/png", "image/jpeg"].includes(asset.mime) &&
                    asset.size <= 5 * 1024 * 1024,
                ),
            )
          : [];
      const product = matches.length === 1 ? matches[0] : undefined;
      if (product) {
        const id = `${current.responseId}-image`;
        data.outbox.push({
          ...base,
          id,
          text: `Approved catalog image: ${product.name}`,
          parentResponseId: current.responseId,
          imageProductId: product.id,
          imageReference: product.image,
        });
        conversation.messages.push({
          id,
          role: "assistant",
          text: `Approved catalog image: ${product.name}`,
          createdAt: at,
          status: "queued",
          sourceIds: [product.id],
        });
      }
      if (reply.handover)
        conversation.handoverReason =
          "Assistant requested staff review after its queued handover response.";
    });
  } catch (error) {
    await transactBusiness(actor, (state) => {
      const job = integrationState(state).inbox.find(
        (item) => item.id === jobId,
      )!;
      job.status = "failed";
      job.error =
        error instanceof IntegrationError
          ? error.message
          : "Reply generation failed. Staff review required.";
      releaseReply(state, job.responseId);
      const conversation = state.conversations.find(
        (item) => item.id === job.conversationId,
      );
      if (conversation) {
        conversation.status = "handover";
        conversation.generation++;
        conversation.handoverReason = job.error;
      }
    });
  }
}
export async function deliverOutbound(businessId: string, responseId: string) {
  const actor = serviceActor(businessId),
    initial = await readBusiness(actor),
    outbound = integrationState(initial).outbox.find(
      (item) => item.id === responseId,
    );
  if (!outbound) return;
  if (
    [
      "accepted",
      "delivered",
      "read",
      "cancelled",
      "failed",
      "ambiguous",
    ].includes(outbound.status)
  )
    return;
  if (outbound.status === "sending") {
    await transactBusiness(actor, (state) => {
      const item = integrationState(state).outbox.find(
        (item) => item.id === responseId,
      )!;
      item.status = "ambiguous";
      item.error =
        "A previous send started without durable acceptance. Reconcile in the provider inbox; do not blindly retry.";
      const message = state.conversations
        .find((entry) => entry.id === item.conversationId)
        ?.messages.find((message) => message.id === item.id);
      if (message) message.status = "uncertain";
      settleResponse(state, item);
    });
    return;
  }
  const previous = responseParts(initial, outbound);
  if (
    previous
      .slice(
        0,
        previous.findIndex((item) => item.id === outbound.id),
      )
      .some((item) => !acceptedStates.includes(item.status))
  )
    return;
  const connection = integrationState(initial).connections.find(
    (item) => item.id === outbound.connectionId,
  );
  let request;
  try {
    if (!connection)
      throw new IntegrationError(
        "channel_disconnected",
        "The channel is no longer connected.",
      );
    const credential = await connectionCredential(actor, connection);
    if (outbound.imageProductId) {
      const product = initial.catalog.find(
        (item) => item.id === outbound.imageProductId,
      );
      const url = product
        ? await resolveApprovedProductImage(actor, product)
        : null;
      if (!url)
        throw new IntegrationError(
          "image_unavailable",
          "The approved product image is no longer available.",
        );
      request = buildImageSendRequest(
        connection,
        credential,
        outbound.customerId,
        url,
      );
    } else
      request = buildSendRequest(
        connection,
        credential,
        outbound.customerId,
        outbound.text,
      );
  } catch (error) {
    await transactBusiness(actor, (state) => {
      const item = integrationState(state).outbox.find(
        (item) => item.id === responseId,
      )!;
      if (item.status !== "prepared") return;
      item.status = "failed";
      item.error =
        error instanceof IntegrationError
          ? error.message
          : "Channel authorization or approved media resolution failed.";
      const message = state.conversations
        .find((conversation) => conversation.id === item.conversationId)
        ?.messages.find((message) => message.id === item.id);
      if (message) message.status = "failed";
      settleResponse(state, item);
    });
    return;
  }
  // This transaction is the final authorization gate before the single send attempt.
  const ready = await transactBusiness(actor, (state) => {
    const data = integrationState(state),
      item = data.outbox.find((item) => item.id === responseId)!,
      conversation = state.conversations.find(
        (entry) => entry.id === item.conversationId,
      ),
      current = data.connections.find(
        (entry) => entry.id === item.connectionId,
      ),
      eligibility = conversation
        ? channelEligibility(item.channel, conversation.lastInboundAt)
        : { allowed: false, code: "conversation_missing" };
    const rulesChanged =
      item.rulesFingerprint !== undefined &&
      item.rulesFingerprint !==
        hash(JSON.stringify(activeRules(state.rules, businessId, new Date())));
    if (item.status !== "prepared") return false;
    const parts = responseParts(state, item),
      image = item.imageProductId
        ? state.catalog.find(
            (product) =>
              product.id === item.imageProductId &&
              product.businessId === businessId &&
              product.imageApproved &&
              !product.archived &&
              product.image === item.imageReference,
          )
        : undefined;
    if (
      parts
        .slice(
          0,
          parts.findIndex((part) => part.id === item.id),
        )
        .some((part) => !acceptedStates.includes(part.status))
    )
      return false;
    if (
      !conversation ||
      !current ||
      current.state !== "connected" ||
      (item.imageProductId && !image) ||
      (item.mode === "ai" &&
        (!current.active ||
          conversation.status !== "ai" ||
          conversation.generation !== item.revision ||
          rulesChanged)) ||
      !eligibility.allowed
    ) {
      item.status = "cancelled";
      item.error = rulesChanged
        ? "A temporary change became effective; staff must review the reply."
        : eligibility.allowed
          ? "Automation or image approval changed before sending."
          : eligibility.code;
      const message = conversation?.messages.find(
        (message) => message.id === item.id,
      );
      if (message) message.status = "failed";
      settleResponse(state, item);
      return false;
    }
    item.status = "sending";
    item.updatedAt = new Date().toISOString();
    return true;
  });
  if (!ready) return;
  const sent = await sendChannel(request);
  await transactBusiness(actor, (state) => {
    const data = integrationState(state),
      item = data.outbox.find((item) => item.id === responseId)!;
    item.status = sent.status;
    item.updatedAt = new Date().toISOString();
    const conversation = state.conversations.find(
        (entry) => entry.id === item.conversationId,
      ),
      message = conversation?.messages.find((entry) => entry.id === item.id);
    if (sent.status === "accepted") {
      item.providerId = sent.providerId;
      if (message) {
        message.status = "sent";
        message.providerId = sent.providerId;
      }
      for (const status of data.inbox.filter(
        (job) =>
          job.event.kind === "status" &&
          job.event.providerMessageId === sent.providerId,
      ))
        updateDelivery(state, status.event);
    } else {
      item.error = sent.code;
      if (message)
        message.status = sent.status === "ambiguous" ? "uncertain" : "failed";
    }
    settleResponse(state, item);
  });
}
export async function deliverResponse(businessId: string, responseId: string) {
  const state = await readBusiness(serviceActor(businessId)),
    item = integrationState(state).outbox.find(
      (item) => item.id === responseId,
    );
  if (!item) return;
  for (const part of responseParts(state, item))
    await deliverOutbound(businessId, part.id);
}
export async function processInboundJob(businessId: string, jobId: string) {
  if (!(await prepareInbound(businessId, jobId))) return;
  await generateInbound(businessId, jobId);
  const state = await readBusiness(serviceActor(businessId)),
    job = integrationState(state).inbox.find((item) => item.id === jobId);
  if (job) await deliverResponse(businessId, job.responseId);
}
export async function queueStaffReply(
  actor: Actor,
  conversationId: string,
  text: string,
) {
  // All business roles may reply; only a tenant-authorized conversation determines its recipient.
  if (!text.trim() || text.length > 3900)
    throw new IntegrationError(
      "reply_length",
      "Write a reply of up to 3,900 characters.",
    );
  const id = `staff-${randomUUID()}`;
  await transactBusiness(actor, (state) => {
    const conversation = state.conversations.find(
      (item) =>
        item.id === conversationId && item.businessId === actor.businessId,
    );
    if (!conversation || conversation.channel === "website")
      throw new IntegrationError(
        "conversation_channel",
        "This route handles a connected social-channel conversation.",
        404,
      );
    const data = integrationState(state),
      connection = data.connections.find(
        (item) =>
          item.channel === conversation.channel && item.state === "connected",
      );
    if (!connection)
      throw new IntegrationError(
        "channel_disconnected",
        "Reconnect the originating channel.",
        409,
      );
    const eligible = channelEligibility(
      connection.channel,
      conversation.lastInboundAt,
    );
    if (!eligible.allowed)
      throw new IntegrationError(
        eligible.code,
        "The provider response window has closed. WhatsApp requires an approved template; Messenger/Instagram do not inherit that exception.",
        409,
      );
    enforceRate(data, `staff:${actor.userId}`, 60, 60_000);
    conversation.status = "manual";
    conversation.generation++;
    const at = new Date().toISOString();
    const record: OutboundRecord = {
      id,
      jobId: id,
      channel: connection.channel,
      connectionId: connection.id,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      text,
      mode: "human",
      status: "prepared",
      createdAt: at,
      updatedAt: at,
      revision: conversation.generation,
    };
    splitChannelText(text, connection.channel).forEach((part, index) => {
      const partId = index ? `${id}-part-${index}` : id;
      data.outbox.push({
        ...record,
        id: partId,
        text: part,
        parentResponseId: index ? id : undefined,
      });
      conversation.messages.push({
        id: partId,
        role: "staff",
        text: part,
        createdAt: at,
        status: "queued",
      });
    });
    integrationAudit(state, actor, "staff.reply_queued", conversation.id);
  });
  return { responseId: id, businessId: actor.businessId };
}
export async function reconcileOutbound(
  actor: Actor,
  responseId: string,
  decision: "failed" | "accepted",
  providerId?: string,
) {
  assertManager(actor);
  await transactBusiness(actor, (state) => {
    const data = integrationState(state),
      item = data.outbox.find((item) => item.id === responseId);
    if (!item || !["ambiguous", "sending"].includes(item.status))
      throw new IntegrationError(
        "outbox_state",
        "Only ambiguous sends can be reconciled.",
        409,
      );
    if (
      decision === "accepted" &&
      (!providerId ||
        providerId.length > 250 ||
        data.outbox.some(
          (other) =>
            other.id !== item.id &&
            other.channel === item.channel &&
            other.providerId === providerId,
        ))
    )
      throw new IntegrationError(
        "provider_id_required",
        "Supply a unique confirmed provider message ID.",
      );
    item.status = decision;
    item.providerId = decision === "accepted" ? providerId : undefined;
    item.error =
      decision === "failed"
        ? "Operator confirmed the response was not delivered."
        : undefined;
    const message = state.conversations
      .find((conv) => conv.id === item.conversationId)
      ?.messages.find((message) => message.id === item.id);
    if (message) {
      message.status = decision === "accepted" ? "sent" : "failed";
      message.providerId = item.providerId;
    }
    if (decision === "accepted")
      for (const status of data.inbox.filter(
        (job) =>
          job.event.kind === "status" &&
          job.event.providerMessageId === providerId,
      ))
        updateDelivery(state, status.event);
    settleResponse(state, item);
    integrationAudit(
      state,
      actor,
      `outbound.reconciled_${decision}`,
      responseId,
    );
  });
  return { reconciled: true };
}

/** No provider calls or inferred delivery results. Stalled sends remain operator decisions. */
export async function maintainBusiness(businessId: string, now = new Date()) {
  const actor = serviceActor(businessId);
  return transactBusiness(actor, (state) => {
    const data = integrationState(state);
    let uncertain = 0,
      released = 0;
    for (const item of data.outbox) {
      if (
        item.status === "sending" &&
        Date.parse(item.updatedAt) < now.getTime() - 120_000
      ) {
        item.status = "ambiguous";
        item.error =
          "Send acknowledgement was not persisted. Check the provider before reconciling; do not resend.";
        uncertain++;
        const message = state.conversations
          .find((c) => c.id === item.conversationId)
          ?.messages.find((m) => m.id === item.id);
        if (message) message.status = "uncertain";
      }
      if (item.status === "prepared") {
        const connection = data.connections.find(
            (c) => c.id === item.connectionId,
          ),
          conversation = state.conversations.find(
            (c) => c.id === item.conversationId,
          );
        if (
          !connection ||
          connection.state !== "connected" ||
          !conversation ||
          (item.mode === "ai" &&
            (!connection.active ||
              conversation.status !== "ai" ||
              conversation.generation !== item.revision))
        ) {
          item.status = "cancelled";
          item.error =
            "Automation, membership state, or channel availability changed before delivery.";
          const message = conversation?.messages.find((m) => m.id === item.id);
          if (message) message.status = "failed";
        }
      }
    }
    for (const root of data.outbox.filter((item) => !item.parentResponseId))
      settleResponse(state, root);
    for (const reservation of state.billing.reservations) {
      if (
        reservation.status !== "reserved" ||
        Date.parse(reservation.updatedAt) >= now.getTime() - 30 * 60_000 ||
        data.outbox.some(
          (item) => rootResponse(item) === reservation.responseId,
        )
      )
        continue;
      releaseReply(state, reservation.responseId, now);
      released++;
      const job = data.inbox.find(
        (item) => item.responseId === reservation.responseId,
      );
      if (job) {
        job.status = "failed";
        job.leaseUntil = undefined;
        job.error =
          "Processing did not produce a durable reply. Staff review is required; inference will not be repeated automatically.";
      }
      const conversation = state.conversations.find(
        (item) =>
          item.id === job?.conversationId ||
          item.messages.some(
            (message) => message.id === reservation.responseId,
          ),
      );
      if (conversation && conversation.status === "ai") {
        conversation.status = "handover";
        conversation.generation++;
        conversation.handoverReason =
          "Assistant processing stopped. Staff review is required.";
      }
    }
    // Retention may remove unresolved delivery records. Release their uncommitted quota,
    // without claiming provider failure or retaining customer content past the owner's limit.
    const cutoff = now.getTime() - state.business.retentionDays * 86400000;
    for (const item of data.outbox) {
      const conversation = state.conversations.find(
        (c) => c.id === item.conversationId,
      );
      if (
        Date.parse(item.createdAt) < cutoff ||
        (conversation && Date.parse(conversation.updatedAt) < cutoff)
      ) {
        const reservation = state.billing.reservations.find(
          (r) => r.responseId === rootResponse(item),
        );
        if (reservation?.status === "reserved") {
          releaseReply(state, reservation.responseId, now);
          released++;
        }
      }
    }
    reconcileSubscription(state, now);
    const retention = applyRetention(state, now);
    data.oauth = data.oauth.filter(
      (attempt) => attempt.expiresAt > now.getTime(),
    );
    return { uncertain, released, ...retention };
  });
}
