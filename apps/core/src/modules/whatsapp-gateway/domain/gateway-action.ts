/**
 * T17A — WhatsApp Gateway Action.
 *
 * Discriminated union that tells the WhatsApp Gateway (separate repo)
 * what to do after receiving a PipelineResult from Serena Core.
 *
 * The gateway MUST NOT interpret PipelineResult directly.
 * It MUST use mapPipelineResultToGatewayAction() to get one of these
 * actions and then execute the corresponding behaviour.
 */

export type WhatsAppGatewayAction =
  | IgnoreAction
  | NoAutoSendAction
  | DraftReadyAction
  | ManualReviewRequiredAction
  | ErrorAction;

/** Discard the message silently — nothing to do. */
export type IgnoreAction = {
  action: "ignore";
  /** Original PipelineResult type for traceability */
  resultType: string;
  /** Human-readable reason */
  reason: string;
};

/** Do NOT send automatically. In the future this may trigger a
 *  notification to the operator or an automated clarification request. */
export type NoAutoSendAction = {
  action: "no_auto_send";
  /** Original PipelineResult type for traceability */
  resultType: string;
  /** Human-readable reason */
  reason: string;
};

/** A rewording draft is ready. The gateway has all the fields needed
 *  to send a WhatsApp message via Evolution API.
 *
 *  IMPORTANT: in the current phase (T16/T17A) the gateway MUST NOT
 *  actually send.  The action is informational only.  Actual sending
 *  will be enabled in T18. */
export type DraftReadyAction = {
  action: "draft_ready";
  /** Original PipelineResult type: "mediation_started" or "mediation_reply_recorded" */
  resultType: string;
  /** WhatsApp ID to send the message to */
  toWhatsAppId: string;
  /** Reworded text (output of prudent-rewording) ready to send */
  text: string;
  /** Mediation session ID for traceability */
  sessionId: string;
  /** Display name of the message author */
  fromDisplayName: string;
  /** Display name of the message recipient */
  toDisplayName: string;
};

/** The pipeline produced an outcome that requires human intervention
 *  before any message can be sent. */
export type ManualReviewRequiredAction = {
  action: "manual_review_required";
  /** Original PipelineResult type for traceability */
  resultType: string;
  /** Human-readable reason */
  reason: string;
  /** Additional detail if available */
  detail?: string;
  /** Risk signals that triggered the review (only for risk_review_required) */
  matchedSignals?: readonly string[];
  /** Active session IDs causing ambiguity (only for ambiguous_active_session) */
  activeSessionIds?: readonly string[];
};

/** An unexpected error occurred during pipeline execution.
 *  The gateway should log, alert, and optionally retry with backoff. */
export type ErrorAction = {
  action: "error";
  /** Error message */
  message: string;
};
