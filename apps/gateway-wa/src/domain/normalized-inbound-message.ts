/**
 * COPIED from apps/core/src/modules/whatsapp-gateway/domain/normalized-inbound-message.ts (T17A frozen contract).
 * Source version: T17B internal hardening complete.
 * DO NOT modify without updating the corresponding source.
 *
 * T17A — Normalized WhatsApp Inbound Message.
 *
 * This is the shape a WhatsApp Gateway (separate repo) MUST normalise
 * provider payloads into before calling POST /internal/pipeline/process
 * on Serena Core.
 *
 * It extends IncomingWhatsAppMessage with gateway-level metadata
 * (provider, instanceId, messageId, raw) that Serena Core does NOT
 * receive — the gateway strips them when building PipelineInput.
 */

export type NormalizedWhatsAppInboundMessage = {
  /** Provider identifier: "evolution", "twilio", "meta", etc. */
  provider: string;

  /** Evolution API instance name (e.g. "serena-main") */
  instanceId: string;

  /** Stable message identifier from the provider (e.g. "wamid.xxx").
   *  Used for idempotency — see T17A spec §7. */
  messageId: string;

  /** WhatsApp ID of the sender (e.g. "5492610000000") */
  senderWhatsAppId: string;

  /** Raw text content of the message (unprocessed) */
  text: string;

  /** ISO 8601 timestamp when the message was received by the provider */
  receivedAt: string;

  /** Communication channel — always "whatsapp" for this gateway. */
  channel?: string;

  /** Optional display name of the sender from the provider. */
  senderName?: string;

  /** Raw provider payload for debugging and traceability.
   *  NOT sent to Serena Core. */
  raw: Record<string, unknown>;
};
