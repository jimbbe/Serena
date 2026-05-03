/**
 * T20 — Pure mapping from inbound routing profile to AI guide use case.
 *
 * Single source of truth for translating inbound-gate routing decisions
 * into ai-guide use case invocations.  Cross-module import is intentional
 * and documented — it is the ONLY place where inbound-gate references
 * ai-guide domain types.
 */

import type { LlmProfileId } from "./llm-profile.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";

const PROFILE_TO_USE_CASE: Record<LlmProfileId, GuideUseCaseId> = {
  conversation: "serena.conversation.reply",
  risk_review: "serena.risk.review",
  mediation_understanding: "serena.mediation.understand_request",
  clarification: "serena.mediation.clarify",
};

/**
 * Maps an inbound-gate {@link LlmProfileId} to the corresponding AI guide
 * {@link GuideUseCaseId}.
 *
 * Pure function — deterministic, no I/O, no side effects.
 */
export function profileToUseCaseId(profileId: LlmProfileId): GuideUseCaseId {
  return PROFILE_TO_USE_CASE[profileId];
}
