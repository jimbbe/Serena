/**
 * T14 — Webhook receiver tests.
 *
 * Tests for the webhook handler: dedup → filter → normalize → route to configured consumer.
 * Also tests connection.update event handling.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { RequestContext } from "../server.ts";
import { handleWebhook } from "./receiver.ts";
import { InstanceManager } from "../instances/manager.ts";
import type { GatewayRuntimeConfig } from "../config.ts";
import { dedupTracker } from "./dedup.ts";
import { loadRoutingTable } from "../routing/table.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validConfig: GatewayRuntimeConfig = {
  mode: "production",
  port: 3001,
  adminKey: "admin",
  appKey: "app",
  evoKey: "evo",
  evolutionApiUrl: "http://evo:8080",
  evolutionApiKey: "evo-key",
  coreUrl: "http://core:3000",
  internalToken: "core-token",
  routingTablePath: undefined,
  routingTableJson: undefined,
};

function buildRoutingTable() {
  process.env["SERENA_INTERNAL_TOKEN"] = "core-token";
  return loadRoutingTable({
    routingTablePath: undefined,
    routingTableJson: JSON.stringify({
      routes: [
        {
          instanceId: "serena-main",
          consumerId: "serena-core",
          internalWebhookUrl: "http://core:3000/internal/webhook/whatsapp",
          auth: { header: "X-Serena-Internal-Token", env: "SERENA_INTERNAL_TOKEN" },
        },
      ],
    }),
  });
}

const validTextPayload = {
  event: "MESSAGES_UPSERT",
  instance: "serena-main",
  data: {
    key: {
      id: "wamid-001",
      remoteJid: "5491111111111@s.whatsapp.net",
      fromMe: false,
    },
    pushName: "Maria",
    messageTimestamp: 1715000000,
    message: {
      conversation: "Hola!",
    },
  },
};

const selfMessagePayload = {
  ...validTextPayload,
  data: {
    ...validTextPayload.data,
    key: { ...validTextPayload.data.key, fromMe: true },
  },
};

const imagePayload = {
  event: "MESSAGES_UPSERT",
  instance: "serena-main",
  data: {
    key: {
      id: "wamid-002",
      remoteJid: "5491111111111@s.whatsapp.net",
      fromMe: false,
    },
    messageTimestamp: 1715000000,
    message: {
      imageMessage: {},
    },
  },
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  dedupTracker.clear();
});

function makeFakeManager(): InstanceManager {
  return {
    exists() { return true; },
    get() { return undefined; },
    updateStatus() {},
  } as unknown as InstanceManager;
}

function makeTrackingManager(): InstanceManager {
  const tracked = new Map<string, string>();
  return {
    exists(name: string) { return tracked.has(name); },
    get(name: string) {
      const s = tracked.get(name);
      if (!s) return undefined;
      return { name, status: s, qr: null, connectedAt: null };
    },
    updateStatus(name: string, status: string) { tracked.set(name, status); },
  } as unknown as InstanceManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleWebhook", () => {
  it("discards self-message with 200 and reason", async () => {
    const ctx: RequestContext = { body: selfMessagePayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "self_message",
    });
  });

  it("discards image message with 200 and reason non-text", async () => {
    const ctx: RequestContext = { body: imagePayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "non-text",
    });
  });

  it("discards empty conversation", async () => {
    const ctx: RequestContext = {
        body: {
          ...validTextPayload,
          data: {
            ...validTextPayload.data,
            message: { conversation: "" },
          },
        },
        params: {},
      };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "non-text",
    });
  });

  it("silently accepts duplicate messageId with 200 and reason duplicate", async () => {
    // Pre-seed the tracker with the same messageId
    dedupTracker.isDuplicate("wamid-001");

    const ctx: RequestContext = { body: validTextPayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      received: true,
      duplicate: true,
    });
  });

  it("processes new messageId normally (dedup passes)", async () => {
    // Tracker is empty (cleared in afterEach) — fresh messageId goes through

    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ received: true }),
        text: () => Promise.resolve(JSON.stringify({ received: true })),
      } as Response);
    }) as typeof globalThis.fetch;

    const ctx: RequestContext = { body: validTextPayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
  });

  it("silently accepts multiple duplicates of the same messageId", async () => {
    // Simulate Evolution sending the same webhook 3 times
    dedupTracker.isDuplicate("wamid-001"); // 1st call — new, recorded

    // 2nd call — duplicate
    const ctx2: RequestContext = { body: validTextPayload, params: {} };
    const result2 = await handleWebhook(ctx2, validConfig, makeFakeManager(), buildRoutingTable());
    assert.deepEqual(result2.body, { received: true, duplicate: true });

    // 3rd call — still duplicate
    const ctx3: RequestContext = { body: validTextPayload, params: {} };
    const result3 = await handleWebhook(ctx3, validConfig, makeFakeManager(), buildRoutingTable());
    assert.deepEqual(result3.body, { received: true, duplicate: true });
  });

  it("routes valid text message to configured consumer", async () => {
    let capturedUrl = "";
    let capturedBody: unknown;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedUrl = url as string;
      capturedBody = JSON.parse(init?.body as string);
      const h = init?.headers as Record<string, string>;
      if (h) capturedHeaders = h;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ received: true }),
        text: () => Promise.resolve(JSON.stringify({ received: true })),
      } as Response);
    }) as typeof globalThis.fetch;

    const ctx: RequestContext = { body: validTextPayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.equal(capturedUrl, "http://core:3000/internal/webhook/whatsapp");
    assert.equal(capturedHeaders["Content-Type"], "application/json");
    assert.equal(capturedHeaders["X-Serena-Internal-Token"], "core-token");
    assert.ok(capturedBody);
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.instanceId, "serena-main");
    assert.equal(body.senderWhatsAppId, "5491111111111");
    assert.equal(body.text, "Hola!");
    assert.equal(body.channel, "whatsapp");
  });

  it("returns routing_not_configured for unknown instance in routing table mode", async () => {
    const ctx: RequestContext = {
      body: { ...validTextPayload, instance: "unknown-instance" },
      params: {},
    };

    const result = await handleWebhook(ctx, validConfig, makeFakeManager(), buildRoutingTable());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "routing_not_configured",
      instanceId: "unknown-instance",
    });
  });

  it("falls back to legacy SERENA_* routing when table is absent", async () => {
    const noCoreConfig = { ...validConfig, coreUrl: "" as unknown as string };
    const ctx: RequestContext = { body: validTextPayload, params: {} };

    globalThis.fetch = (() => {
      throw new Error("SHOULD NOT BE CALLED");
    }) as unknown as typeof globalThis.fetch;

    const result = await handleWebhook(ctx, noCoreConfig, makeFakeManager());

    // Should still return 200 but indicate routing failed
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
  });
});

describe("handleWebhook — connection.update", () => {
  it("updates instance status to open on connection.update open", async () => {
    const manager = makeTrackingManager();
    // Pre-register an instance
    manager.updateStatus("serena-main", "disconnected");

    const ctx: RequestContext = {
      body: {
        event: "connection.update",
        instance: "serena-main",
        data: { state: "open" },
      },
      params: {},
    };
    const result = await handleWebhook(ctx, validConfig, manager, buildRoutingTable());

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
    assert.equal(body.status, "open");

    // Verify manager was updated
    const state = manager.get("serena-main");
    assert.ok(state);
    assert.equal(state!.status, "open");
  });

  it("updates instance status to disconnected on connection.update close", async () => {
    const manager = makeTrackingManager();
    manager.updateStatus("serena-main", "connected");

    const ctx: RequestContext = {
      body: {
        event: "connection.update",
        instance: "serena-main",
        data: { state: "close" },
      },
      params: {},
    };
    const result = await handleWebhook(ctx, validConfig, manager, buildRoutingTable());

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.status, "disconnected");

    const state = manager.get("serena-main");
    assert.ok(state);
    assert.equal(state!.status, "disconnected");
  });

  it("does not crash on connection.update for untracked instance", async () => {
    const manager = makeTrackingManager();
    // No instances registered

    const ctx: RequestContext = {
      body: {
        event: "connection.update",
        instance: "unknown-instance",
        data: { state: "open" },
      },
      params: {},
    };
    const result = await handleWebhook(ctx, validConfig, manager, buildRoutingTable());

    // Should return 200 — untracked instances are silently ignored
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
  });

  it("handles connection.update with connecting state", async () => {
    const manager = makeTrackingManager();
    manager.updateStatus("serena-main", "disconnected");

    const ctx: RequestContext = {
      body: {
        event: "connection.update",
        instance: "serena-main",
        data: { state: "connecting" },
      },
      params: {},
    };
    const result = await handleWebhook(ctx, validConfig, manager, buildRoutingTable());

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.status, "connecting");
  });

  it("returns 200 with ignored reason for invalid connection.update", async () => {
    const manager = makeTrackingManager();

    const ctx: RequestContext = {
      body: {
        event: "connection.update",
        // missing instance and data
      },
      params: {},
    };
    const result = await handleWebhook(ctx, validConfig, manager);

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
    assert.equal(body.ignored, true);
  });

  it("self-messages and non-text are still discarded after connection.update support", async () => {
    // Regression: existing discard logic must still work
    const ctx: RequestContext = { body: selfMessagePayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "self_message",
    });
  });
});
