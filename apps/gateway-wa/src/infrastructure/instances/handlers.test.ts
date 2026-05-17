/**
 * T11 — Instance management endpoint handler tests.
 *
 * Tests for POST /instances, GET /instances, GET /instances/:name/qr, DELETE /instances/:name.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { RequestContext } from "../server.ts";
import { createInstanceHandler, listInstancesHandler, getQrCodeHandler, deleteInstanceHandler } from "./handlers.ts";
import type { InstanceManager, InstanceState } from "./manager.ts";
import type { IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// Fake InstanceManager
// ---------------------------------------------------------------------------

function makeFakeManager(
  existingInstances: Map<string, InstanceState> = new Map(),
): InstanceManager {
  const instances = existingInstances;
  return {
    async createInstance(name: string) {
      if (instances.has(name)) {
        throw Object.assign(new Error(`Instance "${name}" already exists`), { status: 409 });
      }
      return { name, status: "disconnected" as const, qr: "CODE-123", connectedAt: null };
    },
    listInstances() {
      return Array.from(instances.values()).map((s) => ({
        name: s.name,
        status: s.status,
        connectedAt: s.connectedAt,
      }));
    },
    getQrCode(name: string) {
      const state = instances.get(name);
      if (!state) return { found: false } as const;
      if (state.status === "connected" || state.status === "open") {
        return { found: true as const, qr: null, status: state.status };
      }
      return { found: true as const, qr: state.qr, status: state.status };
    },
    async deleteInstance(name: string) {
      if (!instances.has(name)) {
        throw Object.assign(new Error(`Instance "${name}" not found`), { status: 404 });
      }
      instances.delete(name);
      return { name, deleted: true } as const;
    },
    exists(name: string) { return instances.has(name); },
    get(name: string) { return instances.get(name); },
  } as InstanceManager;
}

function makeFakeReq(): IncomingMessage {
  return {} as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createInstanceHandler", () => {
  it("returns 201 with safe instance metadata only on success", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: { name: "serena-main" }, params: {} };
    const result = await createInstanceHandler(ctx, manager, "app-key-123");

    assert.equal(result.status, 201);
    const body = result.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["name", "qr", "status"]);
    assert.equal(body.name, "serena-main");
    assert.equal(body.status, "disconnected");
    assert.equal(body.qr, "CODE-123");
    assert.equal(body.apiKey, undefined);
    assert.equal(body.appKey, undefined);
    assert.equal(body.adminKey, undefined);
    assert.equal(body.internalToken, undefined);
    assert.equal(body.evolutionApiKey, undefined);
    assert.equal(body.token, undefined);
    assert.equal(body.secret, undefined);
  });

  it("returns 400 for empty name", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: { name: "" }, params: {} };
    const result = await createInstanceHandler(ctx, manager, "app-key");

    assert.equal(result.status, 400);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "invalid_instance_name");
  });

  it("returns 400 for invalid name (special chars)", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: { name: "bad name!" }, params: {} };
    const result = await createInstanceHandler(ctx, manager, "app-key");

    assert.equal(result.status, 400);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "invalid_instance_name");
  });

  it("returns 409 for duplicate name", async () => {
    const existing = new Map<string, InstanceState>();
    existing.set("serena-main", { name: "serena-main", status: "disconnected", qr: "X", connectedAt: null });
    const manager = makeFakeManager(existing);
    const ctx: RequestContext = { body: { name: "serena-main" }, params: {} };
    const result = await createInstanceHandler(ctx, manager, "app-key");

    assert.equal(result.status, 409);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "instance_exists");
    assert.equal(body.name, "serena-main");
  });

  it("accepts alphanumeric + hyphens name", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: { name: "serena-main-123" }, params: {} };
    const result = await createInstanceHandler(ctx, manager, "app-key");

    assert.equal(result.status, 201);
  });
});

describe("listInstancesHandler", () => {
  it("returns empty array when no instances", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: undefined, params: {} };
    const result = await listInstancesHandler(ctx, manager);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, []);
  });

  it("returns array with instances", async () => {
    const existing = new Map<string, InstanceState>();
    existing.set("inst-1", { name: "inst-1", status: "disconnected", qr: null, connectedAt: null });
    existing.set("inst-2", { name: "inst-2", status: "connected", qr: null, connectedAt: "2026-05-10T00:00:00.000Z" });
    const manager = makeFakeManager(existing);
    const ctx: RequestContext = { body: undefined, params: {} };
    const result = await listInstancesHandler(ctx, manager);

    assert.equal(result.status, 200);
    const body = result.body as Array<Record<string, unknown>>;
    assert.equal(body.length, 2);
  });
});

describe("getQrCodeHandler", () => {
  it("returns QR for disconnected instance", async () => {
    const existing = new Map<string, InstanceState>();
    existing.set("test", { name: "test", status: "disconnected", qr: "CODE-123", connectedAt: null });
    const manager = makeFakeManager(existing);
    const ctx: RequestContext = { body: undefined, params: {} };

    const result = await getQrCodeHandler(ctx, manager, "test");
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.qr, "CODE-123");
    assert.equal(body.status, "disconnected");
  });

  it("returns connected message for connected instance", async () => {
    const existing = new Map<string, InstanceState>();
    existing.set("test", { name: "test", status: "connected", qr: null, connectedAt: "2026-05-10T00:00:00.000Z" });
    const manager = makeFakeManager(existing);
    const ctx: RequestContext = { body: undefined, params: {} };

    const result = await getQrCodeHandler(ctx, manager, "test");
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.status, "connected");
    assert.ok(body.message, "Should have message");
  });

  it("returns 404 for non-existent instance", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: undefined, params: {} };

    const result = await getQrCodeHandler(ctx, manager, "nonexistent");
    assert.equal(result.status, 404);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "instance_not_found");
    assert.equal(body.name, "nonexistent");
  });
});

describe("deleteInstanceHandler", () => {
  it("returns 200 with deleted confirmation", async () => {
    const existing = new Map<string, InstanceState>();
    existing.set("test", { name: "test", status: "disconnected", qr: null, connectedAt: null });
    const manager = makeFakeManager(existing);
    const ctx: RequestContext = { body: undefined, params: {} };

    const result = await deleteInstanceHandler(ctx, manager, "test");
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.name, "test");
    assert.equal(body.deleted, true);
  });

  it("returns 404 for non-existent instance", async () => {
    const manager = makeFakeManager();
    const ctx: RequestContext = { body: undefined, params: {} };

    const result = await deleteInstanceHandler(ctx, manager, "nonexistent");
    assert.equal(result.status, 404);
    const body = result.body as Record<string, unknown>;
    assert.equal(body.error, "instance_not_found");
  });
});
