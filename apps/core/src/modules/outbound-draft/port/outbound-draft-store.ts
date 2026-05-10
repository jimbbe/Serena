import type { OutboundDraft } from "../domain/outbound-draft.ts";

export type OutboundDraftStore = {
  create(draft: OutboundDraft): Promise<OutboundDraft>;
  findById(id: string): Promise<OutboundDraft | undefined>;
  findByConversationId(conversationId: string): Promise<OutboundDraft[]>;
  findPendingDelivery(): Promise<OutboundDraft[]>;
  markDeliveryRequested(id: string, at: Date): Promise<OutboundDraft>;
  markDelivered(id: string, at: Date): Promise<OutboundDraft>;
  markFailed(id: string, reason: string, at: Date): Promise<OutboundDraft>;
  cancel(id: string, at: Date): Promise<OutboundDraft>;
};
