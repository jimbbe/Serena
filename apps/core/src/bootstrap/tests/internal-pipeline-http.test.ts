/**
 * T16 / T17B — HTTP integration tests for POST /internal/pipeline/process.
 *
 * Tests the full server routing, request/response serialisation,
 * session continuity across multiple HTTP requests, auth token
 * validation, and messageId idempotency.
 *
 * All in-memory — no external infrastructure.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpServer } from "../server.ts";
import { createInMemoryPipeline } from "../create-in-memory-pipeline.ts";
import { createPipelineHandler } from "../internal-pipeline-handler.ts";

// ---------------------------------------------------------------------------
// Seed contacts (mirrors contacts.seed.json)
// ---------------------------------------------------------------------------

const MARIA_WHATSAPP = "5491111111111";
const CARLOS_WHATSAPP = "5492222222222";
const UNKNOWN_WHATSAPP = "5499999999999";

const TEST_TOKEN = "test-token";

// ---------------------------------------------------------------------------
// HTTP request helper (updated: optional headers)
// ---------------------------------------------------------------------------

async function request(
  method: string,
  path: string,
  port: number,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {
      ...extraHeaders,
    };

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

// Convenience: send a pipeline request with the test token and a unique messageId
let messageIdCounter = 0;
function pipelineRequest(
  port: number,
  body: unknown,
  token?: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const finalHeaders: Record<string, string> = { ...headers };
  if (token !== undefined) {
    finalHeaders["x-serena-internal-token"] = token;
  }
  return request("POST", "/internal/pipeline/process", port, body, finalHeaders);
}

// ---------------------------------------------------------------------------
// Test fixture — shared server + orchestrator for session continuity
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

before(async () => {
  const { orchestrator, processedMessageStore } = await createInMemoryPipeline();
  const pipelineHandler = createPipelineHandler(orchestrator, processedMessageStore);
  const httpServer = createHttpServer("test", pipelineHandler, TEST_TOKEN);

  // Listen on port 0 to get a random available port
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
// Helper: generate unique messageIds
// ---------------------------------------------------------------------------

function uid(prefix = "msg"): string {
  return `${prefix}-${++messageIdCounter}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HTTP server — routing and pipeline", () => {
  // =========================================================================
  // HEALTH
  // =========================================================================

  it("GET /health returns 200 with expected body", async () => {
    const { status, body } = await request("GET", "/health", port);

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.status, "ok");
    assert.equal(obj.service, "serena-core");
    assert.equal(obj.environment, "test");
  });

  // =========================================================================
  // AUTH — T17B
  // =========================================================================

  it("POST /internal/pipeline/process without token returns 401", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
      undefined, // no token
    );

    assert.equal(status, 401);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "missing_token");
  });

  it("POST /internal/pipeline/process with wrong token returns 403", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
      "wrong-token",
    );

    assert.equal(status, 403);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_token");
  });

  it("POST /internal/pipeline/process with valid token returns 200", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola Serena" },
      TEST_TOKEN,
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "conversation_pending");
  });

  it("token check happens before body parsing — no token + bad JSON → 401 not 400", async () => {
    const { status, body } = await new Promise<{ status: number; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/internal/pipeline/process",
            method: "POST",
            headers: { "content-type": "application/json" },
            // No X-Serena-Internal-Token header
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              const raw = Buffer.concat(chunks).toString("utf-8");
              resolve({
                status: res.statusCode ?? 0,
                body: JSON.parse(raw),
              });
            });
          },
        );
        req.on("error", reject);
        req.write("esto no es json");
        req.end();
      },
    );

    assert.equal(status, 401);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "missing_token");
  });

  // Test misconfigured token (no token env) — create a separate server
  it("POST /internal/pipeline/process returns 500 when SERENA_INTERNAL_TOKEN is not configured", async () => {
    // Create a fresh server with no token
    const noTokenServer = createHttpServer("test", undefined, undefined);
    let noTokenPort = 0;

    await new Promise<void>((resolve) => {
      noTokenServer.listen(0, "127.0.0.1", () => {
        const addr = noTokenServer.address();
        if (addr && typeof addr === "object") {
          noTokenPort = addr.port;
        }
        resolve();
      });
    });

    try {
      const { status, body } = await request(
        "POST",
        "/internal/pipeline/process",
        noTokenPort,
        { messageId: "msg-1", senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
        { "x-serena-internal-token": "some-token" },
      );

      assert.equal(status, 500);
      const obj = body as Record<string, unknown>;
      assert.equal(obj.error, "internal_token_not_configured");
    } finally {
      noTokenServer.close();
    }
  });

  // =========================================================================
  // IDEMPOTENCY — T17B
  // =========================================================================

  it("payload without messageId returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "messageId"));
  });

  it("payload with empty messageId returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: "", senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "messageId"));
  });

  it("payload with whitespace-only messageId returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: "   ", senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola" },
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "messageId"));
  });

  it("two requests with same messageId: first executes, second returns duplicate=true", async () => {
    const duplicatedId = uid("dup");

    const first = await pipelineRequest(
      port,
      { messageId: duplicatedId, senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola Serena" },
      TEST_TOKEN,
    );

    assert.equal(first.status, 200);
    const firstObj = first.body as Record<string, unknown>;
    assert.equal(firstObj.type, "conversation_pending");
    assert.equal(firstObj.duplicate, undefined);

    const second = await pipelineRequest(
      port,
      { messageId: duplicatedId, senderWhatsAppId: CARLOS_WHATSAPP, messageText: "algo distinto" },
      TEST_TOKEN,
    );

    assert.equal(second.status, 200);
    const secondObj = second.body as Record<string, unknown>;
    assert.equal(secondObj.duplicate, true);
    // Should return the cached result from first request, not re-execute
    assert.equal(secondObj.type, "conversation_pending");
    assert.equal(secondObj.senderId, MARIA_WHATSAPP);
  });

  it("different messageIds execute pipeline independently", async () => {
    const first = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola Serena" },
      TEST_TOKEN,
    );

    assert.equal(first.status, 200);
    const firstObj = first.body as Record<string, unknown>;
    assert.equal(firstObj.type, "conversation_pending");
    assert.equal(firstObj.duplicate, undefined);

    const second = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: UNKNOWN_WHATSAPP, messageText: "hola" },
      TEST_TOKEN,
    );

    assert.equal(second.status, 200);
    const secondObj = second.body as Record<string, unknown>;
    assert.equal(secondObj.type, "discard");
    assert.equal(secondObj.duplicate, undefined);
  });

  // =========================================================================
  // VALIDATION — existing T16 tests adapted for T17B
  // =========================================================================

  it("POST /internal/pipeline/process with invalid JSON returns 400", async () => {
    const { status, body } = await new Promise<{ status: number; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/internal/pipeline/process",
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-serena-internal-token": TEST_TOKEN,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              const raw = Buffer.concat(chunks).toString("utf-8");
              resolve({
                status: res.statusCode ?? 0,
                body: JSON.parse(raw),
              });
            });
          },
        );
        req.on("error", reject);
        req.write("esto no es json");
        req.end();
      },
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_json");
  });

  it("POST /internal/pipeline/process with missing senderWhatsAppId returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), messageText: "hola" },
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "senderWhatsAppId"));
  });

  it("POST /internal/pipeline/process with missing messageText returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP },
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "messageText"));
  });

  it("POST /internal/pipeline/process with unknown sender returns 200 discard", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: UNKNOWN_WHATSAPP, messageText: "hola, cómo estás?", receivedAt: new Date().toISOString() },
      TEST_TOKEN,
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "discard");
    assert.equal(obj.reason, "unknown_sender");
  });

  it("POST /internal/pipeline/process with conversational message returns conversation_pending", async () => {
    const { status, body } = await pipelineRequest(
      port,
      { messageId: uid(), senderWhatsAppId: MARIA_WHATSAPP, messageText: "hola Serena", receivedAt: new Date().toISOString() },
      TEST_TOKEN,
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "conversation_pending");
    assert.equal(obj.senderId, MARIA_WHATSAPP);
  });

  it("full mediation round-trip: María starts, Carlos replies → session continuity", async () => {
    // Step 1: María sends a mediation request
    const startResp = await pipelineRequest(
      port,
      {
        messageId: uid("start"),
        senderWhatsAppId: MARIA_WHATSAPP,
        messageText: "avisale a Carlos que llego 15 minutos tarde",
        receivedAt: new Date().toISOString(),
      },
      TEST_TOKEN,
    );

    assert.equal(startResp.status, 200);
    const start = startResp.body as Record<string, unknown>;
    assert.equal(start.type, "mediation_started");
    assert.equal(start.requesterId, MARIA_WHATSAPP);
    assert.equal(start.requesterDisplayName, "María");
    assert.equal(start.recipientId, CARLOS_WHATSAPP);
    assert.equal(start.recipientDisplayName, "Carlos");
    assert.ok(typeof start.rewordedText === "string");
    assert.ok((start.rewordedText as string).includes("Serena"));
    assert.ok(typeof start.sessionId === "string");
    const sessionId = start.sessionId as string;

    // Step 2: Carlos replies — should find the active session created above
    const replyResp = await pipelineRequest(
      port,
      {
        messageId: uid("reply"),
        senderWhatsAppId: CARLOS_WHATSAPP,
        messageText: "dale, no hay problema",
        receivedAt: new Date().toISOString(),
      },
      TEST_TOKEN,
    );

    assert.equal(replyResp.status, 200);
    const reply = replyResp.body as Record<string, unknown>;
    assert.equal(reply.type, "mediation_reply_recorded");
    assert.equal(reply.fromParticipantId, CARLOS_WHATSAPP);
    assert.equal(reply.fromDisplayName, "Carlos");
    assert.equal(reply.toParticipantId, MARIA_WHATSAPP);
    assert.equal(reply.toDisplayName, "María");
    assert.equal(reply.sessionId, sessionId);
    assert.ok(typeof reply.rewordedText === "string");
  });

  // =========================================================================
  // ROUTING — no token needed for non-pipeline routes
  // =========================================================================

  it("GET /nonexistent returns 404", async () => {
    const { status, body } = await request("GET", "/nonexistent", port);

    assert.equal(status, 404);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "not_found");
  });

  it("GET /internal/pipeline/process without token returns 401", async () => {
    const { status, body } = await request("GET", "/internal/pipeline/process", port);

    assert.equal(status, 401);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "missing_token");
  });

  it("GET /internal/pipeline/process with valid token returns 405", async () => {
    const { status, body } = await request(
      "GET",
      "/internal/pipeline/process",
      port,
      undefined,
      { "x-serena-internal-token": TEST_TOKEN },
    );

    assert.equal(status, 405);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "method_not_allowed");
  });

  it("POST /unknown-route returns 404", async () => {
    const { status, body } = await request("POST", "/unknown-route", port, { foo: "bar" });

    assert.equal(status, 404);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "not_found");
  });

  // =========================================================================
  // VALIDATION — remaining T16 tests adapted for T17B
  // =========================================================================

  it("POST /internal/pipeline/process with empty JSON object returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      {},
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
  });

  it("POST /internal/pipeline/process accepts 'text' as alias for 'messageText'", async () => {
    const { status, body } = await pipelineRequest(
      port,
      {
        messageId: uid(),
        senderWhatsAppId: "5493333333333", // Juan
        text: "hola Serena",
        receivedAt: new Date().toISOString(),
      },
      TEST_TOKEN,
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "conversation_pending");
    assert.equal(obj.senderId, "5493333333333");
  });

  it("POST /internal/pipeline/process with array body returns 400", async () => {
    const { status, body } = await pipelineRequest(
      port,
      [1, 2, 3],
      TEST_TOKEN,
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
  });

  it("POST /internal/pipeline/process with risk message returns risk_review_required", async () => {
    const { status, body } = await pipelineRequest(
      port,
      {
        messageId: uid(),
        senderWhatsAppId: MARIA_WHATSAPP,
        messageText: "necesito ayuda urgente",
        receivedAt: new Date().toISOString(),
      },
      TEST_TOKEN,
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "risk_review_required");
    assert.equal(obj.senderId, MARIA_WHATSAPP);
  });
});
