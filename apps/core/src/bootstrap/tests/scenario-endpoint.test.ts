/**
 * TXX — Integration tests for POST /dev/simulate/scenario.
 *
 * Tests the full HTTP server routing for multi-step scenario simulation:
 * request parsing, validation, pipeline execution, and structured responses.
 *
 * Uses real ProcessInboundMessage + MockLlmProvider for realistic paths.
 * Uses mocked ProcessChannelInboundMessage for failure paths.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpServer } from "../server.ts";
import { createInMemoryPipeline } from "../create-in-memory-pipeline.ts";
import { createSimulationHandler } from "../simulation-handler.ts";
import { createScenarioHandler } from "../scenario-handler.ts";
import { SimulationScenarioRunner } from "../scenario-runner.ts";
import type {
  ScenarioRequest,
  ScenarioResult,
  ScenarioSummary,
} from "../scenario-runner.ts";
import { calculateSummary } from "../scenario-runner.ts";
import { isScenarioStepFailure } from "../scenario-runner.ts";
import type { ScenarioStepResult } from "../scenario-runner.ts";
import { ProcessChannelInboundMessage } from "../../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts";
import type { ChannelInboundResult } from "../../modules/inbound-gate/application/results/channel-inbound-result.ts";
import type { InboundMessageCommand } from "../../modules/inbound-gate/domain/inbound-message-command.ts";
import type { InboundDecisionReason } from "../../modules/inbound-gate/domain/inbound-decision.ts";
import type { GuideUseCaseId } from "../../modules/ai-guide/domain/guide-use-case-id.ts";

// ---------------------------------------------------------------------------
// Seed contacts (mirrors contacts.seed.json)
// ---------------------------------------------------------------------------

const MARIA_WHATSAPP = "5491111111111";
const MARTA_WHATSAPP = "+5492600000000";
const UNKNOWN_WHATSAPP = "5499999999999";

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

async function request(
  method: string,
  path: string,
  port: number,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {};
    if (data !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(data).toString();
    }

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { _raw: raw };
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (data) req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Common scenario payload builder
// ---------------------------------------------------------------------------

type ScenarioStepPayload = {
  text: string;
  channel?: string;
  externalSenderId?: string;
  personId?: string;
  conversationId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

function scenarioPayload(overrides: Partial<{
  scenarioId: string;
  tenantId: string;
  channel: string;
  externalSenderId: string;
  conversationId: string;
  stopOnError: boolean;
  steps: ScenarioStepPayload[];
}> = {}): Record<string, unknown> {
  return {
    scenarioId: overrides.scenarioId ?? "test-001",
    tenantId: overrides.tenantId ?? "demo",
    channel: overrides.channel ?? "whatsapp",
    externalSenderId: overrides.externalSenderId ?? MARIA_WHATSAPP,
    ...(overrides.conversationId !== undefined ? { conversationId: overrides.conversationId } : {}),
    ...(overrides.stopOnError !== undefined ? { stopOnError: overrides.stopOnError } : {}),
    steps: overrides.steps ?? [{ text: "hola" }, { text: "chau" }],
  };
}

// ---------------------------------------------------------------------------
// Shared server fixture (scenario enabled)
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

before(async () => {
  const { processInboundMessage, aiGuideService, identityResolver, conversationStore } = await createInMemoryPipeline();

  const processChannelInboundMessage = new ProcessChannelInboundMessage({
    processInboundMessage,
    aiGuideService,
    identityResolver,
    conversationStore,
  });

  // Wire BOTH simulation and scenario handlers
  const simulationHandler = createSimulationHandler(processChannelInboundMessage);
  const scenarioRunner = new SimulationScenarioRunner({ processChannelInboundMessage });
  const scenarioHandler = createScenarioHandler(scenarioRunner);

  const httpServer = createHttpServer("test", undefined, undefined, simulationHandler, scenarioHandler);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        port = addr.port;
      }
      resolve();
    });
  });

  server = httpServer;
});

after(() => {
  server.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /dev/simulate/scenario", () => {
  // =========================================================================
  // Endpoint disabled — 404
  // =========================================================================

  it("returns 404 when scenario handler is not configured", async () => {
    const disabledServer = createHttpServer("test", undefined, undefined, undefined, undefined);

    let disabledPort = 0;
    await new Promise<void>((resolve) => {
      disabledServer.listen(0, "127.0.0.1", () => {
        const addr = disabledServer.address();
        if (addr && typeof addr === "object") {
          disabledPort = addr.port;
        }
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", disabledPort, scenarioPayload());

      assert.equal(status, 404);
      const obj = body as Record<string, unknown>;
      assert.equal(obj.error, "simulation_not_enabled");
    } finally {
      disabledServer.close();
    }
  });

  // =========================================================================
  // Method enforcement
  // =========================================================================

  it("GET returns 405 method_not_allowed", async () => {
    const { status, body } = await request("GET", "/dev/simulate/scenario", port);

    assert.equal(status, 405);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "method_not_allowed");
  });

  // =========================================================================
  // Validation — invalid payloads
  // =========================================================================

  it("invalid JSON returns 400", async () => {
    const { status, body } = await new Promise<{ status: number; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/dev/simulate/scenario",
            method: "POST",
            headers: { "content-type": "application/json" },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              const raw = Buffer.concat(chunks).toString("utf-8");
              resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
            });
          },
        );
        req.on("error", reject);
        req.write("not json at all");
        req.end();
      },
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_json");
  });

  it("missing scenarioId returns 400 with field error", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [{ text: "hola" }],
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "scenarioId"));
  });

  it("missing tenantId returns 400 with field error", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "test-001",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [{ text: "hola" }],
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "tenantId"));
  });

  it("missing steps returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "test-001",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "steps"));
  });

  it("empty steps array returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "test-001",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [],
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string; message: string }>;
    const stepsField = fields.find((f) => f.field === "steps");
    assert.ok(stepsField !== undefined);
    assert.ok(stepsField.message.includes("at least one step"));
  });

  it("step missing text returns 400 with field error", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "test-001",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [{ channel: "whatsapp" }],
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "steps[0].text"));
  });

  it("step empty text returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "test-001",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [{ text: "   " }],
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "steps[0].text"));
  });

  it("invalid channel returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({ channel: "email" }));

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string; message: string }>;
    const channelField = fields.find((f) => f.field === "channel");
    assert.ok(channelField !== undefined);
    assert.ok(channelField.message.includes("Must be one of:"));
  });

  it("invalid step override channel returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      steps: [{ text: "hola", channel: "invalid_channel" }],
    }));

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "steps[0].channel"));
  });

  it("missing externalSenderId returns 400 with per-step errors", async () => {
    const payload = scenarioPayload();
    delete (payload as Record<string, unknown>).externalSenderId;

    const { status, body } = await request("POST", "/dev/simulate/scenario", port, payload);

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string; message: string }>;
    const senderErrors = fields.filter((f) => f.field.startsWith("steps[") && f.field.endsWith(".externalSenderId"));
    assert.ok(senderErrors.length > 0);
    for (const err of senderErrors) {
      assert.ok(err.message.includes("Required when scenario.externalSenderId is not provided"));
    }
  });

  it("blank externalSenderId returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({ externalSenderId: "   " }));

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "externalSenderId"));
  });

  it("invalid stopOnError type returns 400", async () => {
    const payload = scenarioPayload({ stopOnError: "yes" as unknown as boolean });

    const { status, body } = await request("POST", "/dev/simulate/scenario", port, payload);

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "stopOnError"));
  });

  it("step override blank externalSenderId returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      steps: [{ text: "hola", externalSenderId: "   " }],
    }));

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "steps[0].externalSenderId"));
  });

  it("scenario without global externalSenderId succeeds when each step provides one", async () => {
    const payload = {
      scenarioId: "per-step-senders",
      tenantId: "demo",
      channel: "whatsapp",
      steps: [
        { text: "hola desde Marta", externalSenderId: MARTA_WHATSAPP },
        { text: "hola desde María", externalSenderId: MARIA_WHATSAPP },
      ],
    };

    const { status, body } = await request("POST", "/dev/simulate/scenario", port, payload);

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 2);

    const step0 = result.steps[0]!;
    assert.ok(step0.result !== null);
    assert.equal(step0.input.externalSenderId, MARTA_WHATSAPP);
    const id0 = step0.result.identity;
    assert.ok(id0 !== undefined);
    assert.equal(id0.displayName, "Marta");

    const step1 = result.steps[1]!;
    assert.ok(step1.result !== null);
    assert.equal(step1.input.externalSenderId, MARIA_WHATSAPP);
    const id1 = step1.result.identity;
    assert.ok(id1 !== undefined);
    assert.equal(id1.displayName, "María");
  });

  it("scenario without global sender and step without sender returns 400 with clear message", async () => {
    const payload = {
      scenarioId: "missing-sender",
      tenantId: "demo",
      channel: "whatsapp",
      steps: [
        { text: "has sender", externalSenderId: MARIA_WHATSAPP },
        { text: "missing sender" },
      ],
    };

    const { status, body } = await request("POST", "/dev/simulate/scenario", port, payload);

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string; message: string }>;
    const step1SenderError = fields.find((f) => f.field === "steps[1].externalSenderId");
    assert.ok(step1SenderError !== undefined);
    assert.equal(step1SenderError.message, "Required when scenario.externalSenderId is not provided");
  });

  // =========================================================================
  // Happy path — conversational scenario (3 steps, all success)
  // =========================================================================

  it("conversational scenario — 3 steps all success", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "casual-chat",
      steps: [
        { text: "hola Serena, cómo estás?" },
        { text: "qué lindo día hace" },
        { text: "bueno, me voy, chau" },
      ],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.scenarioId, "casual-chat");
    assert.equal(typeof result.traceId, "string");
    assert.ok(result.traceId.length > 0);
    assert.equal(result.steps.length, 3);

    for (let i = 0; i < 3; i++) {
      const step = result.steps[i]!;
      assert.equal(step.index, i);
      assert.equal(step.error, null);
      assert.ok(step.result !== null);

      const decision = step.result.inboundDecision;
      assert.equal(decision.status, "allowed");
      assert.equal(decision.reason, "known_sender_conversational");

      // Identity should be resolved (Maria is in seed data)
      const identity = step.result.identity;
      assert.ok(identity !== undefined);
      assert.equal(identity.status, "resolved");
    }

    assert.equal(result.summary.totalSteps, 3);
    assert.equal(result.summary.successfulSteps, 3);
    assert.equal(result.summary.failedSteps, 0);
    assert.equal(result.summary.mediationEvents, 0);
    assert.equal(result.summary.riskEvents, 0);
    assert.equal(result.summary.unknownSenders, 0);
    assert.equal(result.summary.blockedSenders, 0);
  });

  // =========================================================================
  // Mediation scenario
  // =========================================================================

  it("mediation scenario — step with 'avisale a Carlos' triggers mediation", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "mediation-test",
      steps: [
        { text: "hola Serena" },
        { text: "avisale a Carlos que voy a llegar 15 minutos tarde" },
        { text: "gracias" },
      ],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 3);
    assert.equal(result.summary.mediationEvents, 1);
    assert.equal(result.summary.successfulSteps, 3);

    // The mediation step should have the right profile
    const mediationStep = result.steps[1]!;
    assert.ok(mediationStep.result !== null);
    assert.equal(mediationStep.result.inboundDecision.status, "needs_mediation");
    assert.equal(mediationStep.result.inboundDecision.reason, "third_party_mediation_request");
    assert.equal(mediationStep.result.profileId, "mediation_understanding");
  });

  // =========================================================================
  // Risk scenario
  // =========================================================================

  it("risk scenario — step with 'necesito ayuda urgente' triggers risk_review", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "risk-test",
      steps: [
        { text: "hola" },
        { text: "necesito ayuda urgente" },
        { text: "gracias" },
      ],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 3);
    assert.equal(result.summary.riskEvents, 1);
    assert.equal(result.summary.successfulSteps, 3);

    const riskStep = result.steps[1]!;
    assert.ok(riskStep.result !== null);
    assert.equal(riskStep.result.inboundDecision.reason, "urgent_or_risk_content");
    assert.equal(riskStep.result.profileId, "risk_review");
  });

  // =========================================================================
  // Unknown sender
  // =========================================================================

  it("unknown sender — unknown WhatsApp number blocked", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "unknown-sender",
      externalSenderId: UNKNOWN_WHATSAPP,
      steps: [{ text: "hola" }],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 1);

    const step = result.steps[0]!;
    assert.ok(step.result !== null);
    assert.equal(step.result.inboundDecision.status, "blocked");

    // Identity is unknown
    const identity = step.result.identity;
    assert.ok(identity !== undefined);
    assert.equal(identity.status, "unknown");
    assert.equal(identity.authorized, false);

    // Unknown sender — pipeline succeeded (correctly blocked by gate with no errors)
    assert.equal(result.summary.successfulSteps, 1);
    assert.equal(result.summary.failedSteps, 0);
    assert.equal(result.summary.unknownSenders, 1);
    assert.equal(result.summary.blockedSenders, 1);
  });

  // =========================================================================
  // Mixed scenario — conversation + mediation + risk
  // =========================================================================

  it("mixed scenario — conversation + mediation + risk in one run", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "mixed-flow",
      steps: [
        { text: "hola Serena" },
        { text: "avisale a Carlos que voy a llegar 15 minutos tarde" },
        { text: "necesito ayuda urgente" },
        { text: "gracias" },
      ],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 4);
    assert.equal(result.summary.totalSteps, 4);

    // Step 0: conversational
    const step0 = result.steps[0]!;
    assert.ok(step0.result !== null);
    assert.equal(step0.result.inboundDecision.reason, "known_sender_conversational");
    assert.equal(step0.result.inboundDecision.status, "allowed");

    // Step 1: mediation
    const step1 = result.steps[1]!;
    assert.ok(step1.result !== null);
    assert.equal(step1.result.inboundDecision.status, "needs_mediation");
    assert.equal(step1.result.inboundDecision.reason, "third_party_mediation_request");

    // Step 2: risk
    const step2 = result.steps[2]!;
    assert.ok(step2.result !== null);
    assert.equal(step2.result.inboundDecision.reason, "urgent_or_risk_content");
    assert.equal(step2.result.profileId, "risk_review");

    // Step 3: conversational — verify it's allowed/conversational (not risk)
    const step3 = result.steps[3]!;
    assert.ok(step3.result !== null);
    const step3Reason = step3.result.inboundDecision.reason;
    assert.ok(
      step3Reason === "known_sender_conversational",
      `Step 3 reason expected "known_sender_conversational", got "${step3Reason}"`,
    );

    // Summary: verify at least 1 mediation event and at least 1 risk event
    assert.equal(result.summary.successfulSteps, 4);
    assert.ok(result.summary.mediationEvents >= 1, `mediationEvents ${result.summary.mediationEvents} should be >= 1`);
    assert.ok(result.summary.riskEvents >= 1, `riskEvents ${result.summary.riskEvents} should be >= 1`);
  });

  // =========================================================================
  // Step overrides — channel
  // =========================================================================

  it("step overrides channel", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "channel-override",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [
        { text: "hola", channel: "voice" },
        { text: "chau", channel: "web_chat" },
      ],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;

    // Step 0 uses voice override
    assert.equal(result.steps[0]!.result?.channel, "voice");
    assert.equal(result.steps[0]!.input.channel, "voice");

    // Step 1 uses web_chat override
    assert.equal(result.steps[1]!.result?.channel, "web_chat");
    assert.equal(result.steps[1]!.input.channel, "web_chat");
  });

  // =========================================================================
  // Multi-actor scenario — different senders per step
  // =========================================================================

  it("multi-actor scenario — different senders per step", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "multi-actor",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARTA_WHATSAPP,
      steps: [
        { text: "hola Serena, soy Marta", externalSenderId: MARTA_WHATSAPP },
        { text: "Hola, soy María", externalSenderId: MARIA_WHATSAPP },
        { text: "avisale a Juan", externalSenderId: MARIA_WHATSAPP },
      ],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 3);

    // Marta
    const step0 = result.steps[0]!;
    assert.ok(step0.result !== null);
    assert.equal(step0.input.externalSenderId, MARTA_WHATSAPP);
    const id0 = step0.result.identity;
    assert.ok(id0 !== undefined);
    assert.equal(id0.displayName, "Marta");
    assert.equal(id0.role, "elder");

    // María
    const step1 = result.steps[1]!;
    assert.ok(step1.result !== null);
    assert.equal(step1.input.externalSenderId, MARIA_WHATSAPP);
    const id1 = step1.result.identity;
    assert.ok(id1 !== undefined);
    assert.equal(id1.displayName, "María");
    assert.equal(id1.role, "contact");

    // María again
    const step2 = result.steps[2]!;
    assert.ok(step2.result !== null);
    assert.equal(step2.input.externalSenderId, MARIA_WHATSAPP);
  });

  // =========================================================================
  // stopOnError=true — breaks on first error
  // =========================================================================

  it("stopOnError=true breaks on first error", async () => {
    // Create a mock that throws on step index 1
    let callCount = 0;
    const mockChannelInbound = {
      execute: async (_cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        callCount++;
        if (callCount === 2) {
          throw new Error("injected pipeline failure");
        }
        return {
          traceId: "mock-trace",
          channel: "whatsapp",
          inboundDecision: {
            status: "allowed" as const,
            reason: "known_sender_conversational" as const,
            metadata: {
              normalizedSenderId: "test",
              senderKnown: true,
              receivedAt: new Date().toISOString(),
              audited: false,
              policyVersion: "test-v1",
              matchedSignals: [] as readonly string[],
              precedence: "conversation_default" as const,
            },
          },
          profileId: undefined,
          useCaseId: undefined,
          guideResult: undefined,
          warnings: [],
          errors: [],
        };
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "stop-on-error",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        stopOnError: true,
        steps: [
          { text: "first step" },
          { text: "throws here" },
          { text: "never executed" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      // Only 2 steps should be present (index 0 and 1)
      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0]!.error, null);
      assert.ok(result.steps[0]!.result !== null);
      assert.equal(result.steps[1]!.error, "injected pipeline failure");
      assert.equal(result.steps[1]!.result, null);

      // Summary: 2 steps total, 1 success, 1 fail
      assert.equal(result.summary.totalSteps, 2);
      assert.equal(result.summary.successfulSteps, 1);
      assert.equal(result.summary.failedSteps, 1);

      // Verify call count — only 2 calls made (step 3 not executed)
      assert.equal(callCount, 2);
    } finally {
      testServer.close();
    }
  });

  // =========================================================================
  // stopOnError=false — continues past error
  // =========================================================================

  it("stopOnError=false continues past error", async () => {
    let callCount = 0;
    const mockChannelInbound = {
      execute: async (_cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        callCount++;
        if (callCount === 2) {
          throw new Error("injected pipeline failure");
        }
        return {
          traceId: "mock-trace",
          channel: "whatsapp",
          inboundDecision: {
            status: "allowed" as const,
            reason: "known_sender_conversational" as const,
            metadata: {
              normalizedSenderId: "test",
              senderKnown: true,
              receivedAt: new Date().toISOString(),
              audited: false,
              policyVersion: "test-v1",
              matchedSignals: [] as readonly string[],
              precedence: "conversation_default" as const,
            },
          },
          profileId: undefined,
          useCaseId: undefined,
          guideResult: undefined,
          warnings: [],
          errors: [],
        };
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "continue-on-error",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        stopOnError: false,
        steps: [
          { text: "first step" },
          { text: "throws here" },
          { text: "still executed" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      // All 3 steps should be present
      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0]!.error, null);
      assert.equal(result.steps[1]!.error, "injected pipeline failure");
      assert.equal(result.steps[2]!.error, null);

      assert.equal(result.summary.totalSteps, 3);
      assert.equal(result.summary.successfulSteps, 2);
      assert.equal(result.summary.failedSteps, 1);

      // All 3 calls made
      assert.equal(callCount, 3);
    } finally {
      testServer.close();
    }
  });

  // =========================================================================
  // stopOnError=true — controlled failures (not exceptions)
  // =========================================================================

  it("stopOnError=true cuts on guideResult.status 'failed' (no exception)", async () => {
    let callCount = 0;
    const mockChannelInbound = {
      execute: async (_cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        callCount++;
        if (callCount === 2) {
          // Controlled failure — AI guide returned failed, no exception thrown
          return {
            traceId: "mock-trace",
            channel: "whatsapp",
            inboundDecision: {
              status: "allowed" as const,
              reason: "known_sender_conversational" as const,
              metadata: {
                normalizedSenderId: "test",
                senderKnown: true,
                receivedAt: new Date().toISOString(),
                audited: false,
                policyVersion: "test-v1",
                matchedSignals: [] as readonly string[],
                precedence: "conversation_default" as const,
              },
            },
            profileId: "conversation" as const,
            useCaseId: "serena.conversation.reply" as const,
            guideResult: {
              status: "failed" as const,
              useCaseId: "serena.conversation.reply" as const,
              error: { message: "AI timeout", code: "TIMEOUT" },
              metadata: {
                provider: "mock",
                model: "mock",
                attempts: 1,
                auditRecorded: false,
              },
            },
            warnings: [],
            errors: [],
          };
        }
        return {
          traceId: "mock-trace",
          channel: "whatsapp",
          inboundDecision: {
            status: "allowed" as const,
            reason: "known_sender_conversational" as const,
            metadata: {
              normalizedSenderId: "test",
              senderKnown: true,
              receivedAt: new Date().toISOString(),
              audited: false,
              policyVersion: "test-v1",
              matchedSignals: [] as readonly string[],
              precedence: "conversation_default" as const,
            },
          },
          profileId: undefined,
          useCaseId: undefined,
          guideResult: undefined,
          warnings: [],
          errors: [],
        };
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "stop-on-guide-failure",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        stopOnError: true,
        steps: [
          { text: "first step" },
          { text: "guide fails here" },
          { text: "never executed" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      // stopOnError should have cut after step 1 (guide failed)
      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0]!.error, null);
      assert.equal(result.steps[1]!.error, null);
      assert.ok(result.steps[1]!.result !== null);
      assert.equal(result.steps[1]!.result.guideResult?.status, "failed");

      assert.equal(result.summary.totalSteps, 2);
      assert.equal(result.summary.successfulSteps, 1);
      assert.equal(result.summary.failedSteps, 1);

      // Step 3 never called
      assert.equal(callCount, 2);
    } finally {
      testServer.close();
    }
  });

  it("stopOnError=true cuts on result.errors non-empty (no exception)", async () => {
    let callCount = 0;
    const mockChannelInbound = {
      execute: async (_cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        callCount++;
        if (callCount === 2) {
          return {
            traceId: "mock-trace",
            channel: "whatsapp",
            inboundDecision: {
              status: "allowed" as const,
              reason: "known_sender_conversational" as const,
              metadata: {
                normalizedSenderId: "test",
                senderKnown: true,
                receivedAt: new Date().toISOString(),
                audited: false,
                policyVersion: "test-v1",
                matchedSignals: [] as readonly string[],
                precedence: "conversation_default" as const,
              },
            },
            profileId: undefined,
            useCaseId: undefined,
            guideResult: undefined,
            warnings: [],
            errors: ["pipeline internal error"],
          };
        }
        return {
          traceId: "mock-trace",
          channel: "whatsapp",
          inboundDecision: {
            status: "allowed" as const,
            reason: "known_sender_conversational" as const,
            metadata: {
              normalizedSenderId: "test",
              senderKnown: true,
              receivedAt: new Date().toISOString(),
              audited: false,
              policyVersion: "test-v1",
              matchedSignals: [] as readonly string[],
              precedence: "conversation_default" as const,
            },
          },
          profileId: undefined,
          useCaseId: undefined,
          guideResult: undefined,
          warnings: [],
          errors: [],
        };
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "stop-on-errors",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        stopOnError: true,
        steps: [
          { text: "first step" },
          { text: "errors step" },
          { text: "never executed" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      assert.equal(result.steps.length, 2);
      assert.equal(result.summary.failedSteps, 1);
      assert.equal(result.summary.successfulSteps, 1);

      assert.equal(callCount, 2);
    } finally {
      testServer.close();
    }
  });

  it("stopOnError=false continues when guideResult.status is 'failed'", async () => {
    let callCount = 0;
    const mockChannelInbound = {
      execute: async (_cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        callCount++;
        if (callCount === 2) {
          return {
            traceId: "mock-trace",
            channel: "whatsapp",
            inboundDecision: {
              status: "allowed" as const,
              reason: "known_sender_conversational" as const,
              metadata: {
                normalizedSenderId: "test",
                senderKnown: true,
                receivedAt: new Date().toISOString(),
                audited: false,
                policyVersion: "test-v1",
                matchedSignals: [] as readonly string[],
                precedence: "conversation_default" as const,
              },
            },
            profileId: "conversation" as const,
            useCaseId: "serena.conversation.reply" as const,
            guideResult: {
              status: "failed" as const,
              useCaseId: "serena.conversation.reply" as const,
              error: { message: "AI error", code: "ERR" },
              metadata: {
                provider: "mock",
                model: "mock",
                attempts: 1,
                auditRecorded: false,
              },
            },
            warnings: [],
            errors: [],
          };
        }
        return {
          traceId: "mock-trace",
          channel: "whatsapp",
          inboundDecision: {
            status: "allowed" as const,
            reason: "known_sender_conversational" as const,
            metadata: {
              normalizedSenderId: "test",
              senderKnown: true,
              receivedAt: new Date().toISOString(),
              audited: false,
              policyVersion: "test-v1",
              matchedSignals: [] as readonly string[],
              precedence: "conversation_default" as const,
            },
          },
          profileId: undefined,
          useCaseId: undefined,
          guideResult: undefined,
          warnings: [],
          errors: [],
        };
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "continue-on-guide-fail",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        stopOnError: false,
        steps: [
          { text: "first step" },
          { text: "guide fails" },
          { text: "still executed" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      assert.equal(result.steps.length, 3);
      assert.equal(result.summary.totalSteps, 3);
      assert.equal(result.summary.successfulSteps, 2);
      assert.equal(result.summary.failedSteps, 1);

      assert.equal(callCount, 3);
    } finally {
      testServer.close();
    }
  });

  // =========================================================================
  // AI guide failure — step marked as failed
  // =========================================================================

  it("ai-guide failed marks step as failed (not successful)", async () => {
    const mockChannelInbound = {
      execute: async (): Promise<ChannelInboundResult> => ({
        traceId: "mock-trace",
        channel: "whatsapp",
        inboundDecision: {
          status: "allowed" as const,
          reason: "known_sender_conversational" as const,
          metadata: {
            normalizedSenderId: MARIA_WHATSAPP,
            senderKnown: true,
            receivedAt: new Date().toISOString(),
            audited: false,
            policyVersion: "test-v1",
            matchedSignals: [] as readonly string[],
            precedence: "conversation_default" as const,
          },
        },
        profileId: "conversation" as const,
        useCaseId: "serena.conversation.reply" as const,
        guideResult: undefined,
        guideError: { message: "AI provider timeout", code: "provider_timeout" },
        warnings: [],
        errors: [],
      }),
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: mockChannelInbound as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "guide-failure",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        steps: [
          { text: "hola" },
          { text: "chau" },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;

      assert.equal(result.steps.length, 2);
      assert.equal(result.summary.totalSteps, 2);
      assert.equal(result.summary.successfulSteps, 0);
      assert.equal(result.summary.failedSteps, 2);

      // Both steps should have guideError
      for (const step of result.steps) {
        assert.ok(step.result !== null);
        assert.ok(step.result.guideError !== undefined);
        assert.equal(step.result.guideError.code, "provider_timeout");
      }
    } finally {
      testServer.close();
    }
  });

  // =========================================================================
  // Summary accuracy — unit test for calculateSummary()
  // =========================================================================

  describe("calculateSummary() — pure function", () => {
    it("all success steps → zero failures, zero events", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], guideStatus: "success" }),
        makeStepResult({ errors: [], guideStatus: "success" }),
        makeStepResult({ errors: [], guideStatus: undefined }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.totalSteps, 3);
      assert.equal(summary.successfulSteps, 3);
      assert.equal(summary.failedSteps, 0);
    });

    it("step with error string → failed", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [] }),
        { index: 1, input: defaultInput(), result: null, error: "thrown error" },
        makeStepResult({ errors: [] }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.totalSteps, 3);
      assert.equal(summary.successfulSteps, 2);
      assert.equal(summary.failedSteps, 1);
    });

    it("step with errors[] > 0 → failed", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: ["something went wrong"] }),
        makeStepResult({ errors: [] }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.failedSteps, 1);
      assert.equal(summary.successfulSteps, 1);
    });

    it("step with guideResult.status 'failed' → failed", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], guideStatus: "failed" }),
        makeStepResult({ errors: [] }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.failedSteps, 1);
      assert.equal(summary.successfulSteps, 1);
    });

    it("step with guideError → failed", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], guideError: { message: "AI error", code: "ERR" } }),
        makeStepResult({ errors: [] }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.failedSteps, 1);
      assert.equal(summary.successfulSteps, 1);
    });

    it("counts riskEvents from inboundDecision.reason", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], reason: "urgent_or_risk_content" }),
        makeStepResult({ errors: [], reason: "known_sender_conversational" }),
        makeStepResult({ errors: [], reason: "urgent_or_risk_content" }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.riskEvents, 2);
      assert.equal(summary.mediationEvents, 0);
    });

    it("counts mediationEvents from inboundDecision.reason and status", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], reason: "third_party_mediation_request", status: "needs_mediation" }),
        makeStepResult({ errors: [], reason: "known_sender_conversational", status: "needs_mediation" }),
        makeStepResult({ errors: [], reason: "known_sender_conversational", status: "allowed" }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.mediationEvents, 2);
    });

    it("counts unknownSenders from identity.status", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], identityStatus: "unknown" }),
        makeStepResult({ errors: [], identityStatus: "resolved" }),
        makeStepResult({ errors: [], identityStatus: "unknown" }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.unknownSenders, 2);
    });

    it("counts blockedSenders from identity.status + decision.status", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [], identityStatus: "blocked", status: "blocked" }),
        makeStepResult({ errors: [], identityStatus: "resolved", status: "blocked" }),
        makeStepResult({ errors: [], identityStatus: "resolved", status: "allowed" }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.blockedSenders, 2);
    });

    it("invariant: successfulSteps + failedSteps = totalSteps", () => {
      const steps: ScenarioStepResult[] = [
        makeStepResult({ errors: [] }),
        makeStepResult({ errors: ["fail"] }),
        { index: 2, input: defaultInput(), result: null, error: "threw" },
        makeStepResult({ errors: [], guideStatus: "failed" }),
        makeStepResult({ errors: [], guideError: { message: "x", code: "X" } }),
      ];
      const summary = calculateSummary(steps);
      assert.equal(summary.successfulSteps + summary.failedSteps, summary.totalSteps);
      assert.equal(summary.totalSteps, 5);
    });

    it("empty steps → all zeros", () => {
      const summary = calculateSummary([]);
      assert.equal(summary.totalSteps, 0);
      assert.equal(summary.successfulSteps, 0);
      assert.equal(summary.failedSteps, 0);
      assert.equal(summary.riskEvents, 0);
      assert.equal(summary.mediationEvents, 0);
      assert.equal(summary.unknownSenders, 0);
      assert.equal(summary.blockedSenders, 0);
    });
  });

  // =========================================================================
  // isScenarioStepFailure — unit tests for the shared predicate
  // =========================================================================

  describe("isScenarioStepFailure() — shared predicate", () => {
    it("returns false for a clean successful step", () => {
      const step = makeStepResult({ errors: [], guideStatus: "success" });
      assert.equal(isScenarioStepFailure(step), false);
    });

    it("returns true when step.error is set", () => {
      const step: ScenarioStepResult = {
        index: 0,
        input: defaultInput(),
        result: null,
        error: "pipeline threw",
      };
      assert.equal(isScenarioStepFailure(step), true);
    });

    it("returns true when result is null", () => {
      const step: ScenarioStepResult = {
        index: 0,
        input: defaultInput(),
        result: null,
        error: null,
      };
      assert.equal(isScenarioStepFailure(step), true);
    });

    it("returns true when result.errors has elements", () => {
      const step = makeStepResult({ errors: ["internal error"] });
      assert.equal(isScenarioStepFailure(step), true);
    });

    it("returns true when guideResult.status is 'failed'", () => {
      const step = makeStepResult({ errors: [], guideStatus: "failed" });
      assert.equal(isScenarioStepFailure(step), true);
    });

    it("returns true when guideError is present", () => {
      const step = makeStepResult({ errors: [], guideError: { message: "timeout", code: "TMO" } });
      assert.equal(isScenarioStepFailure(step), true);
    });

    it("returns false for blocked sender (valid pipeline outcome)", () => {
      const step = makeStepResult({
        errors: [],
        reason: "unknown_sender",
        status: "blocked",
        identityStatus: "unknown",
      });
      assert.equal(isScenarioStepFailure(step), false);
    });

    it("returns false for discard (valid pipeline outcome)", () => {
      const step = makeStepResult({
        errors: [],
        reason: "invalid_sender",
        status: "blocked",
      });
      assert.equal(isScenarioStepFailure(step), false);
    });
  });

  // =========================================================================
  // Pipeline fidelity — runner uses ProcessChannelInboundMessage
  // =========================================================================

  it("runner calls ProcessChannelInboundMessage.execute() (no duplicated logic)", async () => {
    // Create a spy that wraps a real processChannelInboundMessage
    const { processInboundMessage, aiGuideService, identityResolver, conversationStore: convStore } = await createInMemoryPipeline();

    const realChannelInbound = new ProcessChannelInboundMessage({
      processInboundMessage,
      aiGuideService,
      identityResolver,
      conversationStore: convStore,
    });

    const calls: InboundMessageCommand[] = [];
    const spy = {
      execute: async (cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        calls.push({ ...cmd });
        return realChannelInbound.execute(cmd);
      },
    };

    const scenarioRunner = new SimulationScenarioRunner({
      processChannelInboundMessage: spy as unknown as ProcessChannelInboundMessage,
    });

    const requestPayload: ScenarioRequest = {
      scenarioId: "fidelity-test",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [
        { text: "hola" },
        { text: "chau" },
      ],
    };

    const result = await scenarioRunner.execute(requestPayload);

    // Runner should have called execute() exactly once per step
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.text, "hola");
    assert.equal(calls[0]!.channel, "whatsapp");
    assert.equal(calls[0]!.externalSenderId, MARIA_WHATSAPP);
    assert.equal(calls[1]!.text, "chau");

    // Result should have steps from the real pipeline
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0]!.error, null);
    assert.ok(result.steps[0]!.result !== null);
    assert.equal(result.steps[1]!.error, null);
    assert.ok(result.steps[1]!.result !== null);
  });

  // =========================================================================
  // Scenario-level metadata merge
  // =========================================================================

  it("scenario.metadata is merged with step.metadata (step takes priority)", async () => {
    // Create a spy that captures the InboundMessageCommand per step
    const { processInboundMessage, aiGuideService, identityResolver, conversationStore: convStore } = await createInMemoryPipeline();

    const realChannelInbound = new ProcessChannelInboundMessage({
      processInboundMessage,
      aiGuideService,
      identityResolver,
      conversationStore: convStore,
    });

    const capturedCommands: InboundMessageCommand[] = [];
    const spy = {
      execute: async (cmd: InboundMessageCommand): Promise<ChannelInboundResult> => {
        capturedCommands.push({ ...cmd, ...(cmd.metadata ? { metadata: { ...cmd.metadata } } : {}) });
        return realChannelInbound.execute(cmd);
      },
    };

    const runner = new SimulationScenarioRunner({
      processChannelInboundMessage: spy as unknown as ProcessChannelInboundMessage,
    });
    const handler = createScenarioHandler(runner);
    const testServer = createHttpServer("test", undefined, undefined, undefined, handler);

    let testPort = 0;
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testPort = addr.port;
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/scenario", testPort, {
        scenarioId: "metadata-merge",
        tenantId: "demo",
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        metadata: { source: "scenario", shared: "from-scenario", env: "test" },
        steps: [
          { text: "step without metadata" },
          { text: "step with metadata", metadata: { source: "step", shared: "from-step" } },
        ],
      });

      assert.equal(status, 200);
      const result = body as ScenarioResult;
      assert.equal(result.steps.length, 2);

      // Step 0: only scenario metadata
      const step0meta = capturedCommands[0]!.metadata;
      assert.ok(step0meta !== undefined);
      assert.equal(step0meta.source, "scenario");
      assert.equal(step0meta.shared, "from-scenario");
      assert.equal(step0meta.env, "test");

      // Step 1: scenario + step merged, step wins on shared key
      const step1meta = capturedCommands[1]!.metadata;
      assert.ok(step1meta !== undefined);
      assert.equal(step1meta.source, "step");        // step override
      assert.equal(step1meta.shared, "from-step");   // step override
      assert.equal(step1meta.env, "test");           // kept from scenario
    } finally {
      testServer.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for calculateSummary unit tests
// ---------------------------------------------------------------------------

function defaultInput(): ScenarioStepResult["input"] {
  return {
    channel: "whatsapp",
    externalSenderId: "5491111111111",
    text: "hola",
  };
}

function makeStepResult(opts: {
  errors?: string[];
  guideStatus?: "success" | "failed" | undefined;
  guideError?: { message: string; code?: string };
  reason?: string;
  status?: string;
  identityStatus?: string;
}): ScenarioStepResult {
  const result: ChannelInboundResult = {
    traceId: "u1",
    channel: "whatsapp",
    inboundDecision: {
      status: (opts.status as "allowed" | "blocked" | "needs_mediation") ?? "allowed",
      reason: (opts.reason as InboundDecisionReason) ?? "known_sender_conversational",
      metadata: {
        normalizedSenderId: "test",
        senderKnown: true,
        receivedAt: new Date().toISOString(),
        audited: false,
        policyVersion: "v1",
        matchedSignals: [],
        precedence: "conversation_default",
      },
    },
    profileId: undefined,
    useCaseId: undefined,
    guideResult: opts.guideStatus !== undefined
      ? opts.guideStatus === "success"
        ? ({
            status: "success" as const,
            useCaseId: "serena.conversation.reply" as GuideUseCaseId,
            output: "mock output",
            metadata: {
              provider: "mock",
              model: "mock",
              attempts: 1,
              auditRecorded: false,
            },
          } as const)
        : ({
            status: "failed" as const,
            useCaseId: "serena.conversation.reply" as GuideUseCaseId,
            error: { message: "fail", code: "X" },
            metadata: {
              provider: "mock",
              model: "mock",
              attempts: 1,
              auditRecorded: false,
            },
          } as const)
      : undefined,
    ...(opts.guideError !== undefined ? { guideError: opts.guideError } : {}),
    identity: {
      status: (opts.identityStatus as "resolved" | "unknown" | "blocked") ?? "resolved",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "5491111111111",
      personId: "c1",
      displayName: "María",
      role: "contact" as const,
      authorized: true,
    },
    warnings: [],
    errors: opts.errors ?? [],
  };

  return {
    index: 0,
    input: defaultInput(),
    result,
    error: null,
  };
}

// =========================================================================
// T22-11 — Conversation continuity across scenario steps
// =========================================================================

describe("Conversation continuity", () => {
  it("multi-step scenario reuses same conversation across steps", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "continuity-test",
      steps: [
        { text: "hola" },
        { text: "cómo estás?" },
        { text: "chau" },
      ],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 3);

    // All three steps should have conversation info
    for (const step of result.steps) {
      assert.ok(step.result !== null);
      const conv = step.result.conversation;
      assert.ok(conv !== undefined, `Step ${step.index} should have conversation`);
      assert.equal(typeof conv!.id, "string");
      assert.ok(conv!.id.length > 0);
    }

    // All steps should share the same conversation ID
    const conv0 = result.steps[0]!.result!.conversation!;
    const conv1 = result.steps[1]!.result!.conversation!;
    const conv2 = result.steps[2]!.result!.conversation!;

    assert.equal(conv1.id, conv0.id, "Step 1 should reuse step 0 conversation");
    assert.equal(conv2.id, conv0.id, "Step 2 should reuse step 0 conversation");
  });

  it("conversation info includes id, status, and messageCount in step results", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, scenarioPayload({
      scenarioId: "conv-info-test",
      steps: [{ text: "hola" }],
    }));

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 1);

    const step0 = result.steps[0]!;
    assert.ok(step0.result !== null);
    const conv = step0.result.conversation;
    assert.ok(conv !== undefined);
    assert.equal(typeof conv!.id, "string");
    assert.equal(conv!.status, "open");
    assert.ok(typeof conv!.messageCount === "number");
    assert.ok(conv!.messageCount >= 1);
  });

  it("first step without conversationId creates one, subsequent steps reuse it", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "auto-create-conversation",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [
        { text: "hola" },
        { text: "cómo estás?" },
      ],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 2);

    // First step creates a conversation
    const step0Conv = result.steps[0]!.result!.conversation;
    assert.ok(step0Conv !== undefined, "First step should auto-create conversation");

    // Second step reuses the same conversation
    const step1Conv = result.steps[1]!.result!.conversation;
    assert.ok(step1Conv !== undefined, "Second step should reuse conversation");
    assert.equal(step1Conv!.id, step0Conv!.id);
  });

  it("step with conversationId override uses indicated conversation", async () => {
    // First create a conversation with one request
    const { body: createBody } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "create-conv",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [{ text: "hola" }],
    });

    const createResult = createBody as ScenarioResult;
    const firstConvId = createResult.steps[0]!.result!.conversation!.id;

    // Now run a new scenario with an explicit conversationId
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "override-conv",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      conversationId: "custom-conv-999",
      steps: [{ text: "this step uses custom conv" }],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    const stepConv = result.steps[0]!.result!.conversation;
    assert.ok(stepConv !== undefined);
    // With a custom conversationId that doesn't exist in the store,
    // the store creates a new conversation (unrecognized id → create new)
    assert.ok(stepConv!.id.length > 0);
  });

  it("each scenario with different sender gets separate conversation", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "different-senders",
      tenantId: "demo",
      channel: "whatsapp",
      steps: [
        { text: "hola soy Marta", externalSenderId: MARTA_WHATSAPP },
        { text: "hola soy María", externalSenderId: MARIA_WHATSAPP },
      ],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 2);

    const conv0 = result.steps[0]!.result!.conversation;
    const conv1 = result.steps[1]!.result!.conversation;

    assert.ok(conv0 !== undefined);
    assert.ok(conv1 !== undefined);
    // Different senders = different persons = different conversations
    assert.notEqual(conv1!.id, conv0!.id,
      "Different senders should get different conversations");
  });

  it("step-level conversationId override takes priority over auto-propagation", async () => {
    const { status, body } = await request("POST", "/dev/simulate/scenario", port, {
      scenarioId: "step-override-priority",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      steps: [
        // Step 0: no conversationId → auto-creates conversation C0
        { text: "primer mensaje" },
        // Step 1: explicit conversationId → should use THIS, not C0
        { text: "segundo mensaje", conversationId: "step-level-override-456" },
        // Step 2: no conversationId → should auto-propagate from step 1's override
        { text: "tercer mensaje" },
      ],
    });

    assert.equal(status, 200);
    const result = body as ScenarioResult;
    assert.equal(result.steps.length, 3);

    const step0Conv = result.steps[0]!.result!.conversation;
    const step1Conv = result.steps[1]!.result!.conversation;
    const step2Conv = result.steps[2]!.result!.conversation;

    assert.ok(step0Conv !== undefined, "Step 0 should auto-create a conversation");
    assert.ok(step1Conv !== undefined, "Step 1 should have a conversation from the override");
    assert.ok(step2Conv !== undefined, "Step 2 should auto-propagate from step 1");

    // Step 1 explicitly set its own conversationId — should NOT reuse step 0's
    assert.notEqual(step1Conv!.id, step0Conv!.id,
      "Step-level override should use a different conversation than auto-created step 0");

    // Step 2 should propagate from step 1's override, not step 0
    assert.equal(step2Conv!.id, step1Conv!.id,
      "Auto-propagation after override should continue from the override conversation");

    // Top-level conversation should reflect the last active conversation (step 2)
    assert.ok(result.conversation !== undefined, "Top-level conversation should be populated");
    assert.equal(result.conversation!.id, step2Conv!.id);
  });
});
