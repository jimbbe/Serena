/**
 * T1 — Gateway configuration from environment variables.
 *
 * Loads and validates all required env vars. Returns typed config or throws
 * with a clear message naming the missing var(s). In dry_run mode, skips
 * Evolution API key validation.
 */

export type GatewayRuntimeConfig = {
  mode: "dry_run" | "production";
  port: number;
  adminKey: string;
  appKey: string;
  evoKey: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  coreUrl: string | undefined;
  internalToken: string | undefined;
  routingTablePath: string | undefined;
  routingTableJson: string | undefined;
};

const VALID_MODES = new Set(["dry_run", "production"]);

function readString(key: string): string {
  return (process.env[key] ?? "").trim();
}

function readPort(): number {
  const raw = process.env["GATEWAY_PORT"];
  if (raw === undefined || raw === "") return 3001;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(
      `Invalid GATEWAY_PORT="${raw}". Must be an integer between 0 and 65535.`,
    );
  }
  return parsed;
}

function readMode(): "dry_run" | "production" {
  const raw = process.env["GATEWAY_MODE"];
  if (raw === undefined || raw === "") return "production" as const;
  const trimmed = raw.trim();
  if (trimmed === "dry_run") return "dry_run";
  if (trimmed === "production") return "production";
  throw new Error(
    `Invalid GATEWAY_MODE="${trimmed}". Valid values: "dry_run", "production".`,
  );
}

/**
 * Load and validate gateway configuration from environment variables.
 *
 * In production mode, ALL vars are required.
 * In dry_run mode, Evolution API vars (URL + key) are optional.
 *
 * All missing/empty vars are collected and reported in a single error.
 */
export function loadConfig(): GatewayRuntimeConfig {
  const mode = readMode();
  const port = readPort();

  const missing: string[] = [];

  function req(key: string): string {
    const val = readString(key);
    if (val.length === 0) {
      missing.push(key);
      return "";
    }
    return val;
  }

  // Auth keys are always required
  const adminKey = req("GATEWAY_ADMIN_KEY");
  const appKey = req("GATEWAY_APP_KEY");
  const evoKey = req("GATEWAY_EVO_KEY");

  const routingTablePath = readString("GATEWAY_ROUTING_TABLE_PATH");
  const routingTableJson = readString("GATEWAY_ROUTING_TABLE_JSON");

  // Serena core config is still required in dry_run mode.
  // In production, a routing table can replace the single-target fallback.
  const coreUrl = readString("SERENA_CORE_URL");
  const internalToken = readString("SERENA_INTERNAL_TOKEN");
  if (mode === "dry_run") {
    if (!coreUrl) missing.push("SERENA_CORE_URL");
    if (!internalToken) missing.push("SERENA_INTERNAL_TOKEN");
  }
  if (mode === "production" && !routingTablePath && !routingTableJson) {
    if (!coreUrl) missing.push("SERENA_CORE_URL");
    if (!internalToken) missing.push("SERENA_INTERNAL_TOKEN");
  }

  // Evolution API — required only in production mode
  let evolutionApiUrl = "";
  let evolutionApiKey = "";
  if (mode === "production") {
    evolutionApiUrl = req("EVOLUTION_API_URL");
    evolutionApiKey = req("EVOLUTION_API_KEY");
  } else {
    evolutionApiUrl = readString("EVOLUTION_API_URL");
    evolutionApiKey = readString("EVOLUTION_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or empty required environment variables: ${missing.join(", ")}.`,
    );
  }

  return {
    mode,
    port,
    adminKey,
    appKey,
    evoKey,
    evolutionApiUrl,
    evolutionApiKey,
    coreUrl: coreUrl || undefined,
    internalToken: internalToken || undefined,
    routingTablePath: routingTablePath || undefined,
    routingTableJson: routingTableJson || undefined,
  };
}
