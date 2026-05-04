import type { PromptId } from "./prompt-id.ts";
import type { GuideUseCaseId } from "./guide-use-case-id.ts";
import type { ContextPolicy } from "./context-policy.ts";
import type { OutputContract } from "./output-contract.ts";

/**
 * Full definition of a versioned prompt.
 *
 * Design shape (merged with spec fields):
 * - `id` is a versioned PromptId (e.g. "serena.conversation.reply.v1")
 * - `version` is a positive integer extracted from the PromptId suffix
 * - `systemPrompt` maps to spec's `system` (R1.5)
 * - `developerPrompt` maps to spec's `developer` (R1.6)
 * - `outputContract.format` maps to spec's `outputMode` (R1.7)
 * - `safetyNotes` per R1.8
 */
export type PromptDefinition = {
  id: PromptId;
  version: number;
  useCaseId: GuideUseCaseId;
  description: string;
  systemPrompt: string;
  inputTemplate?: string;
  developerPrompt?: string;
  contextPolicy: ContextPolicy;
  outputContract: OutputContract;
  safetyNotes?: string[];
};
