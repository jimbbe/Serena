/**
 * COPIED from apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts (T17A frozen contract).
 * Source version: T17B internal hardening complete.
 * DO NOT modify without updating the corresponding source.
 *
 * T17A — Map PipelineResult to WhatsAppGatewayAction.
 *
 * Pure function — no side effects, no HTTP, no WhatsApp.
 *
 * Translates Serena Core's PipelineResult (orchestrator output) into
 * a WhatsAppGatewayAction that tells the WhatsApp Gateway what to do.
 *
 * The gateway MUST use this function instead of interpreting
 * PipelineResult directly.  All business decisions about which results
 * produce which actions live HERE, in a single place that can be
 * tested and reviewed independently of gateway infrastructure code.
 */

import type { PipelineResult } from "../domain/pipeline-result.ts";
import type { WhatsAppGatewayAction } from "../domain/gateway-action.ts";

export function mapPipelineResultToGatewayAction(
  result: PipelineResult,
): WhatsAppGatewayAction {
  switch (result.type) {
    // -------------------------------------------------------------------
    // discard — invalid or unauthorised sender/text
    // -------------------------------------------------------------------
    case "discard":
      return {
        action: "ignore",
        resultType: "discard",
        reason: result.reason,
      };

    // -------------------------------------------------------------------
    // conversation_pending — normal message, no mediation needed
    // -------------------------------------------------------------------
    case "conversation_pending":
      return {
        action: "no_auto_send",
        resultType: "conversation_pending",
        reason: "No conversational module available",
      };

    // -------------------------------------------------------------------
    // risk_review_required — urgent/risky content, needs human review
    // -------------------------------------------------------------------
    case "risk_review_required":
      return {
        action: "manual_review_required",
        resultType: "risk_review_required",
        reason: "Risk or urgent content requires human review",
        detail: `Matched signals: ${result.matchedSignals.join(", ")}`,
        matchedSignals: result.matchedSignals,
      };

    // -------------------------------------------------------------------
    // mediation_not_understood — mediation signal detected but not parseable
    // -------------------------------------------------------------------
    case "mediation_not_understood":
      return {
        action: "no_auto_send",
        resultType: "mediation_not_understood",
        reason: "Could not parse mediation request",
      };

    // -------------------------------------------------------------------
    // recipient_not_found — recipient not in contact directory
    // -------------------------------------------------------------------
    case "recipient_not_found":
      return {
        action: "no_auto_send",
        resultType: "recipient_not_found",
        reason: `Recipient not in contact directory: ${result.recipientName}`,
      };

    // -------------------------------------------------------------------
    // mediation_started — new session created, draft ready to send
    // -------------------------------------------------------------------
    case "mediation_started":
      return {
        action: "draft_ready",
        resultType: "mediation_started",
        toWhatsAppId: result.recipientId,
        text: result.rewordedText,
        sessionId: result.sessionId,
        fromDisplayName: result.requesterDisplayName,
        toDisplayName: result.recipientDisplayName,
      };

    // -------------------------------------------------------------------
    // mediation_reply_recorded — reply recorded in existing session, draft ready
    // -------------------------------------------------------------------
    case "mediation_reply_recorded":
      return {
        action: "draft_ready",
        resultType: "mediation_reply_recorded",
        toWhatsAppId: result.toParticipantId,
        text: result.rewordedText,
        sessionId: result.sessionId,
        fromDisplayName: result.fromDisplayName,
        toDisplayName: result.toDisplayName,
      };

    // -------------------------------------------------------------------
    // ambiguous_active_session — multiple sessions for same pair
    // -------------------------------------------------------------------
    case "ambiguous_active_session":
      return {
        action: "manual_review_required",
        resultType: "ambiguous_active_session",
        reason: "Multiple active sessions for the same participant pair",
        detail: `Active sessions: ${result.activeSessionIds.join(", ")}`,
        activeSessionIds: result.activeSessionIds,
      };

    // -------------------------------------------------------------------
    // Exhaustive check — should never reach here
    // -------------------------------------------------------------------
    default: {
      const _exhaustive: never = result;
      return {
        action: "error",
        message: `Unknown PipelineResult type: ${(_exhaustive as PipelineResult).type}`,
      };
    }
  }
}
