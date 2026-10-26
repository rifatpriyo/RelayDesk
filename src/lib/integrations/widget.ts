import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor } from "../core/types";
import {
  assertManager,
  claimChannelAsset,
  lookupChannelAsset,
  readBusiness,
  serviceActor,
  transactBusiness,
} from "../core/server";
import { reserveReply, finalizeReply, releaseReply } from "../core/billing";
import { IntegrationError, hash, nonce, safeOrigin } from "./security";
import { integrationState, enforceRate, type WidgetSession } from "./types";
import { generateReply } from "./ai";
import { appOrigin } from "./oauth";
import { integrationAudit } from "./service";

function cacheResponse(
  session: WidgetSession | undefined,
  requestId: string,
  result: WidgetSession["responses"][string],
) {
  if (session) {
    session.responses[requestId] = result;
    const entries = Object.entries(session.responses);
    if (entries.length > 100)
      session.responses = Object.fromEntries(entries.slice(-100));
  }
  return result;
}
function teamAcknowledgement(
  session: WidgetSession | undefined,
  requestId: string,
  simulated: boolean,
) {
  return cacheResponse(session, requestId, {
    text: "Your message is with our team. A staff member can reply in this chat.",
    handover: true,
    at: Date.now(),
    simulated,
  });
}

export async function configureWidget(
  actor: Actor,
  input: { active: boolean; allowedOrigins: string[]; title: string },
) {
  assertManager(actor);
  const origins = [...new Set(input.allowedOrigins.map(safeOrigin))];
  if (origins.length > 10 || (input.active && !origins.length))
    throw new IntegrationError(
      "widget_origins",
      "Add one to ten allowed website origins before activation.",
    );
  const current = await readBusiness(actor),
    id = integrationState(current).widget?.id || `widget_${nonce()}`;
  await claimChannelAsset(actor, "website", id);
  await transactBusiness(actor, (state) => {
    if (input.active && !state.settings.publishedAt)
      throw new IntegrationError(
        "assistant_unpublished",
        "Publish your assistant before activating the widget.",
        409,
      );
    integrationState(state).widget = {
      id,
      active: input.active,
      allowedOrigins: origins,
      title: input.title,
    };
    state.business.allowedWidgetOrigins = origins;
    const channel = state.channels.find((item) => item.kind === "website");
    if (channel) {
      channel.status = input.active ? "connected" : "automation_paused";
      channel.automationEnabled = input.active;
      channel.accountId = id;
      channel.simulated = actor.demo;
    }
    if (!input.active) integrationState(state).sessions = [];
    integrationAudit(state, actor, "widget.configure", id);
  });
  return {
    widget: { id, ...input, allowedOrigins: origins },
    snippet: `<script src="${appOrigin()}/api/widget/loader.js" data-widget="${id}" async></script>`,
  };
}
export async function resolveWidget(id: string) {
  if (!/^widget_[A-Za-z0-9_-]{40,60}$/.test(id))
    throw new IntegrationError("widget_not_found", "Widget unavailable.", 404);
  const businessId = await lookupChannelAsset("website", id);
  if (!businessId)
    throw new IntegrationError("widget_not_found", "Widget unavailable.", 404);
  const actor = serviceActor(businessId),
    state = await readBusiness(actor),
    widget = integrationState(state).widget;
  if (!widget || widget.id !== id || !widget.active)
    throw new IntegrationError(
      "widget_paused",
      "This assistant is currently paused.",
      409,
    );
  return { actor, state, widget };
}
export async function createWidgetSession(
  id: string,
  origin: string,
  clientFingerprint: string,
) {
  const resolved = await resolveWidget(id),
    verifiedOrigin = safeOrigin(origin);
  if (!resolved.widget.allowedOrigins.includes(verifiedOrigin))
    throw new IntegrationError(
      "widget_origin",
      "This website is not allowed to use the widget.",
      403,
    );
  const token = nonce(),
    sessionId = randomUUID(),
    conversationId = `web-${randomUUID()}`;
  await transactBusiness(resolved.actor, (state) => {
    const data = integrationState(state),
      now = Date.now();
    enforceRate(
      data,
      `widget-sessions:${hash(clientFingerprint).slice(0, 16)}`,
      20,
      60 * 60_000,
    );
    enforceRate(data, "widget-sessions:business", 200, 60 * 60_000);
    data.sessions = data.sessions.filter((session) => session.expiresAt > now);
    if (data.sessions.length >= 2000)
      throw new IntegrationError(
        "session_limit",
        "This assistant is busy. Please try again later.",
        429,
      );
    data.sessions.push({
      id: sessionId,
      tokenHash: hash(token),
      origin: verifiedOrigin,
      expiresAt: now + 24 * 60 * 60_000,
      createdAt: now,
      count: 0,
      windowStart: now,
      conversationId,
      responses: {},
    });
    state.conversations.push({
      id: conversationId,
      businessId: state.business.id,
      customerName: "Website visitor",
      customerId: sessionId,
      channel: "website",
      status: "ai",
      assignedTo: null,
      unread: false,
      updatedAt: new Date(now).toISOString(),
      lastInboundAt: new Date(now).toISOString(),
      messages: [],
      generation: 0,
    });
  });
  return {
    token,
    sessionId,
    title: resolved.widget.title,
    businessName: resolved.state.business.name,
    simulated: resolved.actor.demo || process.env.AI_PROVIDER === "demo",
  };
}
export async function widgetChat(input: {
  widgetId: string;
  sessionId: string;
  token: string;
  origin: string;
  message: string;
  requestId: string;
}) {
  const { actor } = await resolveWidget(input.widgetId),
    responseId = `widget-${hash(`${input.sessionId}:${input.requestId}`).slice(0, 40)}`;
  const prepared = await transactBusiness(actor, (state) => {
    const data = integrationState(state),
      session = data.sessions.find(
        (item) =>
          item.id === input.sessionId && item.tokenHash === hash(input.token),
      );
    if (
      !session ||
      session.expiresAt <= Date.now() ||
      session.origin !== input.origin ||
      !data.widget?.allowedOrigins.includes(session.origin)
    )
      throw new IntegrationError(
        "widget_session",
        "Your chat session expired or belongs to a different website.",
        401,
      );
    if (session.responses[input.requestId])
      return {
        cached: session.responses[input.requestId],
        conversationId: session.conversationId,
      };
    const conversation = state.conversations.find(
      (item) => item.id === session.conversationId,
    )!;
    if (conversation.messages.some((message) => message.id === responseId))
      throw new IntegrationError(
        "reply_pending",
        "This message is already being processed.",
        409,
      );
    enforceRate(data, `widget:${session.id}`, 30, 60_000);
    enforceRate(data, "widget:business", 120, 60_000);
    const now = new Date().toISOString();
    conversation.messages.push({
      id: responseId,
      role: "customer",
      text: input.message,
      createdAt: now,
      status: "received",
    });
    conversation.lastInboundAt = now;
    conversation.updatedAt = now;
    conversation.unread = true;
    if (conversation.status !== "ai")
      return {
        cached: teamAcknowledgement(
          session,
          input.requestId,
          actor.demo || process.env.AI_PROVIDER === "demo",
        ),
        conversationId: conversation.id,
      };
    reserveReply(state, responseId);
    return {
      conversationId: conversation.id,
      generation: conversation.generation,
    };
  });
  if (prepared.cached)
    return {
      ...prepared.cached,
      responseId,
      simulated: prepared.cached.simulated ?? actor.demo,
    };
  try {
    const reply = await generateReply(actor, input.message, {
      responseId,
      purpose: "customer",
    });
    return await transactBusiness(actor, (state) => {
      const data = integrationState(state),
        session = data.sessions.find((item) => item.id === input.sessionId)!,
        conversation = state.conversations.find(
          (item) => item.id === prepared.conversationId,
        )!;
      if (
        !data.widget?.active ||
        !session ||
        conversation.status !== "ai" ||
        conversation.generation !== prepared.generation
      ) {
        releaseReply(state, responseId);
        return {
          ...teamAcknowledgement(
            session,
            input.requestId,
            actor.demo || reply.simulated,
          ),
          responseId,
        };
      }
      const result = cacheResponse(session, input.requestId, {
        text: reply.text,
        handover: reply.handover,
        at: Date.now(),
        simulated: reply.simulated,
      });
      conversation.messages.push({
        id: `${responseId}-answer`,
        role: "assistant",
        text: reply.text,
        createdAt: new Date().toISOString(),
        status: "sent",
        sourceIds: reply.sourceIds,
      });
      if (reply.handover) {
        conversation.status = "handover";
        conversation.generation++;
        conversation.handoverReason = "Website customer needs staff review.";
      }
      finalizeReply(state, responseId);
      return { ...result, responseId };
    });
  } catch {
    return transactBusiness(actor, (state) => {
      releaseReply(state, responseId);
      const conversation = state.conversations.find(
        (item) => item.id === prepared.conversationId,
      );
      if (conversation) {
        conversation.status = "handover";
        conversation.generation++;
        conversation.handoverReason =
          "Assistant unavailable; website customer needs a person.";
      }
      const session = integrationState(state).sessions.find(
        (item) => item.id === input.sessionId,
      );
      return {
        ...teamAcknowledgement(
          session,
          input.requestId,
          actor.demo || process.env.AI_PROVIDER === "demo",
        ),
        responseId,
      };
    });
  }
}
export async function widgetMessages(input: {
  widgetId: string;
  sessionId: string;
  token: string;
  origin: string;
}) {
  const { actor, state } = await resolveWidget(input.widgetId),
    session = integrationState(state).sessions.find(
      (item) =>
        item.id === input.sessionId &&
        item.tokenHash === hash(input.token) &&
        item.origin === input.origin &&
        item.expiresAt > Date.now(),
    );
  if (!session)
    throw new IntegrationError("widget_session", "Chat session expired.", 401);
  await transactBusiness(actor, (draft) =>
    enforceRate(
      integrationState(draft),
      `widget-poll:${session.id}`,
      30,
      60_000,
    ),
  );
  const conversation = state.conversations.find(
    (item) => item.id === session.conversationId,
  );
  return {
    messages:
      conversation?.messages
        .filter((message) => ["assistant", "staff"].includes(message.role))
        .slice(-30)
        .map(({ id, role, text, createdAt }) => ({
          id,
          role,
          text,
          createdAt,
        })) || [],
    status: conversation?.status,
  };
}
