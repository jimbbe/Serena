import type { UseCaseContract } from "../../domain/use-case-contract.ts";
import type { GuideResult, GuideResultSuccess, GuideResultFailed } from "../../domain/guide-result.ts";
import type { PromptId } from "../../domain/prompt-id.ts";
import type { LlmProvider } from "../ports/llm-provider.ts";
import type { AiInvocationAudit } from "../ports/ai-invocation-audit.ts";
import type { PromptRegistry } from "../ports/prompt-registry.ts";
import type { ContextBuilder } from "../prompts/context-builder.ts";
import type { AiGuideInput } from "./ai-guide-input.ts";
import { renderOutputContract } from "../prompts/render-output-contract.ts";
import { validateOutputContract } from "../prompts/validate-output-contract.ts";
import { parsePromptVersion } from "../../domain/prompt-version.ts";

type AuditOutcome = {
  auditRecorded: boolean;
  auditId: string | undefined;
};

function makeMetadata(
  providerName: string,
  model: string,
  attempts: number,
  outcome: AuditOutcome,
  promptId: PromptId,
  promptVersion: number
): GuideResultSuccess["metadata"] | GuideResultFailed["metadata"] {
  const base = {
    provider: providerName,
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
  private readonly providerName: string;
  private readonly configuredModel: string;

  constructor(deps: {
    provider: LlmProvider;
    audit?: AiInvocationAudit;
    registry: PromptRegistry;
    contextBuilder: ContextBuilder;
    providerName: string;
    configuredModel: string;
  }) {
    this.provider = deps.provider;
    this.audit = deps.audit;
    this.registry = deps.registry;
    this.contextBuilder = deps.contextBuilder;
    this.providerName = deps.providerName;
    this.configuredModel = deps.configuredModel;
  }

  async execute(
    contract: UseCaseContract,
    input: AiGuideInput
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
          provider: this.providerName,
          model: this.configuredModel,
          attempts: 0,
          auditRecorded: false,
          promptId: contract.promptId,
          // Extract version from promptId suffix; fallback to 0 on invalid format
          // (0 is deliberately not a valid version — easier to spot in audits than 1)
          promptVersion: (() => {
            try {
              return parsePromptVersion(contract.promptId);
            } catch {
              return 0;
            }
          })(),
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
      let lastContent = "";
      let lastTokensUsed: number | undefined;
      try {
        const outputContractInstructions = renderOutputContract(promptDef.outputContract);
        const developerPrompt = [
          promptDef.developerPrompt,
          outputContractInstructions,
        ]
          .filter(Boolean)
          .join("\n\n");

        const providerResult = await this.provider.invoke({
          promptId: promptDef.id,
          promptVersion: promptDef.version,
          systemPrompt: promptDef.systemPrompt,
          userPrompt,
          ...(developerPrompt !== "" ? { developerPrompt } : {}),
          policy: contract.executionPolicy,
        });

        const content = providerResult.content;
        lastContent = content;
        lastTokensUsed = providerResult.tokensUsed;

        // Validate result is not empty (validation error — not retried)
        if (!content || content.trim().length === 0) {
          throw new Error("Empty result from provider");
        }

        // Validate output against declared OutputContract (hard failure — not retried)
        const validation = validateOutputContract(promptDef.outputContract, content);
        if (!validation.ok) {
          throw new Error(`Output contract validation failed: ${validation.message}`);
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
            this.providerName,
            providerResult.modelUsed ?? this.configuredModel,
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

        // Empty result or output contract validation are hard failures — don't retry
        const isHardFailure =
          error.message === "Empty result from provider" ||
          error.message.startsWith("Output contract validation failed:");
        if (isHardFailure) {
          const isValidationFailure = error.message.startsWith("Output contract validation failed:");
          const outcome = await this.recordAudit(
            contract,
            promptDef.id,
            promptDef.version,
            userPrompt,
            isValidationFailure ? lastContent : "",  // preserve invalid output for debuggability
            isValidationFailure ? lastTokensUsed : 0,
            executionTimeMs,
            false,
            error.message
          );

          return {
            status: "failed",
            useCaseId: contract.id,
            error: { message: error.message },
            metadata: makeMetadata(
              this.providerName,
              this.configuredModel,
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
            this.providerName,
            this.configuredModel,
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
        this.providerName,
        this.configuredModel,
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
    input: AiGuideInput
  ): string {
    // Extract string-only values for safe template interpolation
    const templateValues: Record<string, string> = {};
    for (const key of ["input", "actorRole", "channel", "resolvedIdentity"] as const) {
      const val = input[key];
      if (typeof val === "string") {
        templateValues[key] = val;
      }
    }

    // Template interpolation (Phase 1 — replaces old renderTemplate)
    const renderedTemplate =
      promptDef.inputTemplate !== undefined
        ? this.contextBuilder.renderTemplate(promptDef.inputTemplate, templateValues)
        : "";

    const currentMessage =
      (renderedTemplate !== "" ? renderedTemplate : undefined) ?? input["input"] ?? "";

    // Assemble actor context from known input fields (channel lives in channelMetadata only)
    const actorRole = input["actorRole"];
    const actorParts: string[] = [];
    if (actorRole) actorParts.push(`rol: ${actorRole}`);
    const actorContext = actorParts.length > 0 ? actorParts.join(", ") : undefined;

    // Build context string from policy flags
    const contextString = this.contextBuilder.build(promptDef.contextPolicy, {
      currentMessage,
      resolvedIdentity: input["resolvedIdentity"],
      actorContext,
      channelMetadata: input["channel"],
      recentMessages: input.recentMessages,
      knownContacts: input.knownContacts,
      safetyMemory: input.safetyMemory,
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
