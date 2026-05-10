/**
 * T12 — Message sender tests.
 *
 * Tests for validation, instance existence check, and Evolution API call.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MessageSender } from "./sender.ts";
import type { EvolutionClient } from "../evolution/client.ts";
import type { InstanceManager } from "../instances/manager.ts";

// ---------------------------------------------------------------------------
// Fake clients
// ---------------------------------------------------------------------------

function makeFakeManager(existingInstances: string[] = []): InstanceManager {
  const instances = new Map<string, { status: string }>();
  for (const name of existingInstances) {
    instances.set(name, { status: "connected" });
  }
  return {
    exists(name: string) {
      return instances.has(name);
    },
    get(name: string) {
      const inst = instances.get(name);
      if (!inst) return undefined;
      return {
        name,
        status: inst.status as "connected" | "disconnected",
        qr: null,
        connectedAt: null,
      };
    },
  } as unknown as InstanceManager;
}

function makeFakeEvoClient(): EvolutionClient {
  return {
    async createInstance(_name: string) {
      return { instance: { instanceName: "", instanceId: "", status: "" } };
    },
    async getConnectionState(_name: string) {
      return { state: "close" };
    },
    async connectInstance(_name: string) {
      return {};
    },
    async sendText(_instanceName: string, _number: string, _text: string) {
      return {
        key: { id: "wamid-001", remoteJid: "5491111111111@s.whatsapp.net", fromMe: true },
        message: { conversation: "test" },
        messageTimestamp: "1715000000",
        status: "sent",
      };
    },
    async deleteInstance(_name: string) {
      return { status: "deleted", message: "ok" };
    },
  };
}

function makeFailingEvoClient(errorMessage: string): EvolutionClient {
  return {
    async createInstance() {
      throw new Error(errorMessage);
    },
    async getConnectionState() {
      throw new Error(errorMessage);
    },
    async connectInstance() {
      return {};
    },
    async sendText() {
      throw new Error(errorMessage);
    },
    async deleteInstance() {
      throw new Error(errorMessage);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageSender — validation", () => {
  it("sends a valid message successfully", async () => {
    const manager = makeFakeManager(["serena-main"]);
    const evoClient = makeFakeEvoClient();
    const sender = new MessageSender(evoClient, manager);

    const result = await sender.sendText("serena-main", "5491111111111", "Hola!");

    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.value.status, "sent");
      assert.ok(result.value.messageId, "Should have messageId");
      assert.ok(result.value.timestamp, "Should have timestamp");
    }
  });

  it("returns validation error for empty instanceId", async () => {
    const manager = makeFakeManager();
    const evoClient = makeFakeEvoClient();
    const sender = new MessageSender(evoClient, manager);

    const result = await sender.sendText("", "5491111111111", "Hola!");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "validation_error");
    assert.ok(result.fields && result.fields.includes("instanceId"));
    }
  });

  it("returns validation error for non-numeric to field", async () => {
    const manager = makeFakeManager(["serena-main"]);
    const evoClient = makeFakeEvoClient();
    const sender = new MessageSender(evoClient, manager);

    const result = await sender.sendText("serena-main", "abc", "Hola!");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.fields && result.fields.includes("to"));
    }
  });

  it("returns error for non-existent instance", async () => {
    const manager = makeFakeManager(); // no instances
    const evoClient = makeFakeEvoClient();
    const sender = new MessageSender(evoClient, manager);

    const result = await sender.sendText("nonexistent", "5491111111111", "Hola!");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, "instance_not_found");
    }
  });

  it("returns error for disconnected instance", async () => {
    // Create manager where the instance has status "disconnected"
    const instances = new Map<string, { status: string }>();
    instances.set("disconnected-inst", { status: "disconnected" });

    const disconnectedManager: InstanceManager = {
      exists(name: string) { return instances.has(name); },
      get(name: string) {
        const inst = instances.get(name);
        if (!inst) return undefined;
        return {
          name,
          status: inst.status as "connected" | "disconnected",
          qr: null,
          connectedAt: null,
        };
      },
    } as unknown as InstanceManager;

    const evoClient = makeFakeEvoClient();
    const sender = new MessageSender(evoClient, disconnectedManager);

    const result = await sender.sendText("disconnected-inst", "5491111111111", "Hola!");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "instance_not_connected");
    }
  });

  it("returns 502 when Evolution API is unreachable", async () => {
    const manager = makeFakeManager(["serena-main"]);
    const evoClient = makeFailingEvoClient("Evolution API is not reachable");
    const sender = new MessageSender(evoClient, manager);

    const result = await sender.sendText("serena-main", "5491111111111", "Hola!");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.equal(result.error, "evolution_unreachable");
    }
  });
});
