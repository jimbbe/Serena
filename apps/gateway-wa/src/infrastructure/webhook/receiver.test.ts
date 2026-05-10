/**
 * T14 — Webhook receiver tests.
 *
 * Tests for the webhook handler: dedup → filter → normalize → route to Serena Core.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { RequestContext } from "../server.ts";
import { handleWebhook } from "./receiver.ts";
import type { InstanceManager } from "../instances/manager.ts";
import type { GatewayRuntimeConfig } from "../config.ts";
import { dedupTracker } from "./dedup.ts";

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
};

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
  } as unknown as InstanceManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleWebhook", () => {
  it("discards self-message with 200 and reason", async () => {
    const ctx: RequestContext = { body: selfMessagePayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "self_message",
    });
  });

  it("discards image message with 200 and reason non-text", async () => {
    const ctx: RequestContext = { body: imagePayload, params: {} };
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

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
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

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
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ignored: true,
      reason: "duplicate",
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
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.received, true);
  });

  it("silently accepts multiple duplicates of the same messageId", async () => {
    // Simulate Evolution sending the same webhook 3 times
    dedupTracker.isDuplicate("wamid-001"); // 1st call — new, recorded

    // 2nd call — duplicate
    const ctx2: RequestContext = { body: validTextPayload, params: {} };
    const result2 = await handleWebhook(ctx2, validConfig, makeFakeManager());
    assert.deepEqual(result2.body, { ignored: true, reason: "duplicate" });

    // 3rd call — still duplicate
    const ctx3: RequestContext = { body: validTextPayload, params: {} };
    const result3 = await handleWebhook(ctx3, validConfig, makeFakeManager());
    assert.deepEqual(result3.body, { ignored: true, reason: "duplicate" });
  });

  it("routes valid text message to Serena Core", async () => {
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
    const result = await handleWebhook(ctx, validConfig, makeFakeManager());

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

  it("logs error and does not route when SERENA_CORE_URL is missing", async () => {
    const noCoreConfig = { ...validConfig, coreUrl: "" };
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
