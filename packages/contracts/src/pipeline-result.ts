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

export type PipelineInput = {
  senderWhatsAppId: string;
  messageText: string;
  receivedAt: string;
};
