import type { GuideUseCaseId } from "./guide-use-case-id.ts";
import type { ExecutionPolicy } from "./execution-policy.ts";
import type { PromptId } from "./prompt-id.ts";

/** Lean contract — contextPolicy lives in PromptDefinition (single source of truth). */
export type UseCaseContract = {
  id: GuideUseCaseId;
  promptId: PromptId;
  executionPolicy: ExecutionPolicy;
};
