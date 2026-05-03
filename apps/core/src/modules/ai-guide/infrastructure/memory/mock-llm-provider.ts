import type { LlmProvider } from "../../application/ports/llm-provider.ts";

export class MockLlmProvider implements LlmProvider {
  private readonly cannedResponses: Map<
    string,
    { content: string; tokensUsed?: number }
  >;

  constructor(
    canned?: Map<string, { content: string; tokensUsed?: number }>
  ) {
    this.cannedResponses = canned ?? new Map();
  }

  async invoke(input: {
    systemPrompt: string;
    userPrompt: string;
    policy: import("../../domain/execution-policy.ts").ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }> {
    const key = input.systemPrompt;

    if (this.cannedResponses.has(key)) {
      const canned = this.cannedResponses.get(key)!;
      return {
        content: canned.content,
        tokensUsed: canned.tokensUsed ?? 10,
        modelUsed: "mock-model-v1",
      };
    }

    // Deterministic response based on combined prompt
    const hash = this.simpleHash(input.systemPrompt + "::" + input.userPrompt);
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
