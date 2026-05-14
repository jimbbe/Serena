/**
 * T7 — HTTP Server tests.
 *
 * Tests for the middleware chain: auth → body buffer → JSON parse →
 * route dispatch → error handler.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, startServer, stopServer } from "./server.ts";
import type { GatewayRuntimeConfig } from "./config.ts";
import { Router } from "./router.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validConfig: GatewayRuntimeConfig = {
  mode: "production",
  port: 0, // dynamic port for tests
  adminKey: "admin-key",
  appKey: "app-key",
  evoKey: "evo-key",
  evolutionApiUrl: "http://evo:8080",
  evolutionApiKey: "evo-key-1",
  coreUrl: "http://core:3000",
  internalToken: "token",
  routingTablePath: undefined,
  routingTableJson: undefined,
};

type HandlerResult = { status: number; body: unknown; headers?: Record<string, string> };

// ---------------------------------------------------------------------------
// Unit tests — handler function shape
// ---------------------------------------------------------------------------

describe("createServer", () => {
  it("returns an http.Server instance", () => {
    const router = new Router<() => Promise<HandlerResult>>();
    router.register("GET", "/health", async () => ({
      status: 200,
      body: { status: "ok" },
    }));

    const server = createServer(validConfig, router);
    assert.ok(server);
    assert.equal(typeof server.listen, "function");
    assert.equal(typeof server.close, "function");
    // Close immediately since we don't need to start it
    server.close();
  });
});

// ---------------------------------------------------------------------------
// Integration tests — start server and make HTTP requests
// ---------------------------------------------------------------------------

describe("HTTP Server — integration", () => {
  let server: ReturnType<typeof createServer> | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      await stopServer(server);
      server = null;
    }
  });

  async function startWithRoutes(
    routes: Array<{ method: string; path: string; handler: () => Promise<HandlerResult> }>,
  ): Promise<number> {
    const router = new Router<() => Promise<HandlerResult>>();
    for (const r of routes) {
      router.register(r.method, r.path, r.handler);
    }
    server = createServer(validConfig, router);
    port = await startServer(server, 0);
    return port;
  }

  // ---- 404 unknown route ----
  it("returns 404 for unknown route", async () => {
    const p = await startWithRoutes([]);
    const res = await fetch(`http://localhost:${p}/unknown`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "application/json");
    const body = await res.json();
    assert.deepEqual(body, { error: "not_found", path: "/unknown" });
  });

  // ---- 405 wrong method ----
  it("returns 405 for wrong method on known path", async () => {
    const p = await startWithRoutes([
      { method: "GET", path: "/health", handler: async () => ({ status: 200, body: {} }) },
    ]);
    const res = await fetch(`http://localhost:${p}/health`, { method: "POST" });
    assert.equal(res.status, 405);
    const body = await res.json();
    assert.equal(body.error, "method_not_allowed");
  });

  // ---- 415 missing content-type ----
  it("returns 415 for POST without Content-Type: application/json", async () => {
    const p = await startWithRoutes([
      {
        method: "POST",
        path: "/test",
        handler: async () => ({ status: 200, body: {} }),
      },
    ]);
    const res = await fetch(`http://localhost:${p}/test`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    });
    assert.equal(res.status, 415);
    const body = await res.json();
    assert.equal(body.error, "unsupported_media_type");
  });

  // ---- 413 oversized body ----
  it("returns 413 for body > 1 MB", async () => {
    const p = await startWithRoutes([
      {
        method: "POST",
        path: "/test",
        handler: async () => ({ status: 200, body: {} }),
      },
    ]);
    // Create a body just over 1 MB
    const bigString = "x".repeat(1.1 * 1024 * 1024); // ~1.1 MB
    const res = await fetch(`http://localhost:${p}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: bigString }),
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.error, "payload_too_large");
  });

  // ---- 400 invalid JSON ----
  it("returns 400 for invalid JSON body", async () => {
    const p = await startWithRoutes([
      {
        method: "POST",
        path: "/test",
        handler: async () => ({ status: 200, body: {} }),
      },
    ]);
    const res = await fetch(`http://localhost:${p}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_json");
  });

  // ---- Successful request flow ----
  it("routes correctly with valid JSON body", async () => {
    const p = await startWithRoutes([
      {
        method: "POST",
        path: "/test",
        handler: async () => ({
          status: 201,
          body: { created: true, name: "test" },
        }),
      },
    ]);
    const res = await fetch(`http://localhost:${p}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("content-type"), "application/json");
    const body = await res.json();
    assert.deepEqual(body, { created: true, name: "test" });
  });

  // ---- Health check without auth ----
  it("GET /health returns 200 without auth", async () => {
    const p = await startWithRoutes([
      {
        method: "GET",
        path: "/health",
        handler: async () => ({
          status: 200,
          body: { status: "ok", service: "whatsapp-gateway", mode: "production" },
        }),
      },
    ]);
    const res = await fetch(`http://localhost:${p}/health`);
    assert.equal(res.status, 200);
  });
});
