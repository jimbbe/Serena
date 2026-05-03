import type { UseCaseContract } from "../../domain/use-case-contract.ts";
import type { GuideResult, GuideResultSuccess, GuideResultFailed } from "../../domain/guide-result.ts";
import type { LlmProvider } from "../ports/llm-provider.ts";
import type { AiInvocationAudit } from "../ports/ai-invocation-audit.ts";

type AuditOutcome = {
  auditRecorded: boolean;
  auditId: string | undefined;
};

function makeMetadata(
  model: string,
  attempts: number,
  outcome: AuditOutcome
): GuideResultSuccess["metadata"] | GuideResultFailed["metadata"] {
  const base = {
    provider: "mock" as const,
    model,
    attempts,
    auditRecorded: outcome.auditRecorded,
  };
  if (outcome.auditId !== undefined) {
    return { ...base, auditId: outcome.auditId };
  }
  return base;
}

export class ExecutionPipeline {
  private readonly provider: LlmProvider;
  private readonly audit: AiInvocationAudit | undefined;

  constructor(deps: { provider: LlmProvider; audit?: AiInvocationAudit }) {
    this.provider = deps.provider;
    this.audit = deps.audit;
  }

  async execute(
    contract: UseCaseContract,
    input: Record<string, string>
  ): Promise<GuideResult> {
    const userPrompt = this.renderTemplate(contract.inputTemplate, input);
    const startTime = Date.now();

    const maxAttempts = contract.executionPolicy.retryOnFailure
      ? 1 + contract.executionPolicy.maxRetries
      : 1;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const providerResult = await this.provider.invoke({
          systemPrompt: contract.systemPrompt,
          userPrompt,
          policy: contract.executionPolicy,
        });

        const content = providerResult.content;

        // Validate result is not empty (validation error — not retried)
        if (!content || content.trim().length === 0) {
          throw new Error("Empty result from provider");
        }

        const executionTimeMs = Date.now() - startTime;
        const outcome = await this.recordAudit(
          contract,
          userPrompt,
          content,
          providerResult.tokensUsed,
          executionTimeMs,
          true
        );

        return {
          status: "success",
          useCaseId: contract.id,
          output: content,
          metadata: makeMetadata(
            providerResult.modelUsed ?? "mock-model-v1",
            attempt + 1,
            outcome
          ),
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        const executionTimeMs = Date.now() - startTime;

        // Empty result is a hard failure — don't retry
        const isHardFailure = error.message === "Empty result from provider";
        if (isHardFailure) {
          const outcome = await this.recordAudit(
            contract,
            userPrompt,
            "",
            0,
            executionTimeMs,
            false,
            error.message
          );

          return {
            status: "failed",
            useCaseId: contract.id,
            error: { message: error.message },
            metadata: makeMetadata("mock-model-v1", attempt + 1, outcome),
          };
        }

        // Provider error — retry if attempts remain
        if (attempt < maxAttempts - 1) {
          // Audit the failure attempt (fire-and-forget is fine here)
          // but we still want it recorded for the next attempt context
          if (this.audit) {
            try {
              await this.audit.record(
                {
                  useCaseId: contract.id,
                  systemPrompt: contract.systemPrompt,
                  userPrompt,
                },
                {
                  output: "",
                  tokensUsed: 0,
                  executionTimeMs,
                  success: false,
                  error: error.message,
                }
              );
            } catch {
              // Audit failure during retry loop — continue anyway
            }
          }
          continue;
        }

        // All attempts exhausted — record final audit
        const outcome = await this.recordAudit(
          contract,
          userPrompt,
          "",
          0,
          executionTimeMs,
          false,
          error.message
        );

        return {
          status: "failed",
          useCaseId: contract.id,
          error: {
            message: error.message,
            ...(error.name !== "Error" ? { code: error.name } : {}),
            cause: error.cause,
          },
          metadata: makeMetadata("mock-model-v1", maxAttempts, outcome),
        };
      }
    }

    // Unreachable — TypeScript safety net
    return {
      status: "failed",
      useCaseId: contract.id,
      error: {
        message: lastError?.message ?? "Unknown error",
      },
      metadata: makeMetadata("mock-model-v1", maxAttempts, {
        auditRecorded: false,
        auditId: undefined,
      }),
    };
  }

  private async recordAudit(
    contract: UseCaseContract,
    userPrompt: string,
    output: string,
    tokensUsed: number | undefined,
    executionTimeMs: number,
    success: boolean,
    errorMessage?: string
  ): Promise<AuditOutcome> {
    if (!this.audit) {
      return { auditRecorded: false, auditId: undefined };
    }

    try {
      const auditResult = await this.audit.record(
        {
          useCaseId: contract.id,
          systemPrompt: contract.systemPrompt,
          userPrompt,
        },
        {
          output,
          executionTimeMs,
          success,
          ...(tokensUsed !== undefined ? { tokensUsed } : {}),
          ...(errorMessage !== undefined ? { error: errorMessage } : {}),
        }
      );
      return {
        auditRecorded: true,
        auditId: auditResult.auditId,
      };
    } catch {
      // Audit failure must not crash the pipeline
      return { auditRecorded: false, auditId: undefined };
    }
  }

  private renderTemplate(
    template: string,
    values: Record<string, string>
  ): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      return values[key] ?? `{${key}}`;
    });
  }
}
