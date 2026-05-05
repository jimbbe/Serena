/**
 * T18 / T30A — Normalize Mock WhatsApp Event.
 *
 * Pure function: validates and normalizes a MockWhatsAppEvent into
 * a PipelineInput shape suitable for sending to Serena Core.
 *
 * Validation rules:
 * - messageId MUST be non-empty after trimming
 * - from MUST be non-empty after trimming
 * - text MUST be non-empty after trimming
 * - timestamp MUST be a valid ISO 8601 string (T30A)
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
  const trimmedTimestamp = (event.timestamp ?? "").trim();

  if (!trimmedMessageId) {
    missingFields.push("messageId");
  }
  if (!trimmedFrom) {
    missingFields.push("from");
  }
  if (!trimmedText) {
    missingFields.push("text");
  }

  // timestamp — required, non-empty, valid ISO 8601 (T30A)
  if (!trimmedTimestamp) {
    missingFields.push("timestamp (required, non-empty)");
  } else if (!isValidIso8601(trimmedTimestamp)) {
    missingFields.push("timestamp (must be valid ISO 8601)");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      error: `Missing or invalid required fields: ${missingFields.join(", ")}`,
    };
  }

  return {
    ok: true,
    value: {
      senderWhatsAppId: trimmedFrom,
      messageText: trimmedText,
      receivedAt: trimmedTimestamp,
    },
  };
}

/** Returns true if value is a parseable ISO 8601 timestamp. */
function isValidIso8601(value: string): boolean {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms);
}
