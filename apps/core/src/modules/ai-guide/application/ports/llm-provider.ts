import type { ExecutionPolicy } from "../../domain/execution-policy.ts";

/** Type alias (not interface — following project DecisionAudit pattern). */
export type LlmProvider = {
  invoke(input: {
    systemPrompt: string;
    userPrompt: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }>;
};
