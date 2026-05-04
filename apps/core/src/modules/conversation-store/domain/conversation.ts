/**
 * T22 — Conversation domain type.
 *
 * Represents a conversation between a person (elder or contact) and
 * Serena. Each conversation belongs to a specific tenant + person pair
 * and tracks status across its lifecycle.
 */

export type ConversationStatus = "open" | "closed" | "archived";

export type Conversation = {
  readonly id: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly status: ConversationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: Record<string, unknown>;
};
