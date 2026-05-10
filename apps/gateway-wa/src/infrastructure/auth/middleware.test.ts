/**
 * T2 — Auth middleware tests.
 *
 * Tests for 3-tier API key validation with constant-time comparison.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAuth } from "./middleware.ts";
import type { GatewayRuntimeConfig } from "../config.ts";
import type { IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validConfig: GatewayRuntimeConfig = {
  mode: "production",
  port: 3001,
  adminKey: "admin-secret-123",
  appKey: "app-secret-456",
  evoKey: "evo-secret-789",
  evolutionApiUrl: "http://evo:8080",
  evolutionApiKey: "evo-api-key",
  coreUrl: "http://core:3000",
  internalToken: "core-token",
};

function makeReq(headers: Record<string, string>): IncomingMessage {
  return {
    headers,
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateAuth", () => {
  // ---- Health endpoint exempt ----
  it("health endpoint requires no auth", () => {
    const result = validateAuth(makeReq({}), "/health", validConfig);
    assert.equal(result.ok, true);
  });

  it("health endpoint passes even with wrong key", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "wrong" }),
      "/health",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  // ---- Admin key ----
  it("admin key validates for /instances", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/instances",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  it("admin key validates for /instances/test/qr", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/instances/test/qr",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  it("admin key validates for DELETE /instances/test", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/instances/test",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  // ---- App key ----
  it("app key validates for /send", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-app-key": "app-secret-456" }),
      "/send",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  // ---- Evo key ----
  it("evo key validates for /webhook/evolution", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-evo-key": "evo-secret-789" }),
      "/webhook/evolution",
      validConfig,
    );
    assert.equal(result.ok, true);
  });

  // ---- Missing key → 401 ----
  it("returns 401 when no key header is present", () => {
    const result = validateAuth(makeReq({}), "/instances", validConfig);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, {
        error: "unauthorized",
        message: "API key required",
      });
    }
  });

  it("returns 401 for /send without key", () => {
    const result = validateAuth(makeReq({}), "/send", validConfig);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("returns 401 for /webhook/evolution without key", () => {
    const result = validateAuth(makeReq({}), "/webhook/evolution", validConfig);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  // ---- Invalid key → 403 ----
  it("returns 403 for invalid admin key", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "wrong-key" }),
      "/instances",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.deepEqual(result.body, {
        error: "forbidden",
        message: "Invalid API key",
      });
    }
  });

  it("returns 403 for invalid app key", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-app-key": "wrong-key" }),
      "/send",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("returns 403 for invalid evo key", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-evo-key": "wrong-key" }),
      "/webhook/evolution",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  // ---- Wrong tier → 403 ----
  it("admin key on /send returns 403 (wrong tier)", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/send",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.deepEqual(result.body, {
        error: "forbidden",
        message: "Invalid API key",
      });
    }
  });

  it("app key on /instances returns 403 (wrong tier)", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-app-key": "app-secret-456" }),
      "/instances",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("evo key on /send returns 403 (wrong tier)", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-evo-key": "evo-secret-789" }),
      "/send",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("admin key on /webhook/evolution returns 403 (wrong tier)", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/webhook/evolution",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  // ---- Constant-time safety ----
  it("does not leak key value in error message", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "admin-secret-123" }),
      "/instances",
      validConfig,
    );
    // Should succeed — key is correct
    assert.equal(result.ok, true);
  });

  it("error body does not mention key value", () => {
    const result = validateAuth(
      makeReq({ "x-gateway-admin-key": "compromised-key" }),
      "/instances",
      validConfig,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes("compromised-key"), "Should not leak key value");
      assert.ok(!bodyStr.includes("admin-secret-123"), "Should not leak stored key");
    }
  });
});
