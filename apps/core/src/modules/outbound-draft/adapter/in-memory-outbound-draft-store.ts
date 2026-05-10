import type { OutboundDraft } from "../domain/outbound-draft.ts";
import type { OutboundDraftStore } from "../port/outbound-draft-store.ts";

export class InMemoryOutboundDraftStore implements OutboundDraftStore {
  private readonly drafts = new Map<string, OutboundDraft>();

  async create(draft: OutboundDraft): Promise<OutboundDraft> {
    this.drafts.set(draft.id, draft);
    return draft;
  }

  async findById(id: string): Promise<OutboundDraft | undefined> {
    return this.drafts.get(id);
  }

  async findByConversationId(conversationId: string): Promise<OutboundDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.conversationId === conversationId);
  }

  async findPendingDelivery(): Promise<OutboundDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.status === "confirmed_pending_delivery");
  }

  async markDeliveryRequested(id: string, at: Date): Promise<OutboundDraft> {
    return this.updateStatus(id, "delivery_requested", at);
  }

  async markDelivered(id: string, at: Date): Promise<OutboundDraft> {
    return this.updateStatus(id, "delivered", at);
  }

  async markFailed(id: string, _reason: string, at: Date): Promise<OutboundDraft> {
    return this.updateStatus(id, "failed", at);
  }

  async cancel(id: string, at: Date): Promise<OutboundDraft> {
    return this.updateStatus(id, "cancelled", at);
  }

  private updateStatus(id: string, status: OutboundDraft["status"], at: Date): OutboundDraft {
    const current = this.drafts.get(id);
    if (current === undefined) {
      throw new Error(`Outbound draft not found: ${id}`);
    }

    const updated: OutboundDraft = {
      ...current,
      status,
      updatedAt: at,
    };

    this.drafts.set(id, updated);
    return updated;
  }
}
