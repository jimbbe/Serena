/**
 * T16 — HTTP integration tests for POST /internal/pipeline/process.
 *
 * Tests the full server routing, request/response serialisation,
 * and session continuity across multiple HTTP requests.
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

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (data) {
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
// Test fixture — shared server + orchestrator for session continuity
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

before(async () => {
  const { orchestrator } = await createInMemoryPipeline();
  const pipelineHandler = createPipelineHandler(orchestrator);
  const httpServer = createHttpServer("test", pipelineHandler);

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
// Tests
// ---------------------------------------------------------------------------

describe("HTTP server — routing and pipeline", () => {
  // 1. GET /health
  it("GET /health returns 200 with expected body", async () => {
    const { status, body } = await request("GET", "/health", port);

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.status, "ok");
    assert.equal(obj.service, "serena-core");
    assert.equal(obj.environment, "test");
  });

  // 2. Invalid JSON → 400
  it("POST /internal/pipeline/process with invalid JSON returns 400", async () => {
    // We need to send non-JSON raw data
    const { status, body } = await new Promise<{ status: number; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/internal/pipeline/process",
            method: "POST",
            headers: { "content-type": "application/json" },
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

  // 3. Missing required field → 400
  it("POST /internal/pipeline/process with missing senderWhatsAppId returns 400", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      { messageText: "hola" },
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "senderWhatsAppId"));
  });

  // 4. Missing messageText → 400
  it("POST /internal/pipeline/process with missing messageText returns 400", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      { senderWhatsAppId: MARIA_WHATSAPP },
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
    const fields = obj.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "messageText"));
  });

  // 5. Unknown sender → 200 with discard
  it("POST /internal/pipeline/process with unknown sender returns 200 discard", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: UNKNOWN_WHATSAPP,
        messageText: "hola, cómo estás?",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "discard");
    assert.equal(obj.reason, "unknown_sender");
  });

  // 6. Conversational message → conversation_pending
  it("POST /internal/pipeline/process with conversational message returns conversation_pending", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: MARIA_WHATSAPP,
        messageText: "hola Serena",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "conversation_pending");
    assert.equal(obj.senderId, MARIA_WHATSAPP);
  });

  // 7. Valid mediation request → mediation_started
  it("POST /internal/pipeline/process with mediation request returns mediation_started", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: MARIA_WHATSAPP,
        messageText: "avisale a Carlos que llego 15 minutos tarde",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "mediation_started");
    assert.equal(obj.requesterId, MARIA_WHATSAPP);
    assert.equal(obj.requesterDisplayName, "María");
    assert.equal(obj.recipientId, CARLOS_WHATSAPP);
    assert.equal(obj.recipientDisplayName, "Carlos");
    assert.ok(typeof obj.rewordedText === "string");
    assert.ok((obj.rewordedText as string).includes("Serena"));
    assert.ok(typeof obj.sessionId === "string");
  });

  // 8. Second request — recipient reply finds active session
  it("second request from recipient finds active session → mediation_reply_recorded", async () => {
    // Carlos replies — the previous test started a session awaiting Carlos
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: CARLOS_WHATSAPP,
        messageText: "dale, no hay problema",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "mediation_reply_recorded");
    assert.equal(obj.fromParticipantId, CARLOS_WHATSAPP);
    assert.equal(obj.fromDisplayName, "Carlos");
    assert.equal(obj.toParticipantId, MARIA_WHATSAPP);
    assert.equal(obj.toDisplayName, "María");
    assert.ok(typeof obj.rewordedText === "string");
    assert.ok(typeof obj.sessionId === "string");
  });

  // 9. Non-existent route → 404
  it("GET /nonexistent returns 404", async () => {
    const { status, body } = await request("GET", "/nonexistent", port);

    assert.equal(status, 404);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "not_found");
  });

  // 10. Wrong method on pipeline endpoint → 405
  it("GET /internal/pipeline/process returns 405", async () => {
    const { status, body } = await request(
      "GET",
      "/internal/pipeline/process",
      port,
    );

    assert.equal(status, 405);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "method_not_allowed");
  });

  // 11. POST to unknown route → 404
  it("POST /unknown-route returns 404", async () => {
    const { status, body } = await request("POST", "/unknown-route", port, {
      foo: "bar",
    });

    assert.equal(status, 404);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "not_found");
  });

  // 12. Empty body object → 400 (missing required fields)
  it("POST /internal/pipeline/process with empty JSON object returns 400", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {},
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
  });

  // 13. "text" alias field works
  it("POST /internal/pipeline/process accepts 'text' as alias for 'messageText'", async () => {
    // Use Juan — no active session, so conversational message stays conversation_pending
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: "5493333333333", // Juan
        text: "hola Serena",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "conversation_pending");
    assert.equal(obj.senderId, "5493333333333");
  });

  // 14. Body that is not an object → 400
  it("POST /internal/pipeline/process with array body returns 400", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      [1, 2, 3],
    );

    assert.equal(status, 400);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.error, "invalid_payload");
  });

  // 15. Risk/urgent message → risk_review_required
  it("POST /internal/pipeline/process with risk message returns risk_review_required", async () => {
    const { status, body } = await request(
      "POST",
      "/internal/pipeline/process",
      port,
      {
        senderWhatsAppId: MARIA_WHATSAPP,
        messageText: "necesito ayuda urgente",
        receivedAt: new Date().toISOString(),
      },
    );

    assert.equal(status, 200);
    const obj = body as Record<string, unknown>;
    assert.equal(obj.type, "risk_review_required");
    assert.equal(obj.senderId, MARIA_WHATSAPP);
  });
});
