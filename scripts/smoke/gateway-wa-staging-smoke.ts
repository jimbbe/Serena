/**
 * T41 smoke helper (T42 hardened; safe, non-destructive, private-only)
 * Checks only: health, auth rejection, unknown path, malformed payload.
 * Explicitly: no real pairing, no real send.
 *
 * Usage:
 *   GATEWAY_BASE_URL=http://gateway-wa:3001 node --experimental-strip-types scripts/smoke/gateway-wa-staging-smoke.ts
 */

const baseUrl = (process.env["GATEWAY_BASE_URL"] ?? "").trim();
const appKey = (process.env["GATEWAY_APP_KEY"] ?? "").trim();

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
  const response = await fetch(`${baseUrl}/unknown-path`);

  assertStatus(response, 404, "GET /unknown-path");
  console.log(`[smoke] GET /unknown-path -> ${response.status}`);
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

main().catch((error) => {
  console.error("[smoke] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
