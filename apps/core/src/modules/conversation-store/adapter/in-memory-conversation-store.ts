/**
 * T22 — In-memory ConversationStore adapter.
 *
 * Uses Maps for conversation and message storage. Follows the same
 * pattern as InMemoryMediationBridgeSessionStore.
 */

import { randomUUID } from "node:crypto";

import type { Conversation } from "../domain/conversation.ts";
import type { ConversationMessage } from "../domain/conversation-message.ts";
import type {
  ConversationStore,
  FindOrCreateConversationInput,
} from "../port/conversation-store.ts";

export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage[]>();

  async findOrCreateConversation(
    input: FindOrCreateConversationInput,
  ): Promise<Conversation> {
    // If conversationId is provided and exists, return it (update updatedAt)
    if (input.conversationId !== undefined) {
      const existing = this.conversations.get(input.conversationId);
      if (existing && existing.tenantId === input.tenantId && existing.personId === input.personId) {
        const updated: Conversation = {
          ...existing,
          updatedAt: new Date(),
        };
        this.conversations.set(existing.id, updated);
        return updated;
      }
    }

    // Create new conversation
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = {
      id,
      tenantId: input.tenantId,
      personId: input.personId,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(id, conversation);
    return conversation;
  }

  async getConversation(
    conversationId: string,
  ): Promise<Conversation | undefined> {
    return this.conversations.get(conversationId);
  }

  async appendMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    const msgs = this.messages.get(message.conversationId) ?? [];
    msgs.push(message);
    this.messages.set(message.conversationId, msgs);

    // Update conversation updatedAt
    const conversation = this.conversations.get(message.conversationId);
    if (conversation !== undefined) {
      this.conversations.set(message.conversationId, {
        ...conversation,
        updatedAt: new Date(),
      });
    }

    return message;
  }

  async listMessages(
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    return this.messages.get(conversationId) ?? [];
  }
}
