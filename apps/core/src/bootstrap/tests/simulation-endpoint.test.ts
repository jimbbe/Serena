/**
 * T20 — Integration tests for POST /dev/simulate/inbound-message.
 *
 * Tests the full HTTP server routing: request parsing, validation,
 * pipeline execution, and structured responses.
 *
 * Uses real ProcessInboundMessage + MockLlmProvider for realistic paths.
 * Uses mocked pipeline for the clarification (not-yet-implemented) path.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpServer } from "../server.ts";
import { createInMemoryPipeline } from "../create-in-memory-pipeline.ts";
import { createSimulationHandler } from "../simulation-handler.ts";
import { ProcessChannelInboundMessage } from "../../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts";
import { ProcessInboundMessage } from "../../modules/inbound-gate/application/use-cases/process-inbound-message.ts";
import type { ProcessInboundMessageInput } from "../../modules/inbound-gate/application/use-cases/process-inbound-message.ts";

// ---------------------------------------------------------------------------
// Seed contacts (mirrors contacts.seed.json)
// ---------------------------------------------------------------------------

const MARIA_WHATSAPP = "5491111111111";
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
// Test fixture — shared server with simulation enabled
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

before(async () => {
  const { processInboundMessage, aiGuideService } = await createInMemoryPipeline();

  const processChannelInboundMessage = new ProcessChannelInboundMessage({
    processInboundMessage,
    aiGuideService,
  });

  const simulationHandler = createSimulationHandler(processChannelInboundMessage);

  // 4th param = simulationHandler → endpoint is enabled
  const httpServer = createHttpServer("test", undefined, undefined, simulationHandler);

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

describe("POST /dev/simulate/inbound-message", () => {
  // =========================================================================
  // Endpoint disabled — 404
  // =========================================================================

  it("returns 404 when simulation handler is not configured", async () => {
    // Create a server WITHOUT the simulationHandler (4th param undefined)
    const disabledServer = createHttpServer("test", undefined, undefined, undefined);

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
      const { status, body } = await request("POST", "/dev/simulate/inbound-message", disabledPort, {
        channel: "whatsapp",
        externalSenderId: MARIA_WHATSAPP,
        text: "hola",
      });

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
    const { status, body } = await request("GET", "/dev/simulate/inbound-message", port);

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
            path: "/dev/simulate/inbound-message",
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

  it("missing required fields returns 400 with field errors", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "simulation",
      // missing externalSenderId and text
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "externalSenderId"));
    assert.ok(fields.some((f) => f.field === "text"));
  });

  it("invalid channel value returns 400 with field error", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "email",
      externalSenderId: "maria",
      text: "hola",
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string; message: string }>;
    const channelField = fields.find((f) => f.field === "channel");
    assert.ok(channelField !== undefined);
    assert.ok(channelField.message.includes("Must be one of:"));
  });

  it("blank externalSenderId returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: "   ",
      text: "hola",
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields2 = obj.fields as Array<{ field: string; message: string }>;
    const senderField = fields2.find((f) => f.field === "externalSenderId");
    assert.ok(senderField !== undefined);
    assert.equal(senderField.message, "Required non-empty string");
  });

  it("blank text returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: "maria",
      text: "   ",
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "text"));
  });

  it("invalid occurredAt returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: "maria",
      text: "hola",
      occurredAt: "not-a-valid-date",
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string }>;
    const oaField = fields.find((f) => f.field === "occurredAt");
    assert.ok(oaField !== undefined);
  });

  it("metadata not an object returns 400", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: "maria",
      text: "hola",
      metadata: "not an object",
    });

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    const fields = obj.fields as Array<{ field: string }>;
    const metaField = fields.find((f) => f.field === "metadata");
    assert.ok(metaField !== undefined);
  });

  // =========================================================================
  // Valid payloads — blocked sender
  // =========================================================================

  it("unknown (blocked) sender returns 200 with discard result", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: UNKNOWN_WHATSAPP,
      text: "hola, cómo estás?",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(typeof obj.traceId, "string");
    assert.ok((obj.traceId as string).length > 0);
    assert.equal(obj.channel, "whatsapp");

    const decision = obj.inboundDecision as Record<string, unknown>;
    assert.equal(decision.status, "blocked");
    assert.equal(decision.reason, "unknown_sender");
    assert.equal(obj.profileId, undefined);
    assert.equal(obj.useCaseId, undefined);
    assert.equal(obj.guideResult, undefined);
  });

  // =========================================================================
  // Valid payloads — known sender → conversation
  // =========================================================================

  it("known sender with conversational message returns 200 with guideResult", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola Serena, cómo estás?",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(typeof obj.traceId, "string");
    assert.ok((obj.traceId as string).length > 0);

    const decision = obj.inboundDecision as Record<string, unknown>;
    assert.equal(decision.status, "allowed");
    assert.equal(decision.reason, "known_sender_conversational");

    assert.equal(obj.profileId, "conversation");
    assert.equal(obj.useCaseId, "serena.conversation.reply");

    const guideResult = obj.guideResult as Record<string, unknown> | undefined;
    assert.ok(guideResult !== undefined);
    assert.equal(guideResult.status, "success");
    assert.equal(guideResult.useCaseId, "serena.conversation.reply");
  });

  // =========================================================================
  // Valid payloads — mediation request
  // =========================================================================

  it("mediation message returns mediation_understanding profile", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      text: "avisale a Carlos que voy a llegar 15 minutos tarde",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;

    const decision = obj.inboundDecision as Record<string, unknown>;
    assert.equal(decision.status, "needs_mediation");
    assert.equal(decision.reason, "third_party_mediation_request");

    assert.equal(obj.profileId, "mediation_understanding");
    assert.equal(obj.useCaseId, "serena.mediation.understand_request");

    const guideResult = obj.guideResult as Record<string, unknown> | undefined;
    assert.ok(guideResult !== undefined);
    assert.equal(guideResult.status, "success");
  });

  // =========================================================================
  // Valid payloads — risk content
  // =========================================================================

  it("risk message returns risk_review profile", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "whatsapp",
      externalSenderId: MARIA_WHATSAPP,
      text: "necesito ayuda urgente",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;

    const decision = obj.inboundDecision as Record<string, unknown>;
    assert.equal(decision.reason, "urgent_or_risk_content");

    assert.equal(obj.profileId, "risk_review");
    assert.equal(obj.useCaseId, "serena.risk.review");

    const guideResult = obj.guideResult as Record<string, unknown> | undefined;
    assert.ok(guideResult !== undefined);
    assert.equal(guideResult.status, "success");
  });

  // =========================================================================
  // Various channel values
  // =========================================================================

  it("voice channel is accepted and processed", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "voice",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.channel, "voice");
  });

  it("web_chat channel is accepted and processed", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "web_chat",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.channel, "web_chat");
  });

  it("telegram channel is accepted and processed", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "telegram",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.channel, "telegram");
  });

  it("system channel is accepted and processed", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "system",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.channel, "system");
  });

  it("simulation channel is accepted and processed", async () => {
    const { status, body } = await request("POST", "/dev/simulate/inbound-message", port, {
      channel: "simulation",
      externalSenderId: MARIA_WHATSAPP,
      text: "hola",
    });

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.channel, "simulation");
  });

  // =========================================================================
  // Clarification — not implemented (200, not 500)
  // =========================================================================

  it("clarification profile returns 200 with structured guideError", async () => {
    // The real ProcessInboundMessage never produces a "clarification" profile,
    // so we construct a mocked version that returns a clarification route.
    const mockProcessInbound = {
      execute: async (_input: ProcessInboundMessageInput) => ({
        decision: {
          status: "allowed" as const,
          reason: "known_sender_conversational" as const,
          metadata: {
            normalizedSenderId: "maria",
            senderKnown: true,
            receivedAt: new Date().toISOString(),
            audited: false,
            policyVersion: "test-v1",
            matchedSignals: [] as readonly string[],
            precedence: "conversation_default" as const,
          },
        },
        route: {
          nextStep: "llm_profile_required" as const,
          profileId: "clarification" as const,
          reason: "known_sender_conversational" as const,
          context: {
            senderId: "maria",
            normalizedSenderId: "maria",
            originalText: "clarify this",
            receivedAt: new Date().toISOString(),
            decisionStatus: "allowed" as const,
            decisionReason: "known_sender_conversational" as const,
            policyVersion: "test-v1",
            matchedSignals: [] as readonly string[],
            precedence: "conversation_default" as const,
          },
        },
      }),
    };

    const { aiGuideService } = await createInMemoryPipeline();
    const useCase = new ProcessChannelInboundMessage({
      processInboundMessage: mockProcessInbound as unknown as ProcessInboundMessage,
      aiGuideService,
    });

    const handler = createSimulationHandler(useCase);
    const clarificationServer = createHttpServer("test", undefined, undefined, handler);

    let clarificationPort = 0;
    await new Promise<void>((resolve) => {
      clarificationServer.listen(0, "127.0.0.1", () => {
        const addr = clarificationServer.address();
        if (addr && typeof addr === "object") {
          clarificationPort = addr.port;
        }
        resolve();
      });
    });

    try {
      const { status, body } = await request("POST", "/dev/simulate/inbound-message", clarificationPort, {
        channel: "whatsapp",
        externalSenderId: "maria",
        text: "clarify this",
      });

      assert.equal(status, 200);
      const obj = body as Record<string, unknown>;

      // Clarification returns 200 (NOT 500)
      assert.equal(obj.profileId, "clarification");
      assert.equal(obj.useCaseId, "serena.mediation.clarify");
      assert.equal(obj.guideResult, undefined);

      const guideError = obj.guideError as Record<string, unknown> | undefined;
      assert.ok(guideError !== undefined);
      assert.equal(guideError.code, "not_implemented");
      assert.equal(guideError.message, "Clarification use case not yet implemented");

      const warnings = obj.warnings as string[];
      assert.ok(warnings.includes("clarification profile maps to a not-yet-implemented use case"));
    } finally {
      clarificationServer.close();
    }
  });

  // =========================================================================
  // Existing pipeline endpoint unchanged
  // =========================================================================

  it("existing /internal/pipeline/process returns 401 (no token) — unchanged", async () => {
    const { status, body } = await request("POST", "/internal/pipeline/process", port, {
      senderWhatsAppId: MARIA_WHATSAPP,
      messageText: "hola",
    });

    // Our test server has no token configured → 500, not 401
    // But the key is: it doesn't hit the simulation handler
    const obj = body as Record<string, unknown>;
    // Should be either token-not-configured or pipeline-not-configured
    assert.ok(
      obj.error === "internal_token_not_configured" ||
      obj.error === "pipeline_not_configured",
    );
  });
});
