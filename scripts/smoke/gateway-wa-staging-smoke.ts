/**
 * T41 smoke helper (T42 hardened; safe, non-destructive, private-only)
 * Checks only: health, auth rejection, unknown route, malformed payload.
 * Explicitly: no real pairing, no real send.
 *
 * Usage:
 *   GATEWAY_BASE_URL=http://gateway-wa:3001 node --experimental-strip-types scripts/smoke/gateway-wa-staging-smoke.ts
 */

const baseUrl = (process.env["GATEWAY_BASE_URL"] ?? "").trim();
const appKey = (process.env["GATEWAY_APP_KEY"] ?? "").trim();
const evoKey = (process.env["GATEWAY_EVO_KEY"] ?? "").trim();

async function main(): Promise<void> {
  if (!baseUrl) {
    throw new Error("GATEWAY_BASE_URL is required (use a private reachable gateway endpoint)");
  }

  assertPrivateBaseUrl(baseUrl);

  console.log("[smoke] private base URL accepted");

  await checkHealth();
  await checkAuthRejection();
  await checkUnknownRoute();
  await checkSendPathAuthAndValidation();

  console.log("[smoke] done");
}

async function checkHealth(): Promise<void> {
  const response = await fetch(`${baseUrl}/health`);
  assertStatus(response, 200, "/health");
  console.log(`[smoke] /health -> ${response.status}`);
}

async function checkAuthRejection(): Promise<void> {
  const response = await fetch(`${baseUrl}/instances`, { method: "POST" });
  assertStatus(response, 401, "/instances without key");
  console.log(`[smoke] /instances without key -> ${response.status}`);
}

async function checkUnknownRoute(): Promise<void> {
  const response = await fetch(`${baseUrl}/webhook/evolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Evo-Key": evoKey || "placeholder",
    },
    body: JSON.stringify({
      event: "MESSAGES_UPSERT",
      instance: "unknown-instance",
      data: {
        key: {
          id: `smoke-${Date.now()}`,
          remoteJid: "5491111111111@s.whatsapp.net",
          fromMe: false,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: "smoke test" },
      },
    }),
  });

  assertStatus(response, 200, "webhook unknown instance");
  const body = await readJsonObject(response, "webhook unknown instance body");
  assertEqual(body["ignored"], true, "webhook unknown instance ignored flag");
  assertEqual(body["reason"], "routing_not_configured", "webhook unknown instance reason");
  assertEqual(body["instanceId"], "unknown-instance", "webhook unknown instance id");
  console.log(`[smoke] webhook unknown route -> ${response.status} ${JSON.stringify(body)}`);
}

async function checkSendPathAuthAndValidation(): Promise<void> {
  const noKeyResponse = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ instance: "serena-main", to: "5491111111111", text: "smoke" }),
  });
  assertStatus(noKeyResponse, 401, "/send without key");
  console.log(`[smoke] /send without key -> ${noKeyResponse.status}`);

  const malformedPayloadResponse = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-App-Key": appKey || "placeholder",
    },
    body: JSON.stringify({ instance: "", to: "", text: "" }),
  });
  assertStatus(malformedPayloadResponse, 400, "/send malformed payload with valid app key");
  console.log(`[smoke] /send malformed payload with key -> ${malformedPayloadResponse.status}`);
}

function assertStatus(response: Response, expected: number, label: string): void {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertPrivateBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("GATEWAY_BASE_URL must be a valid URL");
  }

  const host = parsed.hostname.toLowerCase();
  const privateHosts = new Set(["localhost", "127.0.0.1", "gateway-wa"]);
  const isPrivateHost = privateHosts.has(host) || host.endsWith(".internal") || host.endsWith(".local");

  if (!isPrivateHost) {
    throw new Error("GATEWAY_BASE_URL must be private/operator-only for T42 smoke");
  }
}

async function readJsonObject(response: Response, label: string): Promise<Record<string, unknown>> {
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label}: expected JSON object body, got non-JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label}: expected JSON object body`);
  }

  return parsed as Record<string, unknown>;
}

main().catch((error) => {
  console.error("[smoke] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
