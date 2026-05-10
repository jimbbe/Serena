/**
 * T33 — Channel-aware identity acceptance simulation.
 *
 * Exercises the live HTTP simulation endpoint with visible progress logs.
 * It does not use real WhatsApp, real outbound delivery, PostgreSQL, or a real LLM
 * provider; run the server with ENABLE_SIMULATION_ENDPOINTS=true and AI_PROVIDER=mock.
 *
 * Usage:
 *   $env:ENABLE_SIMULATION_ENDPOINTS="true"; $env:AI_PROVIDER="mock"; npm run start:simulation
 *   node --experimental-strip-types scripts/simulations/run-t33-identity-acceptance.ts
 */

type JsonObject = Record<string, unknown>;

type SimulationPayload = {
  channel: "whatsapp" | "voice" | "web_chat";
  externalSenderId: string;
  text: string;
  conversationId?: string;
};

type Scenario = {
  id: string;
  name: string;
  payload: SimulationPayload;
  expected: string;
  check: (body: JsonObject) => boolean;
};

type ScenarioResult = {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  durationMs: number;
};

const BASE_URL = process.env.SERENA_SIMULATION_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = Number.parseInt(process.env.SERENA_SIMULATION_TIMEOUT_MS ?? "30000", 10);

function asObject(value: unknown): JsonObject | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

function field(obj: JsonObject | undefined, key: string): unknown {
  return obj?.[key];
}

function bodySummary(body: JsonObject): string {
  const identity = asObject(body.identity);
  const flowState = asObject(body.flowState);
  const conversation = asObject(body.conversation);

  const identityPart = identity
    ? `identity=${field(identity, "status")}:${field(identity, "personId") ?? "—"}:${field(identity, "role") ?? "—"}`
    : "identity=none";

  const routePart = `profile=${String(body.profileId ?? "none")} useCase=${String(body.useCaseId ?? "none")}`;
  const flowPart = flowState
    ? `flow=${String(field(flowState, "status"))}/${String(field(flowState, "pendingAction") ?? "—")}`
    : "flow=none";
  const conversationPart = conversation ? `conversation=${String(field(conversation, "id") ?? "none")}` : "conversation=none";

  return `${identityPart} | ${routePart} | ${flowPart} | ${conversationPart}`;
}

async function postSimulation(payload: SimulationPayload): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/dev/simulate/inbound-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    return { status: response.status, body: parsed };
  } catch (error) {
    return { status: 0, body: { error: error instanceof Error ? error.message : String(error) } };
  } finally {
    clearTimeout(timeout);
  }
}

function requireIdentity(body: JsonObject, expectedStatus: string, expectedPersonId?: string): boolean {
  const identity = asObject(body.identity);
  if (field(identity, "status") !== expectedStatus) return false;
  if (expectedPersonId !== undefined && field(identity, "personId") !== expectedPersonId) return false;
  return true;
}

const scenarios: Scenario[] = [
  {
    id: "T33-01",
    name: "WhatsApp conocido conversa",
    payload: { channel: "whatsapp", externalSenderId: "5491111111111", text: "hola Serena" },
    expected: "identity.resolved + conversation profile + conversation created",
    check: (body) =>
      requireIdentity(body, "resolved")
      && body.profileId === "conversation"
      && asObject(body.conversation) !== undefined,
  },
  {
    id: "T33-02",
    name: "WhatsApp desconocido no entra en mediación",
    payload: { channel: "whatsapp", externalSenderId: "5498888888888", text: "avisale a Carlos que llego tarde" },
    expected: "identity.unknown + no flowState + no mediation profile",
    check: (body) =>
      requireIdentity(body, "unknown")
      && body.flowState === undefined
      && body.profileId !== "mediation_understanding",
  },
  {
    id: "T33-03",
    name: "Dispositivo local autorizado conversa como Marta",
    payload: { channel: "voice", externalSenderId: "serena_device_001", text: "hola Serena" },
    expected: "identity.resolved personId=marta role=elder + conversation created",
    check: (body) => {
      const identity = asObject(body.identity);
      return requireIdentity(body, "resolved", "marta")
        && field(identity, "role") === "elder"
        && field(identity, "displayName") === "Marta"
        && asObject(body.conversation) !== undefined;
    },
  },
  {
    id: "T33-04",
    name: "Dispositivo local autorizado inicia mediación",
    payload: { channel: "voice", externalSenderId: "serena_device_001", text: "avisale a Carlos que llego tarde" },
    expected: "identity.resolved marta + flowState.confirming + no real send",
    check: (body) => {
      const flowState = asObject(body.flowState);
      return requireIdentity(body, "resolved", "marta")
        && field(flowState, "status") === "confirming"
        && field(flowState, "pendingAction") === "confirm_mediation"
        && (body.simulatedOutbound === null || body.simulatedOutbound === undefined);
    },
  },
  {
    id: "T33-05",
    name: "Dispositivo local autorizado con riesgo va a risk_review",
    payload: { channel: "voice", externalSenderId: "serena_device_001", text: "me caí y no puedo levantarme" },
    expected: "identity.resolved marta + profile risk_review + no flowState",
    check: (body) =>
      requireIdentity(body, "resolved", "marta")
      && body.profileId === "risk_review"
      && body.useCaseId === "serena.risk.review"
      && body.flowState === undefined,
  },
  {
    id: "T33-06",
    name: "Dispositivo local desconocido no entra en mediación",
    payload: { channel: "voice", externalSenderId: "unknown_device_001", text: "avisale a Carlos que llego tarde" },
    expected: "identity.unknown + no flowState + no mediation profile",
    check: (body) =>
      requireIdentity(body, "unknown")
      && body.flowState === undefined
      && body.profileId !== "mediation_understanding",
  },
  {
    id: "T33-07",
    name: "Web chat desconocido tampoco entra en mediación",
    payload: { channel: "web_chat", externalSenderId: "unknown_device_001", text: "avisale a Carlos que llego tarde" },
    expected: "identity.unknown + no flowState + no mediation profile",
    check: (body) =>
      requireIdentity(body, "unknown")
      && body.flowState === undefined
      && body.profileId !== "mediation_understanding",
  },
];

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const startedAt = Date.now();
  console.log(`\n▶ ${scenario.id} — ${scenario.name}`);
  console.log(`  Request: ${scenario.payload.channel}:${scenario.payload.externalSenderId} — "${scenario.payload.text}"`);
  console.log(`  Expected: ${scenario.expected}`);

  const { status, body } = await postSimulation(scenario.payload);
  const durationMs = Date.now() - startedAt;
  const parsed = asObject(body);

  if (status !== 200 || parsed === undefined) {
    const actual = `HTTP ${status} ${JSON.stringify(body).slice(0, 300)}`;
    console.log(`  ❌ FAIL (${durationMs}ms) → ${actual}`);
    return { id: scenario.id, name: scenario.name, passed: false, expected: scenario.expected, actual, durationMs };
  }

  const actual = bodySummary(parsed);
  const passed = scenario.check(parsed);
  console.log(`  ${passed ? "✅ PASS" : "❌ FAIL"} (${durationMs}ms) → ${actual}`);

  if (!passed) {
    console.log(`  Response: ${JSON.stringify(parsed, null, 2).slice(0, 1_500)}`);
  }

  return { id: scenario.id, name: scenario.name, passed, expected: scenario.expected, actual, durationMs };
}

async function main(): Promise<void> {
  console.log("# T33 — Channel-aware identity endpoint acceptance");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log(`Scenarios: ${scenarios.length}`);

  const results: ScenarioResult[] = [];
  const startedAt = Date.now();

  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const durationMs = Date.now() - startedAt;

  console.log("\n# Summary");
  for (const result of results) {
    console.log(`${result.passed ? "✅" : "❌"} ${result.id} ${result.name} (${result.durationMs}ms)`);
  }
  console.log(`\nResult: ${passed}/${results.length} passed, ${failed} failed, ${durationMs}ms total`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
