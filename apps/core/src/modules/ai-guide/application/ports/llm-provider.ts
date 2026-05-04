import type { ExecutionPolicy } from "../../domain/execution-policy.ts";
import type { PromptId } from "../../domain/prompt-id.ts";

/** Type alias (not interface — following project DecisionAudit pattern). */
export type LlmProvider = {
  invoke(input: {
    promptId: PromptId;
    promptVersion: number;
    systemPrompt: string;
    userPrompt: string;
    developerPrompt?: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }>;
};
