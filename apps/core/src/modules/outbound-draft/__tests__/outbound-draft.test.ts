import assert from "node:assert/strict";
import test from "node:test";

import type { OutboundDraft } from "../domain/outbound-draft.ts";
import { validateOutboundDraft } from "../domain/outbound-draft.ts";

function makeDraft(overrides: Partial<OutboundDraft> = {}): OutboundDraft {
  const now = new Date("2026-05-10T10:00:00.000Z");

  return {
    id: "od_123",
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
    status: "confirmed_pending_delivery",
    source: "mediation_flow",
    sourceFlowConversationId: "conv-1",
    sourceDraftId: "draft-1",
    createdAt: now,
    confirmedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("validateOutboundDraft accepts a valid draft", () => {
  assert.deepEqual(validateOutboundDraft(makeDraft()), []);
});

test("validateOutboundDraft rejects blank messageText", () => {
  assert.deepEqual(validateOutboundDraft(makeDraft({ messageText: "   " })), ["messageText must be non-empty"]);
});

test("validateOutboundDraft rejects blank recipientHint", () => {
  assert.deepEqual(validateOutboundDraft(makeDraft({ recipientHint: "   " })), ["recipientHint must be non-empty"]);
});

test("validateOutboundDraft rejects blank requesterPersonId", () => {
  assert.deepEqual(validateOutboundDraft(makeDraft({ requesterPersonId: "   " })), ["requesterPersonId must be non-empty"]);
});

test("validateOutboundDraft rejects blank conversationId", () => {
  assert.deepEqual(validateOutboundDraft(makeDraft({ conversationId: "   " })), ["conversationId must be non-empty"]);
});

test("validateOutboundDraft trims whitespace before validation", () => {
  const errors = validateOutboundDraft(makeDraft({
    messageText: "   ",
    requesterPersonId: "   ",
    conversationId: "   ",
    recipientHint: "   ",
  }));

  assert.equal(errors.length, 4);
});
