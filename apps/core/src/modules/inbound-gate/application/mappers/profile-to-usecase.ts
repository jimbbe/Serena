/**
 * T20 — Pure mapping from inbound routing profile to AI guide use case.
 *
 * Lives in the APPLICATION layer (not domain) because it translates between
 * two different modules (inbound-gate → ai-guide).  Domain types must not
 * depend on other modules — this mapper is the single orchestration point
 * that knows about both.
 *
 * Single source of truth, pure function, no side effects.
 */

import type { LlmProfileId } from "../../domain/llm-profile.ts";
import type { GuideUseCaseId } from "../../../ai-guide/domain/guide-use-case-id.ts";

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
