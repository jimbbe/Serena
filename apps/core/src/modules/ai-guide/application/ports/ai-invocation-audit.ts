import type { GuideUseCaseId } from "../../domain/guide-use-case-id.ts";
import type { PromptId } from "../../domain/prompt-id.ts";

/** Type alias (not interface — following project DecisionAudit pattern). */
export type AiInvocationAudit = {
  record(
    input: {
      useCaseId: GuideUseCaseId;
      promptId: PromptId;
      promptVersion: number;
      systemPrompt?: string;
      developerPrompt?: string;
      userPrompt: string;
    },
    result: { output: string; tokensUsed?: number; executionTimeMs: number; success: boolean; error?: string }
  ): Promise<{ auditId?: string }>;
};
