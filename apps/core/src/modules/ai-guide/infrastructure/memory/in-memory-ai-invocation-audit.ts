import type { AiInvocationAudit } from "../../application/ports/ai-invocation-audit.ts";
import type { GuideUseCaseId } from "../../domain/guide-use-case-id.ts";

export type AuditRecord = {
  useCaseId: GuideUseCaseId;
  systemPrompt: string;
  userPrompt: string;
  output: string;
  tokensUsed?: number;
  executionTimeMs: number;
  success: boolean;
  error?: string;
};

export class InMemoryAiInvocationAudit implements AiInvocationAudit {
  private readonly records: AuditRecord[] = [];

  async record(
    input: { useCaseId: GuideUseCaseId; systemPrompt: string; userPrompt: string },
    result: { output: string; tokensUsed?: number; executionTimeMs: number; success: boolean; error?: string }
  ): Promise<void> {
    this.records.push({
      useCaseId: input.useCaseId,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      output: result.output,
      executionTimeMs: result.executionTimeMs,
      success: result.success,
      ...(result.tokensUsed !== undefined
        ? { tokensUsed: result.tokensUsed }
        : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
    });
  }

  /** Test helper — returns all recorded invocations for assertions. */
  getRecords(): readonly AuditRecord[] {
    return this.records;
  }
}
