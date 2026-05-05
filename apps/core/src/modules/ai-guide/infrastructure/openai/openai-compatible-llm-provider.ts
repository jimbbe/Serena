import type { ExecutionPolicy } from "../../domain/execution-policy.ts";
import type { PromptId } from "../../domain/prompt-id.ts";
import type { LlmProvider } from "../../application/ports/llm-provider.ts";

export type OpenAICompatibleLlmProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

/**
 * OpenAI-compatible LLM provider using native fetch (zero npm deps).
 *
 * Communicates with any OpenAI-compatible chat completions API
 * (OpenAI, OpenRouter, Ollama, LiteLLM, etc.) via POST /chat/completions.
 */
export class OpenAICompatibleLlmProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: OpenAICompatibleLlmProviderConfig) {
    // Normalize baseUrl: strip trailing slash (chat/completions appended later)
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async invoke(input: {
    promptId: PromptId;
    promptVersion: number;
    systemPrompt: string;
    userPrompt: string;
    developerPrompt?: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // System prompt (always present)
    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }

    // Developer prompt: for maximum compatibility, use "system" role
    // (OpenAI API supports "developer" role, but not all compatible APIs do)
    if (input.developerPrompt) {
      messages.push({
        role: "system",
        content: `Developer instructions:\n${input.developerPrompt}`,
      });
    }

    // User prompt (always last)
    messages.push({ role: "user", content: input.userPrompt });

    // Build request body with only supported fields from ExecutionPolicy
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    // Map ExecutionPolicy fields that exist on the type
    if (input.policy.maxTokens > 0) {
      body.max_tokens = input.policy.maxTokens;
    }
    if (input.policy.temperature !== undefined) {
      body.temperature = input.policy.temperature;
    }

    const url = `${this.baseUrl}/chat/completions`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // AbortError or timeout — throw clear message
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error(`LLM request timed out after ${this.timeoutMs}ms`);
      }
      // Re-throw network errors (safely — no API key in message)
      const message =
        err instanceof Error ? err.message : String(err);
      throw new Error(
        `LLM provider request failed: ${this.sanitizeMessage(message)}`
      );
    }

    // Handle non-2xx responses
    if (!response.ok) {
      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch {
        bodyText = "[could not read response body]";
      }
      const safeBody = this.sanitizeMessage(bodyText).slice(0, 1000);
      throw new Error(
        `LLM provider request failed with status ${response.status}: ${safeBody}`
      );
    }

    // Parse JSON response
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("LLM response was not valid JSON");
    }

    // Extract content from choices[0].message.content
    if (!data || typeof data !== "object") {
      throw new Error("LLM response did not contain a valid body");
    }

    const obj = data as Record<string, unknown>;

    const choices = obj.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error("LLM response did not contain choices");
    }

    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    if (!firstChoice || typeof firstChoice !== "object") {
      throw new Error("LLM response choice was not a valid object");
    }

    const message = firstChoice.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") {
      throw new Error("LLM response did not contain a message object");
    }

    const content = message.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("LLM response did not contain message content");
    }

    // Extract tokensUsed from usage.total_tokens (optional)
    const usage = obj.usage as Record<string, unknown> | undefined;
    const tokensUsed =
      typeof usage?.total_tokens === "number"
        ? (usage.total_tokens as number)
        : undefined;

    // Extract modelUsed from response.model (fallback to config.model)
    const modelUsed =
      typeof obj.model === "string" && obj.model.length > 0
        ? obj.model
        : this.model;

    const result: { content: string; tokensUsed?: number; modelUsed?: string } = {
      content,
      modelUsed,
    };
    if (typeof tokensUsed === "number") {
      result.tokensUsed = tokensUsed;
    }

    return result;
  }

  /** Replaces API key occurrences in a string with [REDACTED]. */
  private sanitizeMessage(text: string): string {
    // Replace literal API key if it appears (should never happen in practice)
    const key = this.apiKey;
    if (key.length > 0) {
      // Use a global regex that matches the key literally
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(escaped, "g"), "[REDACTED]");
    }
    return text;
  }
}
