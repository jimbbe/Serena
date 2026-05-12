/**
 * T5 — Webhook self-message filter.
 *
 * Pure functions to discard self-messages (fromMe:true) and non-text messages
 * from Evolution API webhook payloads. Zero side effects, trivially testable.
 */

import type { EvolutionWebhookPayload } from "../evolution/types.ts";

/**
 * Check if a webhook payload is a self-message (sent by the instance itself).
 * Self-messages must be discarded to prevent echo loops.
 */
export function isSelfMessage(payload: EvolutionWebhookPayload): boolean {
  return payload.data.key.fromMe === true;
}

/**
 * Extract text content from a webhook payload.
 * Prefers `conversation` over `extendedTextMessage.text`.
 * Returns null if no text field is present or the value is empty.
 */
export function extractText(payload: EvolutionWebhookPayload): string | null {
  const msg = payload.data.message;

  // Prefer conversation (direct text messages)
  if (msg.conversation !== undefined && msg.conversation !== null) {
    const trimmed = msg.conversation.trim();
    if (trimmed.length > 0) return trimmed;
  }

  // Fallback to extendedTextMessage (replies, long messages)
  if (msg.extendedTextMessage?.text) {
    const trimmed = msg.extendedTextMessage.text.trim();
    if (trimmed.length > 0) return trimmed;
  }

  return null;
}

/**
 * Determine if a webhook payload should be discarded.
 * Returns discard decision with reason.
 */
export function shouldDiscard(payload: EvolutionWebhookPayload): {
  discard: boolean;
  reason?: string;
} {
  // Self-message check takes priority
  if (isSelfMessage(payload)) {
    return { discard: true, reason: "self_message" };
  }

  // Non-text check
  const text = extractText(payload);
  if (text === null) {
    return { discard: true, reason: "non-text" };
  }

  return { discard: false };
}
