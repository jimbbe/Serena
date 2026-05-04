/**
 * T22 — ConversationStore module barrel.
 */

export type { Conversation, ConversationStatus } from "./domain/conversation.ts";
export type {
  ConversationMessage,
  MessageDirection,
} from "./domain/conversation-message.ts";
export type {
  ConversationStore,
  FindOrCreateConversationInput,
} from "./port/conversation-store.ts";
export { InMemoryConversationStore } from "./adapter/in-memory-conversation-store.ts";
