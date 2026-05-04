/**
 * Shared channel type used by multiple modules.
 *
 * Moved here from inbound-gate/domain/inbound-message-command.ts to avoid
 * cross-domain dependencies (e.g. conversation-store importing from
 * inbound-gate).  All channel-aware modules import from this single source.
 */

/** All channel sources that can produce an inbound message. */
export type InboundChannel =
  | "whatsapp"
  | "voice"
  | "web_chat"
  | "telegram"
  | "system"
  | "simulation";
