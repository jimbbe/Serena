import assert from "node:assert/strict";
import test from "node:test";

import type { MediationFlowState } from "../../mediation-flow/domain/mediation-flow-state.ts";
import { InMemoryOutboundDraftStore } from "../adapter/in-memory-outbound-draft-store.ts";
import type { OutboundDraftRequesterIdentity } from "../application/use-cases/create-outbound-draft-from-mediation.ts";
import { CreateOutboundDraftFromMediation } from "../application/use-cases/create-outbound-draft-from-mediation.ts";

function makeIdentity(): OutboundDraftRequesterIdentity {
  return {
    status: "resolved",
    tenantId: "demo",
    channel: "whatsapp",
    personId: "marta",
  };
}

function makeFlowState(overrides: Partial<MediationFlowState> = {}): MediationFlowState {
  const now = new Date("2026-05-10T10:00:00.000Z");

  return {
    conversationId: "conv-1",
    personId: "marta",
    status: "resolved",
    draft: {
      id: "draft-1",
      conversationId: "conv-1",
      requesterPersonId: "marta",
      recipientHint: "Carlos",
      messageDraft: "que llego tarde",
      sourceMessageId: "msg-1",
      sourceText: "avisale a Carlos que llego tarde",
      version: 1,
      status: "confirmed",
    },
    pendingAction: null,
    missingFields: [],
    lastQuestion: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("CreateOutboundDraftFromMediation creates draft with resolved recipient", async () => {
  const store = new InMemoryOutboundDraftStore();
  const useCase = new CreateOutboundDraftFromMediation();

  const draft = await useCase.execute({
    flowState: makeFlowState(),
    identity: makeIdentity(),
    recipientResolution: {
      status: "resolved",
      personId: "carlos",
      displayName: "Carlos",
      channel: "whatsapp",
      externalId: "5491111111111",
    },
    store,
  });

  assert.ok(draft.id.startsWith("od_"));
  assert.equal(draft.status, "confirmed_pending_delivery");
  assert.equal(draft.recipientPersonId, "carlos");
  assert.equal(draft.recipientExternalId, "5491111111111");
  assert.equal((await store.findById(draft.id))?.id, draft.id);
});

test("CreateOutboundDraftFromMediation creates unresolved draft when recipient is unknown", async () => {
  const store = new InMemoryOutboundDraftStore();
  const useCase = new CreateOutboundDraftFromMediation();

  const draft = await useCase.execute({
    flowState: makeFlowState(),
    identity: makeIdentity(),
    recipientResolution: { status: "not_found" },
    store,
  });

  assert.equal(draft.status, "needs_recipient_resolution");
  assert.equal(draft.recipientPersonId, null);
});

test("CreateOutboundDraftFromMediation creates disambiguation draft when recipient is ambiguous", async () => {
  const store = new InMemoryOutboundDraftStore();
  const useCase = new CreateOutboundDraftFromMediation();

  const draft = await useCase.execute({
    flowState: makeFlowState(),
    identity: makeIdentity(),
    recipientResolution: {
      status: "ambiguous",
      candidates: [{ personId: "c1", displayName: "Carlos" }],
    },
    store,
  });

  assert.equal(draft.status, "needs_recipient_disambiguation");
  assert.equal(draft.recipientPersonId, null);
});

test("CreateOutboundDraftFromMediation throws on null draft", async () => {
  const useCase = new CreateOutboundDraftFromMediation();

  await assert.rejects(() => useCase.execute({
    flowState: makeFlowState({ draft: null }),
    identity: makeIdentity(),
    recipientResolution: { status: "not_found" },
    store: new InMemoryOutboundDraftStore(),
  }));
});

test("CreateOutboundDraftFromMediation throws on empty recipientHint", async () => {
  const useCase = new CreateOutboundDraftFromMediation();

  await assert.rejects(() => useCase.execute({
    flowState: makeFlowState({
      draft: { ...makeFlowState().draft!, recipientHint: "   " },
    }),
    identity: makeIdentity(),
    recipientResolution: { status: "not_found" },
    store: new InMemoryOutboundDraftStore(),
  }));
});

test("CreateOutboundDraftFromMediation throws on empty messageDraft", async () => {
  const useCase = new CreateOutboundDraftFromMediation();

  await assert.rejects(() => useCase.execute({
    flowState: makeFlowState({
      draft: { ...makeFlowState().draft!, messageDraft: "   " },
    }),
    identity: makeIdentity(),
    recipientResolution: { status: "not_found" },
    store: new InMemoryOutboundDraftStore(),
  }));
});

test("CreateOutboundDraftFromMediation throws on missing conversationId", async () => {
  const useCase = new CreateOutboundDraftFromMediation();

  await assert.rejects(() => useCase.execute({
    flowState: makeFlowState({ conversationId: "   " }),
    identity: makeIdentity(),
    recipientResolution: { status: "not_found" },
    store: new InMemoryOutboundDraftStore(),
  }));
});
