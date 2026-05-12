/**
 * T17 — Integration tests: full endpoint flow for all 7 gateway endpoints.
 *
 * Starts the real server on port 0, tests endpoints with fake Evolution API
 * via globalThis.fetch injection, and validates auth rejection.
 */

import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, type GatewayRuntimeConfig } from "../infrastructure/config.ts";
import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let testConfig: GatewayRuntimeConfig;
let testPort: number;
let server: Server | null = null;
let baseUrl: string;
const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Fake Evolution API
// ---------------------------------------------------------------------------

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
};

let lastEvoRequest: CapturedRequest = { url: "", method: "", headers: {} };
let evoRequestLog: CapturedRequest[] = [];
let connectionStateByInstance: Record<string, string> = {};

beforeEach(() => {
  lastEvoRequest = { url: "", method: "", headers: {} };
  evoRequestLog = [];
  connectionStateByInstance = {};
});

function setupFakeEvolution(): void {
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = url as string;

    // Pass through requests to localhost (our own server)
    if (urlStr.includes("localhost") || urlStr.includes("127.0.0.1")) {
      return originalFetch(url, init);
    }

    const method = init?.method ?? "GET";
    const headers = (init?.headers as Record<string, string>) ?? {};
    const body = init?.body as string | undefined;

    lastEvoRequest = { url: urlStr, method, headers, body: body ?? "" };
    evoRequestLog.push(lastEvoRequest);

    // Instance creation
    if (urlStr.includes("/instance/create")) {
      return Promise.resolve({
        ok: true, status: 201, statusText: "Created",
        json: () => Promise.resolve({
          instance: { instanceName: "test", instanceId: "id1", status: "created" },
        }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    // Instance connection / QR
    if (urlStr.includes("/instance/connect/")) {
      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        json: () => Promise.resolve({ pairingCode: "PAIR-CODE-123" }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    // Instance deletion
    if (urlStr.includes("/instance/delete/")) {
      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        json: () => Promise.resolve({ status: "deleted", message: "Instance deleted" }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    // Connection state
    if (urlStr.includes("/instance/connectionState/")) {
      const instanceName = decodeURIComponent(urlStr.split("/instance/connectionState/")[1] ?? "");
      const state = connectionStateByInstance[instanceName] ?? "open";
      if (state === "__fail__") {
        return Promise.resolve({
          ok: false, status: 503, statusText: "Service Unavailable",
          json: () => Promise.resolve({ error: "evolution_down" }),
          text: () => Promise.resolve(JSON.stringify({ error: "evolution_down" })),
        } as Response);
      }

      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        json: () => Promise.resolve({ instance: { state } }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    // Send text
    if (urlStr.includes("/message/sendText/")) {
      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        json: () => Promise.resolve({
          key: { id: "wamid-001", remoteJid: "5491111111111@s.whatsapp.net", fromMe: true },
          message: { conversation: "Hello" },
          messageTimestamp: "1715000000",
          status: "sent",
        }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    // Webhook routing to Serena Core
    if (urlStr.includes("/internal/webhook/whatsapp")) {
      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        json: () => Promise.resolve({ received: true }),
        text: () => Promise.resolve("{}"),
      } as Response);
    }

    return Promise.resolve({
      ok: false, status: 404, statusText: "Not Found",
      json: () => Promise.resolve({ error: "not_found" }),
      text: () => Promise.resolve("{}"),
    } as Response);
  }) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Server bootstrap (runs once before all tests)
// ---------------------------------------------------------------------------

async function startTestServer(): Promise<void> {
  process.env["GATEWAY_MODE"] = "production";
  process.env["GATEWAY_ADMIN_KEY"] = "test-admin-key";
  process.env["GATEWAY_APP_KEY"] = "test-app-key";
  process.env["GATEWAY_EVO_KEY"] = "test-evo-key";
  process.env["EVOLUTION_API_URL"] = "http://fake-evo:8080";
  process.env["EVOLUTION_API_KEY"] = "fake-evo-api-key";
  process.env["SERENA_CORE_URL"] = "http://fake-core:3000";
  process.env["SERENA_INTERNAL_TOKEN"] = "fake-core-token";

  setupFakeEvolution();
  testConfig = loadConfig();

  const { createServer, startServer } = await import("../infrastructure/server.ts");
  const { Router } = await import("../infrastructure/router.ts");
  const { handleHealth } = await import("../infrastructure/health.ts");
  const { createEvolutionClient } = await import("../infrastructure/evolution/client.ts");
  const { InstanceManager } = await import("../infrastructure/instances/manager.ts");
  const { MessageSender } = await import("../infrastructure/messages/sender.ts");
  const {
    createInstanceHandler,
    listInstancesHandler,
    getQrCodeHandler,
    deleteInstanceHandler,
  } = await import("../infrastructure/instances/handlers.ts");
  const { sendMessageHandler } = await import("../infrastructure/messages/handler.ts");
  const { handleWebhook } = await import("../infrastructure/webhook/receiver.ts");

  const evoClient = createEvolutionClient({
    baseUrl: testConfig.evolutionApiUrl,
    apiKey: testConfig.evolutionApiKey,
  });

  const instanceManager = new InstanceManager(evoClient);
  const messageSender = new MessageSender(evoClient, instanceManager);

  const router = new Router<any>();

  router.register("GET", "/health", async () => handleHealth(testConfig.mode));
  router.register("POST", "/instances", async (ctx: any) =>
    createInstanceHandler(ctx, instanceManager, testConfig.appKey),
  );
  router.register("GET", "/instances", async (ctx: any) =>
    listInstancesHandler(ctx, instanceManager),
  );
  router.register("GET", "/instances/:name/qr", async (ctx: any) =>
    getQrCodeHandler(ctx, instanceManager, ctx.params.name ?? ""),
  );
  router.register("DELETE", "/instances/:name", async (ctx: any) =>
    deleteInstanceHandler(ctx, instanceManager, ctx.params.name ?? ""),
  );
  router.register("POST", "/send", async (ctx: any) =>
    sendMessageHandler(ctx, messageSender),
  );
  router.register("POST", "/webhook/evolution", async (ctx: any) =>
    handleWebhook(ctx, testConfig, instanceManager),
  );

  const httpServer = createServer(testConfig, router);
  testPort = await startServer(httpServer, 0);
  baseUrl = `http://localhost:${testPort}`;
  server = httpServer;
}

// Start before all tests
await startTestServer();

// Cleanup after all tests
after(async () => {
  if (server) {
    const { stopServer } = await import("../infrastructure/server.ts");
    await stopServer(server);
    server = null;
  }
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns 200 without auth", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "whatsapp-gateway");
    assert.equal(body.mode, "production");
  });
});

describe("POST /instances", () => {
  it("returns 201 with admin key", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "test-instance" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.name, "test-instance");
    assert.equal(body.status, "disconnected");
    assert.equal(body.apiKey, "test-app-key");
  });

  it("returns 401 without key", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    assert.equal(res.status, 401);
  });

  it("returns 403 with wrong tier key (app key)", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({ name: "test" }),
    });
    assert.equal(res.status, 403);
  });

  it("returns 403 with invalid admin key", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "wrong-key",
      },
      body: JSON.stringify({ name: "test" }),
    });
    assert.equal(res.status, 403);
  });

  it("returns 409 for duplicate instance", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "dupe-test" }),
    });
    assert.equal(res.status, 201);

    const res2 = await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "dupe-test" }),
    });
    assert.equal(res2.status, 409);
  });
});

describe("GET /instances", () => {
  it("returns 200 with array (admin key)", async () => {
    const res = await fetch(`${baseUrl}/instances`, {
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    // Should include previously created instances
    assert.ok(body.length >= 1);
  });
});

describe("GET /instances/:name/qr", () => {
  it("returns 200 for existing instance", async () => {
    const res = await fetch(`${baseUrl}/instances/test-instance/qr`, {
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(res.status, 200);
  });

  it("returns 404 for non-existent instance", async () => {
    const res = await fetch(`${baseUrl}/instances/nope/qr`, {
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "instance_not_found");
    assert.equal(body.name, "nope");
  });
});

describe("DELETE /instances/:name", () => {
  it("returns 200 for existing instance", async () => {
    const res = await fetch(`${baseUrl}/instances/test-instance`, {
      method: "DELETE",
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, "test-instance");
    assert.equal(body.deleted, true);
  });

  it("returns 404 for non-existent instance", async () => {
    const res = await fetch(`${baseUrl}/instances/nope`, {
      method: "DELETE",
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(res.status, 404);
  });
});

describe("POST /send", () => {
  it("returns 401 without key", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: "x", to: "123", text: "hi" }),
    });
    assert.equal(res.status, 401);
  });

  it("returns 403 with wrong tier (admin key)", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ instanceId: "x", to: "123", text: "hi" }),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 for non-existent instance (with app key)", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({
        instanceId: "nonexistent-send",
        to: "5491111111111",
        text: "Hello!",
      }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "instance_not_found");
  });

  it("allows send when manager state is stale disconnected but Evolution reports open", async () => {
    await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "stale-send" }),
    });

    connectionStateByInstance["stale-send"] = "open";

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({
        instanceId: "stale-send",
        to: "5491111111111",
        text: "Hello after QR scan!",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "sent");
    assert.ok(evoRequestLog.some((req) => req.url.includes("/instance/connectionState/stale-send")));
    assert.ok(evoRequestLog.some((req) => req.url.includes("/message/sendText/stale-send")));
  });

  it("blocks send when manager is disconnected and Evolution reports close", async () => {
    await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "closed-send" }),
    });

    connectionStateByInstance["closed-send"] = "close";

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({
        instanceId: "closed-send",
        to: "5491111111111",
        text: "Should not send",
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "instance_not_connected");
    assert.ok(evoRequestLog.some((req) => req.url.includes("/instance/connectionState/closed-send")));
    assert.equal(
      evoRequestLog.some((req) => req.url.includes("/message/sendText/closed-send")),
      false,
    );
  });

  it("returns controlled error when Evolution state check fails", async () => {
    await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "state-fail-send" }),
    });

    connectionStateByInstance["state-fail-send"] = "__fail__";

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({
        instanceId: "state-fail-send",
        to: "5491111111111",
        text: "Should return controlled error",
      }),
    });

    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, "evolution_unreachable");
    assert.ok(String(body.message).includes("Cannot verify instance state"));
  });

  it("does not query Evolution state when manager was updated to open by connection.update", async () => {
    await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "open-send" }),
    });

    await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "connection.update",
        instance: "open-send",
        data: { state: "open" },
      }),
    });

    evoRequestLog = [];
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-App-Key": "test-app-key",
      },
      body: JSON.stringify({
        instanceId: "open-send",
        to: "5491111111111",
        text: "Send while cached open",
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(
      evoRequestLog.some((req) => req.url.includes("/instance/connectionState/open-send")),
      false,
    );
    assert.ok(evoRequestLog.some((req) => req.url.includes("/message/sendText/open-send")));
  });
});

describe("POST /webhook/evolution", () => {
  it("returns 200 for valid text with evo key", async () => {
    const res = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "MESSAGES_UPSERT",
        instance: "serena-main",
        data: {
          key: {
            id: "wamid-001",
            remoteJid: "5491111111111@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1715000000,
          message: { conversation: "Hola!" },
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.received, true);
  });

  it("returns 200 for self-message (discarded)", async () => {
    const res = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "MESSAGES_UPSERT",
        instance: "serena-main",
        data: {
          key: {
            id: "wamid-002",
            remoteJid: "5491111111111@s.whatsapp.net",
            fromMe: true,
          },
          messageTimestamp: 1715000000,
          message: { conversation: "Hola!" },
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ignored, true);
    assert.equal(body.reason, "self_message");
  });

  it("updates instance status from connection.update open and disconnected events", async () => {
    await fetch(`${baseUrl}/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ name: "webhook-state" }),
    });

    const openRes = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "connection.update",
        instance: "webhook-state",
        data: { state: "open" },
      }),
    });

    assert.equal(openRes.status, 200);
    const openBody = await openRes.json();
    assert.equal(openBody.status, "open");

    const qrWhileOpen = await fetch(`${baseUrl}/instances/webhook-state/qr`, {
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(qrWhileOpen.status, 200);
    const qrOpenBody = await qrWhileOpen.json();
    assert.equal(qrOpenBody.status, "open");
    assert.equal(qrOpenBody.message, "Already connected");

    const closeRes = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "connection.update",
        instance: "webhook-state",
        data: { state: "close" },
      }),
    });

    assert.equal(closeRes.status, 200);
    const closeBody = await closeRes.json();
    assert.equal(closeBody.status, "disconnected");

    const qrAfterClose = await fetch(`${baseUrl}/instances/webhook-state/qr`, {
      headers: { "X-Gateway-Admin-Key": "test-admin-key" },
    });
    assert.equal(qrAfterClose.status, 200);
    const qrCloseBody = await qrAfterClose.json();
    assert.equal(qrCloseBody.status, "disconnected");
    assert.equal(qrCloseBody.qr, "PAIR-CODE-123");
  });

  it("accepts connection.update for an unregistered instance without crashing", async () => {
    const res = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Evo-Key": "test-evo-key",
      },
      body: JSON.stringify({
        event: "connection.update",
        instance: "unknown-webhook-state",
        data: { state: "open" },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.received, true);
    assert.equal(body.status, "open");
  });

  it("returns 401 without evo key", async () => {
    const res = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
  });

  it("returns 403 with wrong tier", async () => {
    const res = await fetch(`${baseUrl}/webhook/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403);
  });
});

describe("Error handling", () => {
  it("returns 404 for unknown route", async () => {
    const res = await fetch(`${baseUrl}/unknown-path`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "not_found");
    assert.equal(body.path, "/unknown-path");
  });

  it("returns 405 for wrong method on known path", async () => {
    const res = await fetch(`${baseUrl}/health`, { method: "PATCH" });
    assert.equal(res.status, 405);
    const body = await res.json();
    assert.equal(body.error, "method_not_allowed");
    assert.ok((body.allowedMethods as string[]).includes("GET"));
  });
});
