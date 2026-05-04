/**
 * T22 — ConversationMessage domain type.
 *
 * Represents a single message within a conversation, capturing both
 * inbound (from the person to Serena) and outbound (from Serena to
 * the person) messages along with the channel they arrived/departed on.
 */

import type { InboundChannel } from "../../shared/channel.ts";

export type MessageDirection = "inbound" | "outbound";

export type ConversationMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly channel: InboundChannel;
  readonly direction: MessageDirection;
  readonly text: string;
  readonly occurredAt: Date;
  readonly metadata?: Record<string, unknown>;
};
