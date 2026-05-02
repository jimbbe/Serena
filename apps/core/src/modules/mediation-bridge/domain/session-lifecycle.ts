/**
 * Contract for the future `session_closure_review` LLM profile.
 *
 * This profile does NOT close sessions directly.
 * It only recommends what should happen next.
 */
export type SessionClosureRecommendation = {
  recommendation: "close" | "keep_open" | "needs_clarification";
  confidence: "low" | "medium" | "high";
  reason: string;
  pendingQuestionDetected: boolean;
  futurePromiseDetected: boolean;
  ambiguityDetected: boolean;
};