import assert from "node:assert/strict";
import test from "node:test";

import type { OutboundDraft } from "../domain/outbound-draft.ts";
import { InMemoryOutboundDraftStore } from "../adapter/in-memory-outbound-draft-store.ts";

function makeDraft(id: string, status: OutboundDraft["status"] = "confirmed_pending_delivery", conversationId = "conv-1"): OutboundDraft {
  const now = new Date("2026-05-10T10:00:00.000Z");

  return {
    id,
    tenantId: "demo",
    conversationId,
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
    sourceFlowConversationId: conversationId,
    sourceDraftId: `draft-${id}`,
    createdAt: now,
    confirmedAt: now,
    updatedAt: now,
  };
}

test("create + findById round trip", async () => {
  const store = new InMemoryOutboundDraftStore();
  const draft = makeDraft("od-1");

  await store.create(draft);

  assert.deepEqual(await store.findById("od-1"), draft);
});

test("findByConversationId returns only matching drafts", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1", "confirmed_pending_delivery", "conv-1"));
  await store.create(makeDraft("od-2", "confirmed_pending_delivery", "conv-2"));

  const drafts = await store.findByConversationId("conv-1");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.id, "od-1");
});

test("findPendingDelivery returns only confirmed_pending_delivery drafts", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1", "confirmed_pending_delivery"));
  await store.create(makeDraft("od-2", "delivered"));
  await store.create(makeDraft("od-3", "cancelled"));

  const drafts = await store.findPendingDelivery();
  assert.deepEqual(drafts.map((draft) => draft.id), ["od-1"]);
});

test("markDeliveryRequested transitions and updates timestamp", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1"));
  const at = new Date("2026-05-10T11:00:00.000Z");

  const updated = await store.markDeliveryRequested("od-1", at);
  assert.equal(updated.status, "delivery_requested");
  assert.equal(updated.updatedAt.toISOString(), at.toISOString());
});

test("markDelivered transitions and updates timestamp", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1"));
  const at = new Date("2026-05-10T11:00:00.000Z");

  const updated = await store.markDelivered("od-1", at);
  assert.equal(updated.status, "delivered");
  assert.equal(updated.updatedAt.toISOString(), at.toISOString());
});

test("markFailed transitions and updates timestamp", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1"));
  const at = new Date("2026-05-10T11:00:00.000Z");

  const updated = await store.markFailed("od-1", "boom", at);
  assert.equal(updated.status, "failed");
  assert.equal(updated.updatedAt.toISOString(), at.toISOString());
});

test("cancel transitions and updates timestamp", async () => {
  const store = new InMemoryOutboundDraftStore();
  await store.create(makeDraft("od-1"));
  const at = new Date("2026-05-10T11:00:00.000Z");

  const updated = await store.cancel("od-1", at);
  assert.equal(updated.status, "cancelled");
  assert.equal(updated.updatedAt.toISOString(), at.toISOString());
});
