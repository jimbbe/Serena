import type { InboundDecisionReason } from "./inbound-decision.ts";
import type { LlmProfileId } from "./llm-profile.ts";

export type InboundProcessingContext = {
  senderId: string;
  normalizedSenderId: string;
  originalText: string;
  receivedAt: string;
  decisionStatus: "allowed" | "blocked" | "needs_mediation";
  decisionReason: InboundDecisionReason;
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

export type InboundProcessingRoute =
  | { nextStep: "discard"; reason: InboundDecisionReason }
  | {
      nextStep: "llm_profile_required";
      profileId: LlmProfileId;
      reason: InboundDecisionReason;
      context: InboundProcessingContext;
    };
