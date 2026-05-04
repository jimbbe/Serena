/**
 * T22 — ConversationStore port.
 *
 * Abstracts conversation + message persistence behind a type alias
 * following the existing port convention (matching MediationBridgeSessionStore).
 */

import type { Conversation } from "../domain/conversation.ts";
import type { ConversationMessage } from "../domain/conversation-message.ts";

export type FindOrCreateConversationInput = {
  readonly tenantId: string;
  readonly personId: string;
  readonly conversationId?: string;
};

export type ConversationStore = {
  findOrCreateConversation(
    input: FindOrCreateConversationInput,
  ): Promise<Conversation>;

  getConversation(conversationId: string): Promise<Conversation | undefined>;

  appendMessage(message: ConversationMessage): Promise<ConversationMessage>;

  listMessages(conversationId: string): Promise<ConversationMessage[]>;
};
