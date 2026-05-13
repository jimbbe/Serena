/**
 * T37 smoke helper (safe, non-destructive)
 *
 * Usage:
 *   GATEWAY_BASE_URL=http://localhost:3001 node --experimental-strip-types scripts/smoke/gateway-wa-staging-smoke.ts
 */

const baseUrl = (process.env["GATEWAY_BASE_URL"] ?? "http://localhost:3001").trim();
const appKey = (process.env["GATEWAY_APP_KEY"] ?? "").trim();

async function main(): Promise<void> {
  console.log(`[smoke] baseUrl=${baseUrl}`);

  await checkHealth();
  await checkAuthRejection();
  await checkUnknownRoute();
  await checkSendPathAuthAndValidation();

  console.log("[smoke] done");
}

async function checkHealth(): Promise<void> {
  const response = await fetch(`${baseUrl}/health`);
  console.log(`[smoke] /health -> ${response.status}`);
}

async function checkAuthRejection(): Promise<void> {
  const response = await fetch(`${baseUrl}/instances`, { method: "POST" });
  console.log(`[smoke] /instances without key -> ${response.status}`);
}

async function checkUnknownRoute(): Promise<void> {
  const response = await fetch(`${baseUrl}/webhook/evolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Evo-Key": appKey || "placeholder",
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

  const body = await response.text();
  console.log(`[smoke] webhook unknown route -> ${response.status} ${body}`);
}

async function checkSendPathAuthAndValidation(): Promise<void> {
  const noKeyResponse = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ instance: "serena-main", to: "5491111111111", text: "smoke" }),
  });
  console.log(`[smoke] /send without key -> ${noKeyResponse.status}`);

  const malformedPayloadResponse = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-App-Key": appKey || "placeholder",
    },
    body: JSON.stringify({ instance: "", to: "", text: "" }),
  });
  console.log(`[smoke] /send malformed payload with key -> ${malformedPayloadResponse.status}`);
}

main().catch((error) => {
  console.error("[smoke] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
