/**
 * T34 — Outbound draft acceptance simulation.
 *
 * Requires the local simulation server:
 *   $env:ENABLE_SIMULATION_ENDPOINTS="true"; $env:AI_PROVIDER="mock"; npm run start:simulation
 *   node --experimental-strip-types scripts/simulations/run-t34-outbound-draft-acceptance.ts
 */

type JsonObject = Record<string, unknown>;

const BASE_URL = process.env.SERENA_SIMULATION_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = Number.parseInt(process.env.SERENA_SIMULATION_TIMEOUT_MS ?? "30000", 10);
const ELDER = "+5492600000000";

function asObject(value: unknown): JsonObject | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return undefined;
}

async function postSimulation(body: unknown): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/dev/simulate/inbound-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function simulateStep(text: string, conversationId?: string): Promise<JsonObject> {
  const response = await postSimulation({
    channel: "whatsapp",
    externalSenderId: ELDER,
    text,
    ...(conversationId !== undefined ? { conversationId } : {}),
  });

  if (response.status !== 200) {
    throw new Error(`Simulation failed with HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  }

  const parsed = asObject(response.body);
  if (parsed === undefined) {
    throw new Error("Simulation response is not an object");
  }

  return parsed;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runScenario(name: string, execute: () => Promise<void>): Promise<void> {
  process.stdout.write(`- ${name}... `);
  await execute();
  process.stdout.write("OK\n");
}

await runScenario("known recipient confirmation prepares delivery-ready draft", async () => {
  const first = await simulateStep("avisale a Carlos que llego tarde");
  const conversationId = String(asObject(first.conversation)?.id ?? "");
  const second = await simulateStep("sí", conversationId);
  const prepared = asObject(second.preparedOutbound);

  assertCondition(prepared?.status === "confirmed_pending_delivery", "expected confirmed_pending_delivery");
  assertCondition(prepared?.deliveryReady === true, "expected deliveryReady=true");
});

await runScenario("unknown recipient confirmation prepares unresolved draft", async () => {
  const first = await simulateStep("avisale a Persona Fantasma que llego tarde");
  const conversationId = String(asObject(first.conversation)?.id ?? "");
  const second = await simulateStep("sí", conversationId);
  const prepared = asObject(second.preparedOutbound);

  assertCondition(prepared?.status === "needs_recipient_resolution", "expected needs_recipient_resolution");
  assertCondition(prepared?.deliveryReady === false, "expected deliveryReady=false");
});

await runScenario("cancel keeps preparedOutbound absent", async () => {
  const first = await simulateStep("avisale a Carlos que llego tarde");
  const conversationId = String(asObject(first.conversation)?.id ?? "");
  const second = await simulateStep("mejor no", conversationId);

  assertCondition(second.preparedOutbound === undefined, "preparedOutbound should be absent on cancel");
});

await runScenario("edit then confirm uses updated message", async () => {
  const first = await simulateStep("avisale a Carlos que llego tarde");
  const conversationId = String(asObject(first.conversation)?.id ?? "");
  await simulateStep("cambiá el mensaje, decile que voy mañana", conversationId);
  const third = await simulateStep("sí", conversationId);
  const prepared = asObject(third.preparedOutbound);

  assertCondition(prepared?.messageText === "voy mañana", "expected updated messageText");
});

await runScenario("risk interrupt keeps preparedOutbound absent", async () => {
  const first = await simulateStep("avisale a Carlos que llego tarde");
  const conversationId = String(asObject(first.conversation)?.id ?? "");
  const second = await simulateStep("me caí y no puedo levantarme", conversationId);

  assertCondition(second.preparedOutbound === undefined, "preparedOutbound should be absent on risk pause");
  assertCondition(asObject(second.flowState)?.status === "paused", "flow should be paused");
});

console.log("T34 acceptance passed.");
