/**
 * T10 — Instance manager tests.
 *
 * Tests for in-memory instance state management wrapping the Evolution client.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { InstanceManager, type InstanceState } from "../instances/manager.ts";
import type { EvolutionClient } from "../evolution/client.ts";

// ---------------------------------------------------------------------------
// Fake Evolution Client
// ---------------------------------------------------------------------------

type FakeEvoClient = EvolutionClient & {
  _createCalls: Array<{ name: string }>;
  _connectCalls: string[];
  _deleteCalls: string[];
  _shouldThrowOnCreate?: Error;
  _shouldThrowOnDelete?: Error;
};

function makeFakeEvoClient(): FakeEvoClient {
  const client: FakeEvoClient = {
    _createCalls: [],
    _connectCalls: [],
    _deleteCalls: [],
    async createInstance(name: string) {
      if (this._shouldThrowOnCreate) throw this._shouldThrowOnCreate;
      this._createCalls.push({ name });
      return {
        instance: { instanceName: name, instanceId: `id-${name}`, status: "created" },
      };
    },
    async getConnectionState(_name: string) {
      return { state: "close" };
    },
    async connectInstance(name: string) {
      if (this._shouldThrowOnCreate) throw this._shouldThrowOnCreate;
      this._connectCalls.push(name);
      return { pairingCode: `CODE-${name}` };
    },
    async sendText(_instanceName: string, _number: string, _text: string) {
      return {
        key: { id: "wamid-001", remoteJid: "x@s.whatsapp.net", fromMe: true },
        message: { conversation: "text" },
        messageTimestamp: "1",
        status: "sent",
      };
    },
    async deleteInstance(name: string) {
      if (this._shouldThrowOnDelete) throw this._shouldThrowOnDelete;
      this._deleteCalls.push(name);
      return { status: "deleted", message: "Instance deleted" };
    },
  };
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InstanceManager", () => {
  let evoClient: FakeEvoClient;
  let manager: InstanceManager;

  beforeEach(() => {
    evoClient = makeFakeEvoClient();
    manager = new InstanceManager(evoClient);
  });

  describe("createInstance", () => {
    it("creates instance and returns state with QR", async () => {
      const result = await manager.createInstance("serena-main");

      assert.equal(result.name, "serena-main");
      assert.equal(result.status, "disconnected");
      assert.equal(result.qr, "CODE-serena-main");
      assert.equal(evoClient._createCalls.length, 1);
      assert.equal(evoClient._createCalls[0]!.name, "serena-main");
      assert.equal(evoClient._connectCalls.length, 1);
      assert.equal(evoClient._connectCalls[0], "serena-main");
    });

    it("throws on duplicate name", async () => {
      await manager.createInstance("test");
      await assert.rejects(
        manager.createInstance("test"),
        (err: Error) =>
          err.message.includes("test") && err.message.includes("already exists"),
      );
    });
  });

  describe("listInstances", () => {
    it("returns empty array when no instances", () => {
      const result = manager.listInstances();
      assert.deepEqual(result, []);
    });

    it("returns all tracked instances with status", async () => {
      await manager.createInstance("inst-1");
      await manager.createInstance("inst-2");

      // Manually set inst-1 as connected
      const internal = (manager as unknown as { _instances: Map<string, InstanceState> });
      const state = internal._instances.get("inst-1")!;
      state.status = "connected";
      state.connectedAt = new Date().toISOString();

      const result = manager.listInstances();
      assert.equal(result.length, 2);
      const names = result.map((r) => r.name);
      assert.ok(names.includes("inst-1"));
      assert.ok(names.includes("inst-2"));

      const inst1 = result.find((r) => r.name === "inst-1")!;
      assert.equal(inst1.status, "connected");
      assert.ok(inst1.connectedAt, "connectedAt should be set");
    });
  });

  describe("getQrCode", () => {
    it("returns QR for disconnected instance", async () => {
      await manager.createInstance("test");
      const result = manager.getQrCode("test");

      assert.ok(result.found);
      if (result.found) {
        assert.equal(result.qr, "CODE-test");
        assert.equal(result.status, "disconnected");
      }
    });

    it("returns connected message when status is connected", async () => {
      await manager.createInstance("test");
      const internal = (manager as unknown as { _instances: Map<string, InstanceState> });
      const state = internal._instances.get("test")!;
      state.status = "connected";

      const result = manager.getQrCode("test");
      assert.ok(result.found);
      if (result.found) {
        assert.equal(result.status, "connected");
      }
    });

    it("returns not-found for non-existent instance", () => {
      const result = manager.getQrCode("nonexistent");
      assert.equal(result.found, false);
    });
  });

  describe("deleteInstance", () => {
    it("deletes existing instance and removes from map", async () => {
      await manager.createInstance("test");
      const result = await manager.deleteInstance("test");

      assert.equal(result.deleted, true);
      assert.equal(result.name, "test");
      assert.equal(evoClient._deleteCalls.length, 1);
    });

    it("throws for non-existent instance", async () => {
      await assert.rejects(
        manager.deleteInstance("nonexistent"),
        (err: Error) =>
          err.message.includes("nonexistent") && err.message.includes("not found"),
      );
    });
  });

  describe("exists", () => {
    it("returns true for existing instance", async () => {
      await manager.createInstance("test");
      assert.equal(manager.exists("test"), true);
    });

    it("returns false for non-existent instance", () => {
      assert.equal(manager.exists("nonexistent"), false);
    });
  });

  describe("updateStatus", () => {
    it("updates instance status to open", async () => {
      await manager.createInstance("test");
      manager.updateStatus("test", "open");

      const state = manager.get("test");
      assert.ok(state);
      assert.equal(state!.status, "open");
      assert.ok(state!.connectedAt, "connectedAt should be set when status is open");
    });

    it("updates instance status to disconnected", async () => {
      await manager.createInstance("test");
      // First set to connected
      const internal = (manager as unknown as { _instances: Map<string, InstanceState> });
      const state = internal._instances.get("test")!;
      state.status = "connected";
      state.connectedAt = new Date().toISOString();

      // Then disconnect
      manager.updateStatus("test", "disconnected");

      const updated = manager.get("test");
      assert.ok(updated);
      assert.equal(updated!.status, "disconnected");
    });

    it("does nothing for untracked instance (no crash)", () => {
      // Should not throw
      manager.updateStatus("nonexistent", "open");
      assert.equal(manager.exists("nonexistent"), false);
    });

    it("updates status to connecting", async () => {
      await manager.createInstance("test");
      manager.updateStatus("test", "connecting");

      const state = manager.get("test");
      assert.ok(state);
      assert.equal(state!.status, "connecting");
    });

    it("sets connectedAt when status becomes connected", async () => {
      await manager.createInstance("test");
      manager.updateStatus("test", "connected");

      const state = manager.get("test");
      assert.ok(state);
      assert.equal(state!.status, "connected");
      assert.ok(state!.connectedAt, "connectedAt should be set when status is connected");
    });
  });
});
