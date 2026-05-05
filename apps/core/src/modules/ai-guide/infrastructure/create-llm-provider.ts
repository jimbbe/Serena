import type { AppEnv } from "../../../config/env.ts";
import type { LlmProvider } from "../application/ports/llm-provider.ts";
import { MockLlmProvider } from "./memory/mock-llm-provider.ts";
import { OpenAICompatibleLlmProvider } from "./openai/openai-compatible-llm-provider.ts";

/**
 * Creates the configured LlmProvider based on environment variables.
 *
 * - `AI_PROVIDER=mock` (default) → MockLlmProvider
 * - `AI_PROVIDER=openai-compatible` → OpenAICompatibleLlmProvider
 *
 * Validation of required env vars for openai-compatible is handled
 * by loadAppEnv() — this factory trusts the AppEnv it receives.
 */
export function createLlmProvider(env: AppEnv): LlmProvider {
  if (env.aiProvider === "mock") {
    return new MockLlmProvider();
  }

  if (env.aiProvider === "openai-compatible") {
    // These are guaranteed non-empty by loadAppEnv() validation
    return new OpenAICompatibleLlmProvider({
      baseUrl: env.aiBaseUrl!,
      apiKey: env.aiApiKey!,
      model: env.aiModel!,
      timeoutMs: env.aiTimeoutMs,
    });
  }

  // Exhaustive check — TypeScript should prevent this
  throw new Error(`Unknown AI provider: ${(env as AppEnv).aiProvider}`);
}
