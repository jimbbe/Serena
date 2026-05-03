import type { UseCaseContract } from "../../domain/use-case-contract.ts";
import type { GuideResult } from "../../domain/guide-result.ts";
import type { LlmProvider } from "../ports/llm-provider.ts";
import type { AiInvocationAudit } from "../ports/ai-invocation-audit.ts";

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

    // Retry only applies to provider errors (exceptions from invoke()).
    // Empty content is a validation error — it throws immediately without retry.
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
          const emptyError = new Error("Empty result from provider");
          // Record failed audit for empty result
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
                  executionTimeMs: Date.now() - startTime,
                  success: false,
                  error: emptyError.message,
                }
              );
            } catch {
              // Audit failed
            }
          }
          throw emptyError;
        }

        const executionTimeMs = Date.now() - startTime;

        // Record audit (fire-and-forget — don't propagate audit errors)
        let audited = false;
        if (this.audit) {
          try {
            await this.audit.record(
              {
                useCaseId: contract.id,
                systemPrompt: contract.systemPrompt,
                userPrompt,
              },
              {
                output: content,
                executionTimeMs,
                success: true,
                ...(providerResult.tokensUsed !== undefined
                  ? { tokensUsed: providerResult.tokensUsed }
                  : {}),
              }
            );
            audited = true;
          } catch {
            // Audit failed — don't throw, just mark as not audited
          }
        }

        return {
          useCaseId: contract.id,
          output: content,
          metadata: {
            executionTimeMs,
            retryCount: attempt,
            ...(providerResult.tokensUsed !== undefined
              ? { tokensUsed: providerResult.tokensUsed }
              : {}),
            ...(providerResult.modelUsed !== undefined
              ? { modelUsed: providerResult.modelUsed }
              : {}),
          },
          audited,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        // Provider errors → record audit and retry if applicable
        // "Empty result" errors also get here after audit is already recorded above;
        // in that case we don't double-record.
        const isProviderError =
          error.message !== "Empty result from provider";

        if (isProviderError && this.audit) {
          try {
            await this.audit.record(
              {
                useCaseId: contract.id,
                systemPrompt: contract.systemPrompt,
                userPrompt,
              },
              {
                output: "",
                executionTimeMs: Date.now() - startTime,
                success: false,
                error: error.message,
              }
            );
          } catch {
            // Audit failed
          }
        }

        // If this is NOT a provider error (empty result), throw immediately
        if (!isProviderError) {
          throw error;
        }

        // If more retry attempts remain, continue
        if (attempt < maxAttempts - 1) {
          continue;
        }

        // All attempts exhausted — return failed result
        const executionTimeMs = Date.now() - startTime;
        return {
          useCaseId: contract.id,
          output: error.message,
          metadata: {
            executionTimeMs,
            retryCount: maxAttempts - 1,
          },
          audited: false,
        };
      }
    }

    // Unreachable but TypeScript needs it
    const executionTimeMs = Date.now() - startTime;
    return {
      useCaseId: contract.id,
      output: lastError?.message ?? "Unknown error",
      metadata: {
        executionTimeMs,
        retryCount: maxAttempts - 1,
      },
      audited: false,
    };
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
