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
  /** Outbound delivery adapter selection. Default "fake". */
  outboundDeliveryAdapter: "fake" | "gateway-wa";
  /** gateway-wa base URL (required when outboundDeliveryAdapter is gateway-wa). */
  gatewayWaBaseUrl?: string;
  /** gateway-wa app key (required when outboundDeliveryAdapter is gateway-wa). */
  gatewayWaAppKey?: string;
  /** gateway-wa fixed instance ID (required when outboundDeliveryAdapter is gateway-wa). */
  gatewayWaInstanceId?: string;
  /** gateway-wa request timeout in milliseconds. Default 30000. */
  gatewayWaTimeoutMs: number;
};

const VALID_AI_PROVIDERS = ["mock", "openai-compatible"] as const;
const VALID_OUTBOUND_DELIVERY_ADAPTERS = ["fake", "gateway-wa"] as const;

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

  const outboundDeliveryAdapter = (env.OUTBOUND_DELIVERY_ADAPTER ?? "fake").toLowerCase();
  if (!VALID_OUTBOUND_DELIVERY_ADAPTERS.includes(outboundDeliveryAdapter as typeof VALID_OUTBOUND_DELIVERY_ADAPTERS[number])) {
    throw new Error(
      `OUTBOUND_DELIVERY_ADAPTER must be one of: ${VALID_OUTBOUND_DELIVERY_ADAPTERS.join(", ")}`,
    );
  }
  const resolvedOutboundDeliveryAdapter = outboundDeliveryAdapter as "fake" | "gateway-wa";

  const gatewayWaBaseUrl = env.GATEWAY_WA_BASE_URL?.trim() || undefined;
  const gatewayWaAppKey = env.GATEWAY_WA_APP_KEY?.trim() || undefined;
  const gatewayWaInstanceId = env.GATEWAY_WA_INSTANCE_ID?.trim() || undefined;

  const gatewayWaTimeoutMsRaw = env.GATEWAY_WA_TIMEOUT_MS ?? "30000";
  const gatewayWaTimeoutMs = Number(gatewayWaTimeoutMsRaw);
  if (!Number.isInteger(gatewayWaTimeoutMs) || gatewayWaTimeoutMs <= 0) {
    throw new Error("GATEWAY_WA_TIMEOUT_MS must be a positive integer");
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

  if (resolvedOutboundDeliveryAdapter === "gateway-wa") {
    const missing: string[] = [];
    if (!gatewayWaBaseUrl) missing.push("GATEWAY_WA_BASE_URL");
    if (!gatewayWaAppKey) missing.push("GATEWAY_WA_APP_KEY");
    if (!gatewayWaInstanceId) missing.push("GATEWAY_WA_INSTANCE_ID");
    if (missing.length > 0) {
      throw new Error(
        `OUTBOUND_DELIVERY_ADAPTER=gateway-wa requires: ${missing.join(", ")}`,
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
    outboundDeliveryAdapter: resolvedOutboundDeliveryAdapter,
    gatewayWaTimeoutMs,
  };

  if (aiBaseUrl !== undefined) result.aiBaseUrl = aiBaseUrl;
  if (aiApiKey !== undefined) result.aiApiKey = aiApiKey;
  if (aiModel !== undefined) result.aiModel = aiModel;
  if (gatewayWaBaseUrl !== undefined) result.gatewayWaBaseUrl = gatewayWaBaseUrl;
  if (gatewayWaAppKey !== undefined) result.gatewayWaAppKey = gatewayWaAppKey;
  if (gatewayWaInstanceId !== undefined) result.gatewayWaInstanceId = gatewayWaInstanceId;

  return result;
}
