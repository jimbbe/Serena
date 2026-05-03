/**
 * T18 — Normalize Mock WhatsApp Event.
 *
 * Pure function: validates and normalizes a MockWhatsAppEvent into
 * a PipelineInput shape suitable for sending to Serena Core.
 *
 * Validation rules:
 * - messageId MUST be non-empty after trimming
 * - from MUST be non-empty after trimming
 * - text MUST be non-empty after trimming
 * - Reports ALL failing fields, not just the first one found
 */

import type { MockWhatsAppEvent } from "../domain/mock-whatsapp-event.ts";
import type { PipelineInput } from "../domain/pipeline-result.ts";

export function normalizeMockWhatsAppEvent(
  event: MockWhatsAppEvent,
): { ok: true; value: PipelineInput } | { ok: false; error: string } {
  const missingFields: string[] = [];

  const trimmedMessageId = event.messageId.trim();
  const trimmedFrom = event.from.trim();
  const trimmedText = event.text.trim();

  if (!trimmedMessageId) {
    missingFields.push("messageId");
  }
  if (!trimmedFrom) {
    missingFields.push("from");
  }
  if (!trimmedText) {
    missingFields.push("text");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      error: `Missing or empty required fields: ${missingFields.join(", ")}`,
    };
  }

  return {
    ok: true,
    value: {
      senderWhatsAppId: trimmedFrom,
      messageText: trimmedText,
      receivedAt: event.timestamp,
    },
  };
}
