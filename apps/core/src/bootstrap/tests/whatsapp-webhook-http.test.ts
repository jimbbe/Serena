import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpServer } from "../server.ts";
import { createInMemoryPipeline } from "../create-in-memory-pipeline.ts";
import { createWhatsAppWebhookHandler } from "../whatsapp-webhook-handler.ts";

const MARIA_WHATSAPP = "5491111111111";
const UNKNOWN_WHATSAPP = "5499999999999";
const TEST_TOKEN = "test-token";

async function request(
  method: string,
  path: string,
  port: number,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) };

    if (data !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(data).toString();
    }

    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let server: http.Server;
let port = 0;

before(async () => {
  const { processChannelInboundMessage } = await createInMemoryPipeline();
  const webhookHandler = createWhatsAppWebhookHandler(processChannelInboundMessage);
  server = createHttpServer("test", undefined, TEST_TOKEN, undefined, undefined, undefined, webhookHandler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        port = address.port;
      }
      resolve();
    });
  });
});

after(() => {
  server.close();
});

function webhookPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    channel: "whatsapp",
    provider: "evolution",
    instanceId: "serena-main",
    messageId: `msg-${Date.now()}-${Math.random()}`,
    senderWhatsAppId: MARIA_WHATSAPP,
    senderName: "Maria",
    text: "hola Serena",
    receivedAt: "2026-05-12T10:20:30.000Z",
    raw: { key: { id: "abc" } },
    ...(overrides ?? {}),
  };
}

describe("POST /internal/webhook/whatsapp", () => {
  it("returns 401 when token is missing", async () => {
    const res = await request("POST", "/internal/webhook/whatsapp", port, webhookPayload());
    assert.equal(res.status, 401);
    assert.equal((res.body as Record<string, unknown>).error, "missing_token");
  });

  it("returns 403 when token is wrong", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload(),
      { "x-serena-internal-token": "wrong" },
    );
    assert.equal(res.status, 403);
    assert.equal((res.body as Record<string, unknown>).error, "invalid_token");
  });

  it("checks token before body parsing", async () => {
    const res = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/internal/webhook/whatsapp",
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: response.statusCode ?? 0, body: JSON.parse(raw) });
          });
        },
      );
      req.on("error", reject);
      req.write("not-json");
      req.end();
    });

    assert.equal(res.status, 401);
    assert.equal((res.body as Record<string, unknown>).error, "missing_token");
  });

  it("returns 500 on internal endpoints when token config is missing", async () => {
    const { processChannelInboundMessage } = await createInMemoryPipeline();
    const webhookHandler = createWhatsAppWebhookHandler(processChannelInboundMessage);
    const noTokenServer = createHttpServer("test", undefined, undefined, undefined, undefined, undefined, webhookHandler);
    let noTokenPort = 0;

    await new Promise<void>((resolve) => {
      noTokenServer.listen(0, "127.0.0.1", () => {
        const addr = noTokenServer.address();
        if (addr && typeof addr === "object") noTokenPort = addr.port;
        resolve();
      });
    });

    try {
      const res = await request(
        "POST",
        "/internal/webhook/whatsapp",
        noTokenPort,
        webhookPayload(),
        { "x-serena-internal-token": TEST_TOKEN },
      );
      assert.equal(res.status, 500);
      assert.equal((res.body as Record<string, unknown>).error, "internal_token_not_configured");
    } finally {
      noTokenServer.close();
    }
  });

  it("returns 401 for non-POST method without token", async () => {
    const res = await request("GET", "/internal/webhook/whatsapp", port);
    assert.equal(res.status, 401);
    assert.equal((res.body as Record<string, unknown>).error, "missing_token");
  });

  it("returns 405 for non-POST method with valid token", async () => {
    const res = await request(
      "GET",
      "/internal/webhook/whatsapp",
      port,
      undefined,
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 405);
    assert.equal((res.body as Record<string, unknown>).error, "method_not_allowed");
  });

  it("returns 401 for unknown internal route without token", async () => {
    const res = await request("GET", "/internal/unknown", port);
    assert.equal(res.status, 401);
    assert.equal((res.body as Record<string, unknown>).error, "missing_token");
  });

  it("returns 404 for unknown internal route with valid token", async () => {
    const res = await request(
      "GET",
      "/internal/unknown",
      port,
      undefined,
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 404);
    assert.equal((res.body as Record<string, unknown>).error, "not_found");
  });

  it("returns 400 with field list for invalid payload", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      { channel: "telegram", senderWhatsAppId: "", raw: [] },
      { "x-serena-internal-token": TEST_TOKEN },
    );

    assert.equal(res.status, 400);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, "invalid_payload");
    const fields = body.fields as Array<{ field: string }>;
    assert.ok(fields.some((f) => f.field === "channel"));
    assert.ok(fields.some((f) => f.field === "instanceId"));
    assert.ok(fields.some((f) => f.field === "messageId"));
    assert.ok(fields.some((f) => f.field === "senderWhatsAppId"));
    assert.ok(fields.some((f) => f.field === "text"));
    assert.ok(fields.some((f) => f.field === "receivedAt"));
    assert.ok(fields.some((f) => f.field === "raw"));
  });

  it("accepts valid optional provider/senderName/raw metadata", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload(),
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.received, true);
    assert.equal(body.routedTo, "serena-core");
  });

  it("returns normal conversation result for known sender", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload({ text: "hola, como estas?" }),
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 200);
    const result = ((res.body as Record<string, unknown>).result as Record<string, unknown>);
    assert.equal(result.channel, "whatsapp");
    assert.equal((result.guideResult as Record<string, unknown>).useCaseId, "serena.conversation.reply");
  });

  it("returns unknown-sender pipeline decision", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload({ senderWhatsAppId: UNKNOWN_WHATSAPP }),
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 200);
    const result = ((res.body as Record<string, unknown>).result as Record<string, unknown>);
    const decision = result.inboundDecision as Record<string, unknown>;
    assert.equal(decision.reason, "unknown_sender");
  });

  it("supports mediation request flow without auto-send", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload({ text: "avisale a Carlos que llego tarde" }),
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 200);
    const result = ((res.body as Record<string, unknown>).result as Record<string, unknown>);
    const profileId = result.profileId as string;
    assert.equal(profileId, "mediation_understanding");
  });

  it("returns risk-review pipeline result for risk signals", async () => {
    const res = await request(
      "POST",
      "/internal/webhook/whatsapp",
      port,
      webhookPayload({ text: "urgente, me cai y no me puedo levantar" }),
      { "x-serena-internal-token": TEST_TOKEN },
    );
    assert.equal(res.status, 200);
    const result = ((res.body as Record<string, unknown>).result as Record<string, unknown>);
    assert.equal(result.profileId, "risk_review");
  });

  it("preserves metadata in command mapping", async () => {
    const { processChannelInboundMessage } = await createInMemoryPipeline();
    let capturedMetadata: Record<string, unknown> | undefined;
    const originalExecute = processChannelInboundMessage.execute.bind(processChannelInboundMessage);
    processChannelInboundMessage.execute = async (cmd) => {
      capturedMetadata = cmd.metadata;
      return originalExecute(cmd);
    };

    const webhookHandler = createWhatsAppWebhookHandler(processChannelInboundMessage);
    const captureServer = createHttpServer("test", undefined, TEST_TOKEN, undefined, undefined, undefined, webhookHandler);
    let capturePort = 0;
    await new Promise<void>((resolve) => {
      captureServer.listen(0, "127.0.0.1", () => {
        const addr = captureServer.address();
        if (addr && typeof addr === "object") capturePort = addr.port;
        resolve();
      });
    });

    try {
      const raw = { key: { id: "msg-raw" }, source: "evo" };
      const payload = webhookPayload({
        provider: "evolution",
        instanceId: "instance-123",
        messageId: "message-xyz",
        senderName: "Maria Jose",
        raw,
      });

      const res = await request(
        "POST",
        "/internal/webhook/whatsapp",
        capturePort,
        payload,
        { "x-serena-internal-token": TEST_TOKEN },
      );
      assert.equal(res.status, 200);
      assert.ok(capturedMetadata);
      assert.equal(capturedMetadata?.provider, "evolution");
      assert.equal(capturedMetadata?.instanceId, "instance-123");
      assert.equal(capturedMetadata?.messageId, "message-xyz");
      assert.equal(capturedMetadata?.senderName, "Maria Jose");
      assert.deepEqual(capturedMetadata?.raw, raw);
    } finally {
      captureServer.close();
    }
  });
});
