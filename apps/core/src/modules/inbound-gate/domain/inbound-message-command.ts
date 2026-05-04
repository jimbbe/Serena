/**
 * T20 — Channel-agnostic inbound command types.
 *
 * Normalises input from any channel (WhatsApp, voice, web_chat, etc.)
 * into a single shape that the inbound pipeline can consume without
 * channel-specific field names.
 */

import type { InboundChannel } from "../../shared/channel.ts";

export type { InboundChannel };

/** Channel-agnostic input contract for the inbound pipeline. */
export type InboundMessageCommand = {
  /** Source channel identifier. */
  channel: InboundChannel;
  /** Sender identifier as provided by the channel (e.g. WhatsApp ID, phone). */
  externalSenderId: string;
  /** Message text content. */
  text: string;
  /** Multi-tenant identifier (reserved for future). */
  tenantId?: string;
  /** Resolved person identifier (set after contact directory lookup). */
  personId?: string;
  /** Active conversation/session identifier. */
  conversationId?: string;
  /** ISO 8601 timestamp of message receipt (defaults to now). */
  occurredAt?: string;
  /** Channel-specific extras (e.g. media URLs, reaction info). */
  metadata?: Record<string, unknown>;
};
