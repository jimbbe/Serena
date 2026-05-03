export type AppEnv = {
  host: string;
  port: number;
  environment: string;
  /** Shared secret for POST /internal/* requests. Undefined means misconfigured. */
  internalToken: string | undefined;
  /** Enables dev-only simulation endpoints. Default false. */
  enableSimulationEndpoints: boolean;
};

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

  return { host, port, environment, internalToken, enableSimulationEndpoints };
}
