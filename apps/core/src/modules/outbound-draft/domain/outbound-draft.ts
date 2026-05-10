import type { InboundChannel } from "../../shared/channel.ts";

import type { RecipientResolution } from "../application/resolve-outbound-recipient.ts";

export type OutboundDraftStatus =
  | "confirmed_pending_delivery"
  | "needs_recipient_resolution"
  | "needs_recipient_disambiguation"
  | "cancelled"
  | "delivery_requested"
  | "delivered"
  | "failed";

export type OutboundDraft = {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly requesterPersonId: string;
  readonly requesterChannel: InboundChannel;
  readonly recipientHint: string;
  readonly recipientPersonId: string | null;
  readonly recipientDisplayName: string | null;
  readonly recipientChannel: InboundChannel | null;
  readonly recipientExternalId: string | null;
  readonly recipientResolution: RecipientResolution;
  readonly messageText: string;
  readonly status: OutboundDraftStatus;
  readonly source: "mediation_flow";
  readonly sourceFlowConversationId: string;
  readonly sourceDraftId: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly updatedAt: Date;
};

export function validateOutboundDraft(draft: OutboundDraft): string[] {
  const errors: string[] = [];

  if (draft.messageText.trim().length === 0) {
    errors.push("messageText must be non-empty");
  }

  if (draft.requesterPersonId.trim().length === 0) {
    errors.push("requesterPersonId must be non-empty");
  }

  if (draft.conversationId.trim().length === 0) {
    errors.push("conversationId must be non-empty");
  }

  if (draft.recipientHint.trim().length === 0) {
    errors.push("recipientHint must be non-empty");
  }

  return errors;
}
