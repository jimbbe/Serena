/**
 * T17A — Tests for mapPipelineResultToGatewayAction.
 *
 * Covers every PipelineResult variant → GatewayAction mapping.
 * Pure function — no mocks, no infrastructure.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapPipelineResultToGatewayAction } from "../application/map-pipeline-result-to-gateway-action.ts";
import type { PipelineResult } from "../../orchestrator/domain/pipeline-result.ts";

// ---------------------------------------------------------------------------
// Fixtures — valid PipelineResult instances for each variant
// ---------------------------------------------------------------------------

const discard: PipelineResult = {
  type: "discard",
  reason: "unknown_sender",
};

const conversationPending: PipelineResult = {
  type: "conversation_pending",
  senderId: "5491111111111",
};

const riskReviewRequired: PipelineResult = {
  type: "risk_review_required",
  senderId: "5491111111111",
  matchedSignals: ["urgent_keyword", "risk_keyword"],
};

const mediationNotUnderstood: PipelineResult = {
  type: "mediation_not_understood",
  senderId: "5491111111111",
};

const recipientNotFound: PipelineResult = {
  type: "recipient_not_found",
  senderId: "5491111111111",
  recipientName: "Carlos",
};

const mediationStarted: PipelineResult = {
  type: "mediation_started",
  sessionId: "sess-001",
  requesterId: "5491111111111",
  requesterDisplayName: "María",
  recipientId: "5492222222222",
  recipientDisplayName: "Carlos",
  rewordedText: "Hola Carlos, soy Serena. María me pidió decirte que llega 15 minutos tarde.",
};

const mediationReplyRecorded: PipelineResult = {
  type: "mediation_reply_recorded",
  sessionId: "sess-001",
  fromParticipantId: "5492222222222",
  fromDisplayName: "Carlos",
  toParticipantId: "5491111111111",
  toDisplayName: "María",
  rewordedText: "Carlos dice: dale, no hay problema.",
};

const ambiguousActiveSession: PipelineResult = {
  type: "ambiguous_active_session",
  senderId: "5491111111111",
  activeSessionIds: ["sess-001", "sess-002"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mapPipelineResultToGatewayAction", () => {
  // ---- discard ----
  it("discard → ignore", () => {
    const action = mapPipelineResultToGatewayAction(discard);
    assert.equal(action.action, "ignore");
    assert.equal((action as { resultType: string }).resultType, "discard");
    assert.equal((action as { reason: string }).reason, "unknown_sender");
  });

  // ---- conversation_pending ----
  it("conversation_pending → no_auto_send", () => {
    const action = mapPipelineResultToGatewayAction(conversationPending);
    assert.equal(action.action, "no_auto_send");
    assert.equal((action as { resultType: string }).resultType, "conversation_pending");
    assert.ok((action as { reason: string }).reason.includes("conversational"));
  });

  // ---- risk_review_required ----
  it("risk_review_required → manual_review_required", () => {
    const action = mapPipelineResultToGatewayAction(riskReviewRequired);
    assert.equal(action.action, "manual_review_required");
    assert.equal((action as { resultType: string }).resultType, "risk_review_required");

    const manual = action as { matchedSignals: readonly string[] };
    assert.ok(manual.matchedSignals.includes("urgent_keyword"));
    assert.ok(manual.matchedSignals.includes("risk_keyword"));
  });

  it("risk_review_required includes matchedSignals in detail", () => {
    const action = mapPipelineResultToGatewayAction(riskReviewRequired);
    assert.ok((action as { detail: string }).detail.includes("urgent_keyword"));
  });

  // ---- mediation_not_understood ----
  it("mediation_not_understood → no_auto_send", () => {
    const action = mapPipelineResultToGatewayAction(mediationNotUnderstood);
    assert.equal(action.action, "no_auto_send");
    assert.equal((action as { resultType: string }).resultType, "mediation_not_understood");
    assert.ok((action as { reason: string }).reason.includes("parse"));
  });

  // ---- recipient_not_found ----
  it("recipient_not_found → no_auto_send with recipient name in reason", () => {
    const action = mapPipelineResultToGatewayAction(recipientNotFound);
    assert.equal(action.action, "no_auto_send");
    assert.equal((action as { resultType: string }).resultType, "recipient_not_found");
    assert.ok((action as { reason: string }).reason.includes("Carlos"));
  });

  // ---- mediation_started ----
  it("mediation_started → draft_ready with correct fields", () => {
    const action = mapPipelineResultToGatewayAction(mediationStarted);
    assert.equal(action.action, "draft_ready");
    assert.equal((action as { resultType: string }).resultType, "mediation_started");
    assert.equal((action as { toWhatsAppId: string }).toWhatsAppId, "5492222222222");
    assert.equal((action as { sessionId: string }).sessionId, "sess-001");
    assert.equal((action as { fromDisplayName: string }).fromDisplayName, "María");
    assert.equal((action as { toDisplayName: string }).toDisplayName, "Carlos");
    assert.ok((action as { text: string }).text.includes("llega 15 minutos tarde"));
  });

  // ---- mediation_reply_recorded ----
  it("mediation_reply_recorded → draft_ready with correct fields", () => {
    const action = mapPipelineResultToGatewayAction(mediationReplyRecorded);
    assert.equal(action.action, "draft_ready");
    assert.equal((action as { resultType: string }).resultType, "mediation_reply_recorded");
    assert.equal((action as { toWhatsAppId: string }).toWhatsAppId, "5491111111111");
    assert.equal((action as { sessionId: string }).sessionId, "sess-001");
    assert.equal((action as { fromDisplayName: string }).fromDisplayName, "Carlos");
    assert.equal((action as { toDisplayName: string }).toDisplayName, "María");
    assert.ok((action as { text: string }).text.includes("dale, no hay problema"));
  });

  // ---- ambiguous_active_session ----
  it("ambiguous_active_session → manual_review_required with session IDs", () => {
    const action = mapPipelineResultToGatewayAction(ambiguousActiveSession);
    assert.equal(action.action, "manual_review_required");
    assert.equal((action as { resultType: string }).resultType, "ambiguous_active_session");

    const manual = action as { activeSessionIds: readonly string[] };
    assert.ok(manual.activeSessionIds.includes("sess-001"));
    assert.ok(manual.activeSessionIds.includes("sess-002"));
  });

  it("ambiguous_active_session includes session IDs in detail", () => {
    const action = mapPipelineResultToGatewayAction(ambiguousActiveSession);
    assert.ok((action as { detail: string }).detail.includes("sess-001"));
    assert.ok((action as { detail: string }).detail.includes("sess-002"));
  });

  // ---- discard with different reasons ----
  it("discard preserves the exact reason from PipelineResult", () => {
    const discardWithReason: PipelineResult = {
      type: "discard",
      reason: "empty_text_field",
    };
    const action = mapPipelineResultToGatewayAction(discardWithReason);
    assert.equal((action as { reason: string }).reason, "empty_text_field");
  });

  // ---- mediation_started with long text ----
  it("draft_ready preserves full rewordedText even when very long", () => {
    const longText = "Hola Carlos, soy Serena. " + "X".repeat(500) + " — María.";
    const started: PipelineResult = {
      type: "mediation_started",
      sessionId: "sess-long",
      requesterId: "5491111111111",
      requesterDisplayName: "María",
      recipientId: "5492222222222",
      recipientDisplayName: "Carlos",
      rewordedText: longText,
    };
    const action = mapPipelineResultToGatewayAction(started);
    assert.equal((action as { text: string }).text, longText);
  });

  // ---- mediation_reply_recorded with zero-length text ----
  it("draft_ready handles empty rewordedText without error", () => {
    const reply: PipelineResult = {
      type: "mediation_reply_recorded",
      sessionId: "sess-empty",
      fromParticipantId: "5492222222222",
      fromDisplayName: "Carlos",
      toParticipantId: "5491111111111",
      toDisplayName: "María",
      rewordedText: "",
    };
    const action = mapPipelineResultToGatewayAction(reply);
    assert.equal(action.action, "draft_ready");
    assert.equal((action as { text: string }).text, "");
  });

  // ---- risk_review_required with empty signals ----
  it("risk_review_required handles empty matchedSignals gracefully", () => {
    const risk: PipelineResult = {
      type: "risk_review_required",
      senderId: "5491111111111",
      matchedSignals: [],
    };
    const action = mapPipelineResultToGatewayAction(risk);
    assert.equal(action.action, "manual_review_required");
    const manual = action as { detail: string };
    assert.ok(manual.detail.includes("Matched signals:"));
  });

  // ---- ambiguous_active_session with single session ----
  it("ambiguous_active_session handles single active session", () => {
    const single: PipelineResult = {
      type: "ambiguous_active_session",
      senderId: "5491111111111",
      activeSessionIds: ["sess-single"],
    };
    const action = mapPipelineResultToGatewayAction(single);
    assert.equal(action.action, "manual_review_required");
    const manual = action as { activeSessionIds: readonly string[] };
    assert.equal(manual.activeSessionIds.length, 1);
    assert.equal(manual.activeSessionIds[0], "sess-single");
  });
});
