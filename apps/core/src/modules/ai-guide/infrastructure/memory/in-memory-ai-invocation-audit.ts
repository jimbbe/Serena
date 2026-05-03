import type { AiInvocationAudit } from "../../application/ports/ai-invocation-audit.ts";
import type { GuideUseCaseId } from "../../domain/guide-use-case-id.ts";

export type AuditRecord = {
  auditId: string;
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
  private nextId = 1;

  async record(
    input: { useCaseId: GuideUseCaseId; systemPrompt: string; userPrompt: string },
    result: { output: string; tokensUsed?: number; executionTimeMs: number; success: boolean; error?: string }
  ): Promise<{ auditId: string }> {
    const auditId = `audit-${this.nextId++}`;
    this.records.push({
      auditId,
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
    return { auditId };
  }

  /** Test helper — returns all recorded invocations for assertions. */
  getRecords(): readonly AuditRecord[] {
    return this.records;
  }
}
