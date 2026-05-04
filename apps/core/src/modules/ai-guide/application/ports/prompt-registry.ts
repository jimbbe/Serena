import type { PromptId } from "../../domain/prompt-id.ts";
import type { PromptDefinition } from "../../domain/prompt-definition.ts";

/** Type alias (following project convention). */
export type PromptRegistry = {
  get(promptId: PromptId): PromptDefinition;
  list(): PromptDefinition[];
};
