/**
 * COPIED from apps/core/src/modules/orchestrator/domain/pipeline-result.ts (T17A frozen contract).
 * Source version: T17B internal hardening complete.
 * DO NOT modify without updating the corresponding source.
 *
 * Orchestrator — Pipeline result contracts (T15).
 *
 * Each variant represents an explicit, testable outcome of the
 * mediation-prudence pipeline.  The orchestrator coordinates every
 * module but never reimplements their rules.
 *
 * Variant catalogue
 * -----------------
 * - discard                → invalid or unauthorised sender/text
 * - conversation_pending   → normal message, no mediation needed
 * - risk_review_required   → urgent/risky content, needs human review
 * - mediation_not_understood → mediation signal detected but request
 *                               could not be parsed
 * - recipient_not_found    → mediation request targets a contact not
 *                               in the directory
 * - mediation_started      → new session created, ready to send
 * - mediation_reply_recorded → reply recorded in existing session,
 *                               ready to forward
 * - ambiguous_active_session → multiple active sessions for the same
 *                               pair — explicit ambiguity, not silently
 *                               resolved
 */

export type PipelineResult =
  | DiscardResult
  | ConversationPendingResult
  | RiskReviewRequiredResult
  | MediationNotUnderstoodResult
  | RecipientNotFoundResult
  | MediationStartedResult
  | MediationReplyRecordedResult
  | AmbiguousActiveSessionResult;

export type DiscardResult = {
  type: "discard";
  reason: string;
};

export type ConversationPendingResult = {
  type: "conversation_pending";
  senderId: string;
};

export type RiskReviewRequiredResult = {
  type: "risk_review_required";
  senderId: string;
  matchedSignals: readonly string[];
};

export type MediationNotUnderstoodResult = {
  type: "mediation_not_understood";
  senderId: string;
};

export type RecipientNotFoundResult = {
  type: "recipient_not_found";
  senderId: string;
  recipientName: string;
};

export type MediationStartedResult = {
  type: "mediation_started";
  sessionId: string;
  requesterId: string;
  requesterDisplayName: string;
  recipientId: string;
  recipientDisplayName: string;
  rewordedText: string;
};

export type MediationReplyRecordedResult = {
  type: "mediation_reply_recorded";
  sessionId: string;
  fromParticipantId: string;
  fromDisplayName: string;
  toParticipantId: string;
  toDisplayName: string;
  rewordedText: string;
};

export type AmbiguousActiveSessionResult = {
  type: "ambiguous_active_session";
  senderId: string;
  activeSessionIds: readonly string[];
};

/**
 * Input to the pipeline.  Matches IncomingWhatsAppMessage minus
 * instanceId (which is WhatsApp-gateway-specific).
 *
 * The orchestrator receives this normalised input; the gateway adapter
 * would map IncomingWhatsAppMessage → PipelineInput before calling
 * the use case.
 */
export type PipelineInput = {
  senderWhatsAppId: string;
  messageText: string;
  receivedAt: string;
};
