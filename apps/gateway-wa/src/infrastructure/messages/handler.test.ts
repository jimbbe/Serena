/**
 * T13 — Message sending endpoint handler tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { RequestContext } from "../server.ts";
import { MessageSender } from "./sender.ts";
import type { EvolutionClient } from "../evolution/client.ts";
import type { InstanceManager } from "../instances/manager.ts";
import { sendMessageHandler } from "./handler.ts";

// ---------------------------------------------------------------------------
// Fake MessageSender
// ---------------------------------------------------------------------------

function makeFakeSender(): MessageSender {
  const evoClient = {
    sendText: async () => ({
      key: { id: "wamid-001", remoteJid: "x@s.whatsapp.net", fromMe: true },
      message: { conversation: "test" },
      messageTimestamp: "1",
      status: "sent",
    }),
  } as unknown as EvolutionClient;

  const manager = {
    exists: () => true,
    get: () => ({ name: "test", status: "connected" as const, qr: null, connectedAt: null }),
  } as unknown as InstanceManager;

  return new MessageSender(evoClient, manager);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendMessageHandler", () => {
  it("returns 200 with message confirmation on success", async () => {
    const sender = makeFakeSender();
    const ctx: RequestContext = {
      body: { instanceId: "test", to: "5491111111111", text: "Hello" },
      params: {},
    };

    const result = await sendMessageHandler(ctx, sender);
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.status, "sent");
    assert.ok(body.messageId);
    assert.ok(body.timestamp);
  });

  it("returns 400 for missing instanceId", async () => {
    const sender = makeFakeSender();
    const ctx: RequestContext = {
      body: { to: "5491111111111", text: "Hello" }, params: {}
    };

    const result = await sendMessageHandler(ctx, sender);
    assert.equal(result.status, 400);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "validation_error");
    assert.ok((body.fields as string[]).includes("instanceId"));
  });

  it("returns 400 for empty text", async () => {
    const sender = makeFakeSender();
    const ctx: RequestContext = {
      body: { instanceId: "test", to: "5491111111111", text: "   " }, params: {}
    };

    const result = await sendMessageHandler(ctx, sender);
    assert.equal(result.status, 400);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "validation_error");
    assert.ok((body.fields as string[]).includes("text"));
  });

  it("returns 404 for non-existent instance", async () => {
    const manager = {
      exists: () => false,
      get: () => undefined,
    } as unknown as InstanceManager;
    const evoClient = {} as EvolutionClient;
    const sender = new MessageSender(evoClient, manager);

    const ctx: RequestContext = {
      body: { instanceId: "nonexistent", to: "5491111111111", text: "Hello" }, params: {}
    };

    const result = await sendMessageHandler(ctx, sender);
    assert.equal(result.status, 404);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "instance_not_found");
  });
});
