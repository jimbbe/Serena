import type { PromptId } from "../../domain/prompt-id.ts";
import type { LlmProvider } from "../../application/ports/llm-provider.ts";
import type { ExecutionPolicy } from "../../domain/execution-policy.ts";

export class MockLlmProvider implements LlmProvider {
  private readonly cannedResponses: Map<
    PromptId,
    { content: string; tokensUsed?: number }
  >;

  constructor(
    canned?: Map<PromptId, { content: string; tokensUsed?: number }>
  ) {
    this.cannedResponses = canned ?? new Map();
    // Always seed defaults — explicit canned entries win (primeDefaults skips existing keys)
    this.primeDefaults();
  }

  /**
   * Seeds default canned responses matching current OutputContracts.
   * These are used when no explicit canned response is configured.
   */
  private primeDefaults(): void {
    const defaults: Array<[PromptId, string]> = [
      [
        "serena.mediation.understand_request.v1",
        JSON.stringify({
          isMediationRequest: true,
          recipientHint: "Mari",
          messageDraft: "Llego más tarde.",
          requiresConfirmation: true,
          missingFields: ["confirmation"],
          riskSignal: false,
        }),
      ],
      [
        "serena.mediation.clarify.v1",
        JSON.stringify({
          question: "¿A quién querés que le avise?",
          reason: "Falta el destinatario del mensaje.",
        }),
      ],
      [
        "serena.risk.review.v1",
        JSON.stringify({
          riskLevel: "low",
          riskType: "unknown",
          source: "direct",
          situationSummary: "No se detectan señales claras de riesgo.",
          recommendedAction: "reply",
          requiresEscalation: false,
          missingInformation: [],
        }),
      ],
      [
        "serena.conversation.reply.v1",
        "Entendido. ¿Hay algo más en lo que pueda ayudarte?",
      ],
      [
        "serena.inbound.classify_intent.v1",
        JSON.stringify({
          intent: "conversation",
          confidence: 0.9,
          reason: "Mensaje casual sin señales de mediación ni riesgo.",
        }),
      ],
    ];

    for (const [id, content] of defaults) {
      if (!this.cannedResponses.has(id)) {
        this.cannedResponses.set(id, { content, tokensUsed: 15 });
      }
    }
  }

  async invoke(input: {
    promptId: PromptId;
    promptVersion: number;
    systemPrompt: string;
    userPrompt: string;
    developerPrompt?: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }> {
    const key = input.promptId;

    if (this.cannedResponses.has(key)) {
      const canned = this.cannedResponses.get(key)!;
      return {
        content: canned.content,
        tokensUsed: canned.tokensUsed ?? 10,
        modelUsed: "mock-model-v1",
      };
    }

    // Deterministic fallback using promptId + userPrompt
    const hash = this.simpleHash(input.promptId + "::" + input.userPrompt);
    return {
      content: `Mock response for: ${input.userPrompt} (hash: ${hash})`,
      tokensUsed: 20,
      modelUsed: "mock-model-v1",
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }
}
