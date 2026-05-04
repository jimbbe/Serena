import type { UseCaseContract } from "../../domain/use-case-contract.ts";
import type { GuideResult, GuideResultSuccess, GuideResultFailed } from "../../domain/guide-result.ts";
import type { PromptId } from "../../domain/prompt-id.ts";
import type { LlmProvider } from "../ports/llm-provider.ts";
import type { AiInvocationAudit } from "../ports/ai-invocation-audit.ts";
import type { PromptRegistry } from "../ports/prompt-registry.ts";
import type { ContextBuilder } from "../prompts/context-builder.ts";

type AuditOutcome = {
  auditRecorded: boolean;
  auditId: string | undefined;
};

function makeMetadata(
  model: string,
  attempts: number,
  outcome: AuditOutcome,
  promptId: PromptId,
  promptVersion: number
): GuideResultSuccess["metadata"] | GuideResultFailed["metadata"] {
  const base = {
    provider: "mock" as const,
    model,
    attempts,
    auditRecorded: outcome.auditRecorded,
    promptId,
    promptVersion,
  };
  if (outcome.auditId !== undefined) {
    return { ...base, auditId: outcome.auditId };
  }
  return base;
}

export class ExecutionPipeline {
  private readonly provider: LlmProvider;
  private readonly audit: AiInvocationAudit | undefined;
  private readonly registry: PromptRegistry;
  private readonly contextBuilder: ContextBuilder;

  constructor(deps: {
    provider: LlmProvider;
    audit?: AiInvocationAudit;
    registry: PromptRegistry;
    contextBuilder: ContextBuilder;
  }) {
    this.provider = deps.provider;
    this.audit = deps.audit;
    this.registry = deps.registry;
    this.contextBuilder = deps.contextBuilder;
  }

  async execute(
    contract: UseCaseContract,
    input: Record<string, string>
  ): Promise<GuideResult> {
    // (1) Resolve prompt from registry — catch resolution failures gracefully
    let promptDef;
    try {
      promptDef = this.resolvePrompt(contract);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        status: "failed",
        useCaseId: contract.id,
        error: { message: error.message },
        metadata: {
          provider: "mock",
          model: "mock-model-v1",
          attempts: 0,
          auditRecorded: false,
          promptId: contract.promptId,
          promptVersion: 1,
        },
      };
    }

    // (2) Build user prompt via ContextBuilder + template interpolation
    const userPrompt = this.buildUserPrompt(promptDef, input);

    const startTime = Date.now();

    const maxAttempts = contract.executionPolicy.retryOnFailure
      ? 1 + contract.executionPolicy.maxRetries
      : 1;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const providerResult = await this.provider.invoke({
          promptId: promptDef.id,
          promptVersion: promptDef.version,
          systemPrompt: promptDef.systemPrompt,
          userPrompt,
          ...(promptDef.developerPrompt !== undefined
            ? { developerPrompt: promptDef.developerPrompt }
            : {}),
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
          promptDef.id,
          promptDef.version,
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
            outcome,
            promptDef.id,
            promptDef.version
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
            promptDef.id,
            promptDef.version,
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
            metadata: makeMetadata(
              "mock-model-v1",
              attempt + 1,
              outcome,
              promptDef.id,
              promptDef.version
            ),
          };
        }

        // Provider error — retry if attempts remain
        if (attempt < maxAttempts - 1) {
          if (this.audit) {
            try {
              await this.audit.record(
                {
                  useCaseId: contract.id,
                  promptId: promptDef.id,
                  promptVersion: promptDef.version,
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
          promptDef.id,
          promptDef.version,
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
          metadata: makeMetadata(
            "mock-model-v1",
            maxAttempts,
            outcome,
            promptDef.id,
            promptDef.version
          ),
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
      metadata: makeMetadata(
        "mock-model-v1",
        maxAttempts,
        { auditRecorded: false, auditId: undefined },
        promptDef.id,
        promptDef.version
      ),
    };
  }

  /** Resolves the PromptDefinition, or throws a descriptive error for missing prompts. */
  private resolvePrompt(contract: UseCaseContract) {
    try {
      return this.registry.get(contract.promptId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Prompt resolution failed for contract ${contract.id}: ${msg}`);
    }
  }

  /** Builds the userPrompt via ContextBuilder and template interpolation. */
  private buildUserPrompt(
    promptDef: { inputTemplate?: string; contextPolicy: Parameters<ContextBuilder["build"]>[0] },
    input: Record<string, string>
  ): string {
    // Template interpolation (Phase 1 — replaces old renderTemplate)
    const renderedTemplate =
      promptDef.inputTemplate !== undefined
        ? this.contextBuilder.renderTemplate(promptDef.inputTemplate, input)
        : "";

    // Context assembly from policy (Phase 1: uses only currentMessage from input)
    const contextString = this.contextBuilder.build(promptDef.contextPolicy, {
      currentMessage: (renderedTemplate !== "" ? renderedTemplate : undefined) ?? input["input"] ?? "",
    });

    return contextString;
  }

  private async recordAudit(
    contract: UseCaseContract,
    promptId: PromptId,
    promptVersion: number,
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
          promptId,
          promptVersion,
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
}
