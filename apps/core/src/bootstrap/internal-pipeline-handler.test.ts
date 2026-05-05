/**
 * T30A — Strict UTC timestamp validation tests.
 *
 * Validates that receivedAt enforces strict ISO 8601 UTC timestamps
 * with 'Z' suffix only. Tests drive through the HTTP handler since
 * validatePipelineInput is module-private.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpServer } from "./server.ts";
import { createInMemoryPipeline } from "./create-in-memory-pipeline.ts";
import { createPipelineHandler } from "./internal-pipeline-handler.ts";

const TEST_TOKEN = "test-token";

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

async function post(
  port: number,
  body: unknown,
  token: string = TEST_TOKEN,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path: "/internal/pipeline/process",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data).toString(),
        "x-serena-internal-token": token,
      },
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

    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Seed contact — used as valid sender
// ---------------------------------------------------------------------------

const MARIA_WHATSAPP = "5491111111111";

let messageIdCounter = 0;
function uid(prefix = "msg"): string {
  return `${prefix}-${++messageIdCounter}`;
}

// ---------------------------------------------------------------------------
// Test setup — shared server
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

before(async () => {
  const { orchestrator, processedMessageStore } = await createInMemoryPipeline();
  const pipelineHandler = createPipelineHandler(orchestrator, processedMessageStore);
  const httpServer = createHttpServer("test", pipelineHandler, TEST_TOKEN);

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
// Helpers
// ---------------------------------------------------------------------------

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    messageId: uid(),
    senderWhatsAppId: MARIA_WHATSAPP,
    messageText: "hola Serena",
    ...overrides,
  };
}

function assertInvalidReceivedAt(body: unknown): void {
  const obj = body as Record<string, unknown>;
  assert.equal(obj.error, "invalid_payload", "Expected error: 'invalid_payload'");
  const fields = obj.fields as Array<{ field: string; message: string }>;
  assert.ok(Array.isArray(fields), "Expected fields array in response");
  const receivedAtError = fields.find((f) => f.field === "receivedAt");
  assert.ok(receivedAtError, "Expected a validation error for field 'receivedAt'");
  assert.ok(
    receivedAtError!.message.includes("valid ISO 8601 UTC"),
    `Error message should contain 'valid ISO 8601 UTC', got: ${receivedAtError!.message}`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("receivedAt — strict UTC timestamp validation", () => {
  it("accepts 2026-05-05T12:34:56Z (seconds precision, Z suffix)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026-05-05T12:34:56Z" }),
    );

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    const obj = body as Record<string, unknown>;
    assert.ok(obj.type !== undefined, "Expected a pipeline result type");
  });

  it("accepts 2026-05-05T12:34:56.789Z (milliseconds precision, Z suffix)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026-05-05T12:34:56.789Z" }),
    );

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    const obj = body as Record<string, unknown>;
    assert.ok(obj.type !== undefined, "Expected a pipeline result type");
  });

  it("rejects May 2 2026 (English locale, not ISO 8601)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "May 2 2026" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });

  it("rejects 2026/05/02 (slashes, not ISO 8601)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026/05/02" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });

  it("rejects 2026-05-05T12:34:56 (no timezone)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026-05-05T12:34:56" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });

  it("rejects 2026-02-31T00:00:00.000Z (impossible date)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026-02-31T00:00:00.000Z" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });

  it("missing receivedAt does not fail — pipeline processes with server time", async () => {
    const { status, body } = await post(
      port,
      validPayload(), // no receivedAt at all
    );

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    const obj = body as Record<string, unknown>;
    assert.ok(obj.type !== undefined, "Expected a pipeline result type");
  });

  it("rejects receivedAt with timezone offset (+03:00)", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "2026-05-05T12:34:56+03:00" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });

  it("rejects empty string receivedAt", async () => {
    const { status, body } = await post(
      port,
      validPayload({ receivedAt: "" }),
    );

    assert.equal(status, 400);
    assertInvalidReceivedAt(body);
  });
});
