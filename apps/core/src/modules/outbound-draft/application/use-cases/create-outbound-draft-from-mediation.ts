import { randomUUID } from "node:crypto";

import type { MediationFlowState } from "../../../mediation-flow/domain/mediation-flow-state.ts";
import type { InboundChannel } from "../../../shared/channel.ts";
import type { OutboundDraft, OutboundDraftStatus } from "../../domain/outbound-draft.ts";
import { validateOutboundDraft } from "../../domain/outbound-draft.ts";
import type { OutboundDraftStore } from "../../port/outbound-draft-store.ts";

import type { RecipientResolution } from "../resolve-outbound-recipient.ts";

export type OutboundDraftRequesterIdentity = {
  status: "resolved";
  tenantId: string;
  channel: InboundChannel;
  personId?: string;
};

export type CreateOutboundDraftFromMediationInput = {
  flowState: MediationFlowState;
  identity: OutboundDraftRequesterIdentity;
  recipientResolution: RecipientResolution;
  store: OutboundDraftStore;
};

export class CreateOutboundDraftFromMediation {
  async execute(input: CreateOutboundDraftFromMediationInput): Promise<OutboundDraft> {
    const { flowState, identity, recipientResolution, store } = input;
    const draft = flowState.draft;

    if (draft === null) {
      throw new Error("Cannot create outbound draft without flow draft");
    }

    if (flowState.conversationId.trim().length === 0) {
      throw new Error("Cannot create outbound draft without conversationId");
    }

    if (draft.recipientHint === null || draft.recipientHint.trim().length === 0) {
      throw new Error("Cannot create outbound draft without recipientHint");
    }

    if (draft.messageDraft === null || draft.messageDraft.trim().length === 0) {
      throw new Error("Cannot create outbound draft without messageDraft");
    }

    if (identity.status !== "resolved" || identity.personId === undefined) {
      throw new Error("Cannot create outbound draft without resolved identity");
    }

    const now = new Date();
    const mapped = mapRecipientResolution(recipientResolution);

    const outboundDraft: OutboundDraft = {
      id: `od_${randomUUID()}`,
      tenantId: identity.tenantId,
      conversationId: flowState.conversationId,
      requesterPersonId: identity.personId,
      requesterChannel: identity.channel as InboundChannel,
      recipientHint: draft.recipientHint.trim(),
      recipientPersonId: mapped.recipientPersonId,
      recipientDisplayName: mapped.recipientDisplayName,
      recipientChannel: mapped.recipientChannel,
      recipientExternalId: mapped.recipientExternalId,
      recipientResolution,
      messageText: draft.messageDraft.trim(),
      status: mapped.status,
      source: "mediation_flow",
      sourceFlowConversationId: flowState.conversationId,
      sourceDraftId: draft.id,
      createdAt: now,
      confirmedAt: now,
      updatedAt: now,
    };

    const validationErrors = validateOutboundDraft(outboundDraft);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid outbound draft: ${validationErrors.join(", ")}`);
    }

    return store.create(outboundDraft);
  }
}

function mapRecipientResolution(recipientResolution: RecipientResolution): {
  recipientPersonId: string | null;
  recipientDisplayName: string | null;
  recipientChannel: OutboundDraft["recipientChannel"];
  recipientExternalId: string | null;
  status: OutboundDraftStatus;
} {
  if (recipientResolution.status === "resolved") {
    return {
      recipientPersonId: recipientResolution.personId,
      recipientDisplayName: recipientResolution.displayName,
      recipientChannel: recipientResolution.channel,
      recipientExternalId: recipientResolution.externalId,
      status: "confirmed_pending_delivery",
    };
  }

  if (recipientResolution.status === "ambiguous") {
    return {
      recipientPersonId: null,
      recipientDisplayName: null,
      recipientChannel: null,
      recipientExternalId: null,
      status: "needs_recipient_disambiguation",
    };
  }

  return {
    recipientPersonId: null,
    recipientDisplayName: null,
    recipientChannel: null,
    recipientExternalId: null,
    status: "needs_recipient_resolution",
  };
}
