import type { InboundChannel } from "../../shared/channel.ts";

/**
 * Request to deliver a prepared outbound message.
 * Built from a confirmed OutboundDraft.
 */
export type PreparedDeliveryRequest = {
  readonly outboundDraftId: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly requesterPersonId: string;
  readonly recipientPersonId: string | null;
  readonly recipientDisplayName: string | null;
  readonly recipientChannel: InboundChannel | null;
  readonly recipientExternalId: string | null;
  readonly messageText: string;
  readonly requestedAt: Date;
};
