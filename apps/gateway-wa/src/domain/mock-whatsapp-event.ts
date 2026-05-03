/**
 * T18 — Mock WhatsApp Event.
 *
 * Represents a simulated inbound WhatsApp message from a test user.
 * Used by the dry-run gateway to simulate provider-payload arrival
 * without connecting to real WhatsApp or Evolution API.
 */

export type MockWhatsAppEvent = {
  /** Fixed literal — identifies this as a mock event */
  provider: "mock";

  /** Simulated Evolution API instance name (e.g. "serena-main") */
  instanceId: string;

  /** Stable message identifier for idempotency (non-empty) */
  messageId: string;

  /** Simulated WhatsApp sender ID (e.g. "5491111111111") */
  from: string;

  /** Message text content (non-empty) */
  text: string;

  /** ISO 8601 timestamp of simulated reception */
  timestamp: string;

  /** Optional raw payload for debugging and traceability */
  raw?: Record<string, unknown>;
};
