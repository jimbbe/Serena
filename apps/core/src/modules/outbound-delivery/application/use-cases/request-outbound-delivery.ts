import type { OutboundDraftStore } from "../../../outbound-draft/port/outbound-draft-store.ts";
import type { OutboundDraft } from "../../../outbound-draft/domain/outbound-draft.ts";
import type { DeliveryPort } from "../../port/delivery-port.ts";
import type { PreparedDeliveryRequest } from "../../domain/prepared-delivery-request.ts";
import type { DeliveryResult } from "../../domain/delivery-result.ts";

const DELIVERABLE_STATUS = "confirmed_pending_delivery" as const;

const NON_DELIVERABLE_STATUSES = [
  "needs_recipient_resolution",
  "needs_recipient_disambiguation",
  "cancelled",
  "delivery_requested",
  "delivered",
  "failed",
] as const;

export type RequestOutboundDeliveryInput = {
  outboundDraftId: string;
  outboundDraftStore: OutboundDraftStore;
  deliveryPort: DeliveryPort;
};

export type RequestOutboundDeliveryOutput = {
  delivery: DeliveryResult;
  outboundDraft: OutboundDraft;
};

export class RequestOutboundDelivery {
  private readonly outboundDraftStore: OutboundDraftStore;
  private readonly deliveryPort: DeliveryPort;

  constructor(input: { outboundDraftStore: OutboundDraftStore; deliveryPort: DeliveryPort }) {
    this.outboundDraftStore = input.outboundDraftStore;
    this.deliveryPort = input.deliveryPort;
  }

  async execute(input: RequestOutboundDeliveryInput): Promise<RequestOutboundDeliveryOutput> {
    const { outboundDraftId, outboundDraftStore, deliveryPort } = input;

    // 1. Find draft
    const draft = await outboundDraftStore.findById(outboundDraftId);
    if (draft === undefined) {
      throw new Error(`Outbound draft not found: ${outboundDraftId}`);
    }

    // 2. Validate status
    if (draft.status !== DELIVERABLE_STATUS) {
      throw new Error(
        `Outbound draft status is "${draft.status}", cannot deliver. Expected "${DELIVERABLE_STATUS}".`,
      );
    }

    // 3. Validate required fields
    const validationError = this.validateDeliveryFields(draft);
    if (validationError !== undefined) {
      throw new Error(validationError);
    }

    // 4. Mark as delivery_requested
    const now = new Date();
    let currentDraft = await outboundDraftStore.markDeliveryRequested(outboundDraftId, now);

    // 5. Build request
    const request: PreparedDeliveryRequest = this.buildRequest(currentDraft, now);

    // 6. Call delivery port
    let deliveryResult: DeliveryResult;
    try {
      deliveryResult = await deliveryPort.sendPreparedMessage(request);
    } catch (err) {
      // 7. Port threw — mark as failed and return
      const message = err instanceof Error ? err.message : String(err);
      currentDraft = await outboundDraftStore.markFailed(outboundDraftId, message, new Date());
      return {
        delivery: { status: "failed", failureReason: message },
        outboundDraft: currentDraft,
      };
    }

    // 8. Update draft based on result
    if (deliveryResult.status === "delivered") {
      currentDraft = await outboundDraftStore.markDelivered(outboundDraftId, new Date());
    } else if (deliveryResult.status === "failed") {
      const reason = deliveryResult.failureReason ?? "delivery_failed";
      currentDraft = await outboundDraftStore.markFailed(outboundDraftId, reason, new Date());
    }
    // "accepted" → stays as delivery_requested (already set)

    return { delivery: deliveryResult, outboundDraft: currentDraft };
  }

  private validateDeliveryFields(draft: OutboundDraft): string | undefined {
    if (draft.recipientChannel === null) {
      return "Cannot deliver: recipientChannel is null";
    }
    if (draft.recipientExternalId === null || draft.recipientExternalId.trim().length === 0) {
      return "Cannot deliver: recipientExternalId is null or empty";
    }
    if (draft.messageText.trim().length === 0) {
      return "Cannot deliver: messageText is empty";
    }
    if (draft.requesterPersonId.trim().length === 0) {
      return "Cannot deliver: requesterPersonId is empty";
    }
    if (draft.tenantId.trim().length === 0) {
      return "Cannot deliver: tenantId is empty";
    }
    if (draft.conversationId.trim().length === 0) {
      return "Cannot deliver: conversationId is empty";
    }
    return undefined;
  }

  private buildRequest(draft: OutboundDraft, now: Date): PreparedDeliveryRequest {
    return {
      outboundDraftId: draft.id,
      tenantId: draft.tenantId,
      conversationId: draft.conversationId,
      requesterPersonId: draft.requesterPersonId,
      recipientPersonId: draft.recipientPersonId,
      recipientDisplayName: draft.recipientDisplayName,
      recipientChannel: draft.recipientChannel,
      recipientExternalId: draft.recipientExternalId,
      messageText: draft.messageText,
      requestedAt: now,
    };
  }
}
