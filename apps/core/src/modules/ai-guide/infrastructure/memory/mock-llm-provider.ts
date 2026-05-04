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
