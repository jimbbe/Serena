import assert from "node:assert/strict";
import test from "node:test";

import type { OutboundDraft } from "../../outbound-draft/domain/outbound-draft.ts";
import type { OutboundDraftStore } from "../../outbound-draft/port/outbound-draft-store.ts";
import type { DeliveryPort } from "../port/delivery-port.ts";
import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";
import type { DeliveryResult } from "../domain/delivery-result.ts";
import { RequestOutboundDelivery } from "../application/use-cases/request-outbound-delivery.ts";
import { FakeDeliveryPort } from "../adapter/fake-delivery-port.ts";

// --- Test helpers ---

function makeDraft(
  id: string,
  status: OutboundDraft["status"] = "confirmed_pending_delivery",
): OutboundDraft {
  const now = new Date("2026-05-10T10:00:00.000Z");
  return {
    id,
    tenantId: "demo",
    conversationId: "conv-1",
    requesterPersonId: "marta",
    requesterChannel: "whatsapp",
    recipientHint: "Carlos",
    recipientPersonId: "carlos",
    recipientDisplayName: "Carlos",
    recipientChannel: "whatsapp",
    recipientExternalId: "5491111111111",
    recipientResolution: {
      status: "resolved",
      personId: "carlos",
      displayName: "Carlos",
      channel: "whatsapp",
      externalId: "5491111111111",
    },
    messageText: "que llego tarde",
    status,
    source: "mediation_flow",
    sourceFlowConversationId: "conv-1",
    sourceDraftId: `draft-${id}`,
    createdAt: now,
    confirmedAt: now,
    updatedAt: now,
  };
}

function makeInMemoryStore(initialDraft?: OutboundDraft): {
  store: OutboundDraftStore;
  getDraft: () => OutboundDraft | undefined;
} {
  const drafts = new Map<string, OutboundDraft>();
  if (initialDraft) drafts.set(initialDraft.id, initialDraft);

  const store: OutboundDraftStore = {
    async create(draft: OutboundDraft): Promise<OutboundDraft> {
      drafts.set(draft.id, draft);
      return draft;
    },
    async findById(id: string): Promise<OutboundDraft | undefined> {
      return drafts.get(id);
    },
    async findByConversationId(conversationId: string): Promise<OutboundDraft[]> {
      return [...drafts.values()].filter((d) => d.conversationId === conversationId);
    },
    async findPendingDelivery(): Promise<OutboundDraft[]> {
      return [...drafts.values()].filter((d) => d.status === "confirmed_pending_delivery");
    },
    async markDeliveryRequested(id: string, at: Date): Promise<OutboundDraft> {
      return updateStatus(id, "delivery_requested", at);
    },
    async markDelivered(id: string, at: Date): Promise<OutboundDraft> {
      return updateStatus(id, "delivered", at);
    },
    async markFailed(id: string, _reason: string, at: Date): Promise<OutboundDraft> {
      return updateStatus(id, "failed", at);
    },
    async cancel(id: string, at: Date): Promise<OutboundDraft> {
      return updateStatus(id, "cancelled", at);
    },
  };

  function updateStatus(id: string, status: OutboundDraft["status"], at: Date): OutboundDraft {
    const current = drafts.get(id);
    if (current === undefined) throw new Error(`Draft not found: ${id}`);
    const updated: OutboundDraft = { ...current, status, updatedAt: at };
    drafts.set(id, updated);
    return updated;
  }

  return { store, getDraft: () => (initialDraft !== undefined ? drafts.get(initialDraft.id) : undefined) };
}

// --- T1: confirmed_pending_delivery with resolved recipient → delivered ---

test("confirmed draft with resolved recipient calls DeliveryPort and marks delivered", async () => {
  const draft = makeDraft("od-1");
  const { store, getDraft } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  const result = await useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port });

  assert.equal(result.delivery.status, "delivered");
  assert.ok(result.delivery.providerMessageId?.startsWith("fake_msg_"));
  assert.equal(result.outboundDraft.status, "delivered");
  assert.equal(getDraft()?.status, "delivered");
  assert.equal(port.getSentRequests().length, 1);
});

// --- T2: needs_recipient_resolution → does not call port ---

test("draft needs_recipient_resolution does not call DeliveryPort", async () => {
  const draft = makeDraft("od-1", "needs_recipient_resolution");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- T3: needs_recipient_disambiguation → does not call port ---

test("draft needs_recipient_disambiguation does not call DeliveryPort", async () => {
  const draft = makeDraft("od-1", "needs_recipient_disambiguation");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- T4: cancelled → does not call port ---

test("draft cancelled does not call DeliveryPort", async () => {
  const draft = makeDraft("od-1", "cancelled");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- T5: already delivered → does not call port again ---

test("draft already delivered does not call DeliveryPort again", async () => {
  const draft = makeDraft("od-1", "delivered");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- T6: missing recipientExternalId → validation error ---

test("missing recipientExternalId does not call DeliveryPort, returns validation error", async () => {
  const draft = makeDraft("od-1");
  // Override to have null recipientExternalId
  const draftWithoutExternalId: OutboundDraft = { ...draft, recipientExternalId: null };
  const { store } = makeInMemoryStore(draftWithoutExternalId);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /recipientExternalId/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- T7: DeliveryPort returns failed → draft marked failed ---

test("DeliveryPort returns failed marks draft as failed with failureReason", async () => {
  const draft = makeDraft("od-1");
  const { store, getDraft } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort({ mode: "failure", failureReason: "test_failure" });
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  const result = await useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port });

  assert.equal(result.delivery.status, "failed");
  assert.equal(result.delivery.failureReason, "test_failure");
  assert.equal(result.outboundDraft.status, "failed");
  const finalDraft = getDraft();
  assert.ok(finalDraft !== undefined);
  assert.equal(finalDraft.status, "failed");
});

// --- T8: DeliveryPort throws → no crash, draft marked failed ---

test("DeliveryPort throws does not crash, marks draft as failed", async () => {
  const draft = makeDraft("od-1");
  const { store, getDraft } = makeInMemoryStore(draft);

  const throwingPort: DeliveryPort = {
    async sendPreparedMessage(_request: PreparedDeliveryRequest): Promise<DeliveryResult> {
      throw new Error("network crash");
    },
  };

  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: throwingPort });

  // Should NOT throw
  const result = await useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: throwingPort });

  assert.equal(result.delivery.status, "failed");
  assert.ok(result.delivery.failureReason?.includes("network crash"));
  assert.equal(result.outboundDraft.status, "failed");
  assert.equal(getDraft()?.status, "failed");
});

// --- T9: FakeDeliveryPort stores request with correct data ---

test("FakeDeliveryPort stores request with correct messageText and recipientExternalId", async () => {
  const draft = makeDraft("od-1");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port });

  const stored = port.getSentRequests();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.messageText, "que llego tarde");
  assert.equal(stored[0]?.recipientExternalId, "5491111111111");
  assert.equal(stored[0]?.outboundDraftId, "od-1");
});

// --- Additional: draft not found ---

test("draft not found throws controlled error", async () => {
  const { store } = makeInMemoryStore();
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od_nonexistent", outboundDraftStore: store, deliveryPort: port }),
    /not found/i,
  );
});

// --- Additional: delivery_requested status → rejected ---

test("draft delivery_requested does not call DeliveryPort", async () => {
  const draft = makeDraft("od-1", "delivery_requested");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});

// --- Additional: failed status → rejected ---

test("draft failed does not call DeliveryPort", async () => {
  const draft = makeDraft("od-1", "failed");
  const { store } = makeInMemoryStore(draft);
  const port = new FakeDeliveryPort();
  const useCase = new RequestOutboundDelivery({ outboundDraftStore: store, deliveryPort: port });

  await assert.rejects(
    async () => useCase.execute({ outboundDraftId: "od-1", outboundDraftStore: store, deliveryPort: port }),
    /cannot deliver/i,
  );

  assert.equal(port.getSentRequests().length, 0);
});
