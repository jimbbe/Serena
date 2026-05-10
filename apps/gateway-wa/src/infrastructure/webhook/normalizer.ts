/**
 * T6 — Webhook normalizer: Evolution payload → NormalizedWhatsAppInboundMessage.
 *
 * Maps Evolution API MESSAGES_UPSERT webhook payloads into the
 * NormalizedWhatsAppInboundMessage format defined in the API contract.
 * Uses extractText from the filter module for text extraction.
 */

import type { EvolutionWebhookPayload } from "../evolution/types.ts";
import type { NormalizedWhatsAppInboundMessage } from "../../domain/normalized-inbound-message.ts";
import { extractText } from "./filter.ts";

/**
 * Normalize an Evolution API webhook payload into a NormalizedWhatsAppInboundMessage.
 *
 * Transformations:
 * - remoteJid: strip @s.whatsapp.net suffix → senderWhatsAppId
 * - key.id → messageId
 * - conversation/extendedTextMessage.text → text (via extractText)
 * - pushName → senderName (optional)
 * - messageTimestamp (unix seconds) → receivedAt (ISO 8601 UTC)
 * - instanceId: from parameter
 * - channel: fixed "whatsapp"
 * - provider: fixed "evolution"
 * - raw: full original payload
 */
export function normalizeEvolutionPayload(
  payload: EvolutionWebhookPayload,
  instanceId: string,
): NormalizedWhatsAppInboundMessage {
  const data = payload.data;

  // Strip WhatsApp suffix from remoteJid
  const rawJid = data.key.remoteJid;
  const senderWhatsAppId = rawJid.includes("@")
    ? rawJid.split("@")[0]!
    : rawJid;

  // Extract text via shared filter function
  const text = extractText(payload) ?? "";

  // Convert unix seconds to ISO 8601 UTC
  const receivedAt = new Date(data.messageTimestamp * 1000).toISOString();

  return {
    provider: "evolution",
    instanceId,
    messageId: data.key.id,
    senderWhatsAppId,
    text,
    receivedAt,
    channel: "whatsapp",
    ...(data.pushName !== undefined ? { senderName: data.pushName } : {}),
    raw: payload as unknown as Record<string, unknown>,
  } as NormalizedWhatsAppInboundMessage;
}
