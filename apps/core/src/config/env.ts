export type AppEnv = {
  host: string;
  port: number;
  environment: string;
  /** Shared secret for POST /internal/* requests. Undefined means misconfigured. */
  internalToken: string | undefined;
  /** Enables dev-only simulation endpoints. Default false. */
  enableSimulationEndpoints: boolean;
  /** LLM provider selection. Default "mock". */
  aiProvider: "mock" | "openai-compatible";
  /** OpenAI-compatible base URL (required when aiProvider is openai-compatible). */
  aiBaseUrl?: string;
  /** API key for the LLM provider (never logged). Required for openai-compatible. */
  aiApiKey?: string;
  /** Model name to use. Required for openai-compatible. */
  aiModel?: string;
  /** Request timeout in milliseconds. Default 30000. */
  aiTimeoutMs: number;
};

const VALID_AI_PROVIDERS = ["mock", "openai-compatible"] as const;

export function loadAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const host = env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(env.PORT ?? "3000", 10);
  const environment = env.APP_ENV ?? "local";
  const internalToken = env.SERENA_INTERNAL_TOKEN || undefined;
  const enableSimulationEndpoints =
    (env.ENABLE_SIMULATION_ENDPOINTS ?? "").toLowerCase() === "true";

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  // --- AI Provider configuration ---

  const aiProvider = (env.AI_PROVIDER ?? "mock").toLowerCase();
  if (!VALID_AI_PROVIDERS.includes(aiProvider as typeof VALID_AI_PROVIDERS[number])) {
    throw new Error(
      `AI_PROVIDER must be one of: ${VALID_AI_PROVIDERS.join(", ")}`
    );
  }
  const resolvedAiProvider = aiProvider as "mock" | "openai-compatible";

  const aiBaseUrl = env.AI_BASE_URL?.trim() || undefined;
  const aiApiKey = env.AI_API_KEY?.trim() || undefined;
  const aiModel = env.AI_MODEL?.trim() || undefined;

  const aiTimeoutMsRaw = env.AI_TIMEOUT_MS ?? "30000";
  const aiTimeoutMs = Number(aiTimeoutMsRaw);
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs <= 0) {
    throw new Error("AI_TIMEOUT_MS must be a positive integer");
  }

  // Validate openai-compatible requirements
  if (resolvedAiProvider === "openai-compatible") {
    const missing: string[] = [];
    if (!aiBaseUrl) missing.push("AI_BASE_URL");
    if (!aiApiKey) missing.push("AI_API_KEY");
    if (!aiModel) missing.push("AI_MODEL");
    if (missing.length > 0) {
      throw new Error(
        `AI_PROVIDER=openai-compatible requires: ${missing.join(", ")}`
      );
    }
  }

  const result: AppEnv = {
    host,
    port,
    environment,
    internalToken,
    enableSimulationEndpoints,
    aiProvider: resolvedAiProvider,
    aiTimeoutMs,
  };

  if (aiBaseUrl !== undefined) result.aiBaseUrl = aiBaseUrl;
  if (aiApiKey !== undefined) result.aiApiKey = aiApiKey;
  if (aiModel !== undefined) result.aiModel = aiModel;

  return result;
}
