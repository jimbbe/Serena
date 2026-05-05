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

  // timestamp — required, non-empty, valid ISO 8601 UTC (T30A)
  if (!trimmedTimestamp) {
    missingFields.push("timestamp (required, non-empty)");
  } else if (!isValidIso8601UtcTimestamp(trimmedTimestamp)) {
    missingFields.push("timestamp (must be a valid ISO 8601 UTC timestamp)");
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

/**
 * Validates that a string is a strict ISO 8601 UTC timestamp with Z suffix.
 * Accepted formats:
 *   - 2026-05-05T12:34:56Z
 *   - 2026-05-05T12:34:56.789Z
 * Rejected:
 *   - Empty strings
 *   - Non-ISO formats (May 2 2026, 2026/05/02)
 *   - ISO without timezone (2026-05-05T12:34:56)
 *   - Timezone offsets (+03:00) — only Z allowed
 *   - Impossible dates (2026-02-31T00:00:00.000Z)
 */
function isValidIso8601UtcTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Strict regex: YYYY-MM-DDTHH:mm:ss with optional .sss, always Z
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (!isoPattern.test(trimmed)) return false;

  // Parse and validate against JS Date
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return false;

  // Verify round-trip: JS Date must produce the same timestamp
  // For inputs without milliseconds, JS toISOString adds .000Z
  const expected = trimmed.includes(".")
    ? trimmed
    : trimmed.replace("Z", ".000Z");

  return parsed.toISOString() === expected;
}
