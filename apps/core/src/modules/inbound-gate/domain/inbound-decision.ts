export type InboundDecisionStatus = "allowed" | "blocked" | "needs_mediation";

export type InboundDecisionReason =
  | "invalid_sender"
  | "invalid_text"
  | "unknown_sender"
  | "known_sender_conversational"
  | "third_party_mediation_request"
  | "urgent_or_risk_content";

export type InboundDecision = {
  status: InboundDecisionStatus;
  reason: InboundDecisionReason;
  metadata: {
    normalizedSenderId: string;
    senderKnown: boolean;
    receivedAt: string;
    audited: boolean;
    policyVersion: string;
    matchedSignals: readonly string[];
    precedence:
      | "invalid_sender"
      | "invalid_text"
      | "unknown_sender"
      | "urgent_or_risk_over_mediation"
      | "mediation_over_conversation"
      | "conversation_default";
  };
};
