/**
 * T1 — Config module tests.
 *
 * Validates env var loading, defaults, and validation for both
 * production and dry_run modes.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Save/restore process.env
// ---------------------------------------------------------------------------

const savedEnv = { ...process.env };

function clearEnv(): void {
  delete process.env["GATEWAY_MODE"];
  delete process.env["GATEWAY_PORT"];
  delete process.env["GATEWAY_ADMIN_KEY"];
  delete process.env["GATEWAY_APP_KEY"];
  delete process.env["GATEWAY_EVO_KEY"];
  delete process.env["EVOLUTION_API_URL"];
  delete process.env["EVOLUTION_API_KEY"];
  delete process.env["SERENA_CORE_URL"];
  delete process.env["SERENA_INTERNAL_TOKEN"];
}

beforeEach(() => {
  clearEnv();
});

afterEach(() => {
  // Restore original env
  clearEnv();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
});

// ---------------------------------------------------------------------------
// Helper: set all required vars
// ---------------------------------------------------------------------------

function setAllRequiredVars(): void {
  process.env["GATEWAY_ADMIN_KEY"] = "admin-key-1";
  process.env["GATEWAY_APP_KEY"] = "app-key-1";
  process.env["GATEWAY_EVO_KEY"] = "evo-key-1";
  process.env["EVOLUTION_API_URL"] = "http://evo:8080";
  process.env["EVOLUTION_API_KEY"] = "evo-api-key";
  process.env["SERENA_CORE_URL"] = "http://core:3000";
  process.env["SERENA_INTERNAL_TOKEN"] = "core-token";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadConfig — production mode", () => {
  it("returns config with all vars set", () => {
    setAllRequiredVars();
    const config = loadConfig();
    assert.equal(config.mode, "production");
    assert.equal(config.port, 3001);
    assert.equal(config.adminKey, "admin-key-1");
    assert.equal(config.appKey, "app-key-1");
    assert.equal(config.evoKey, "evo-key-1");
    assert.equal(config.evolutionApiUrl, "http://evo:8080");
    assert.equal(config.evolutionApiKey, "evo-api-key");
    assert.equal(config.coreUrl, "http://core:3000");
    assert.equal(config.internalToken, "core-token");
  });

  it("defaults GATEWAY_MODE to production when unset", () => {
    setAllRequiredVars();
    const config = loadConfig();
    assert.equal(config.mode, "production");
  });

  it("explicit production mode is respected", () => {
    setAllRequiredVars();
    process.env["GATEWAY_MODE"] = "production";
    const config = loadConfig();
    assert.equal(config.mode, "production");
  });

  it("defaults GATEWAY_PORT to 3001 when unset", () => {
    setAllRequiredVars();
    const config = loadConfig();
    assert.equal(config.port, 3001);
  });

  it("respects explicit GATEWAY_PORT", () => {
    setAllRequiredVars();
    process.env["GATEWAY_PORT"] = "8080";
    const config = loadConfig();
    assert.equal(config.port, 8080);
  });

  it("throws when GATEWAY_ADMIN_KEY is missing", () => {
    setAllRequiredVars();
    delete process.env["GATEWAY_ADMIN_KEY"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_ADMIN_KEY"),
    );
  });

  it("throws when GATEWAY_APP_KEY is missing", () => {
    setAllRequiredVars();
    delete process.env["GATEWAY_APP_KEY"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_APP_KEY"),
    );
  });

  it("throws when GATEWAY_EVO_KEY is missing", () => {
    setAllRequiredVars();
    delete process.env["GATEWAY_EVO_KEY"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_EVO_KEY"),
    );
  });

  it("throws when EVOLUTION_API_URL is missing in production mode", () => {
    setAllRequiredVars();
    delete process.env["EVOLUTION_API_URL"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("EVOLUTION_API_URL"),
    );
  });

  it("throws when EVOLUTION_API_KEY is missing in production mode", () => {
    setAllRequiredVars();
    delete process.env["EVOLUTION_API_KEY"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("EVOLUTION_API_KEY"),
    );
  });

  it("throws when SERENA_CORE_URL is missing", () => {
    setAllRequiredVars();
    delete process.env["SERENA_CORE_URL"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("SERENA_CORE_URL"),
    );
  });

  it("throws when SERENA_INTERNAL_TOKEN is missing", () => {
    setAllRequiredVars();
    delete process.env["SERENA_INTERNAL_TOKEN"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("SERENA_INTERNAL_TOKEN"),
    );
  });

  it("throws when multiple vars are missing, naming all", () => {
    setAllRequiredVars();
    delete process.env["GATEWAY_ADMIN_KEY"];
    delete process.env["SERENA_CORE_URL"];
    assert.throws(
      () => loadConfig(),
      (err: Error) => {
        return (
          err.message.includes("GATEWAY_ADMIN_KEY") &&
          err.message.includes("SERENA_CORE_URL")
        );
      },
    );
  });

  it("rejects empty GATEWAY_ADMIN_KEY", () => {
    setAllRequiredVars();
    process.env["GATEWAY_ADMIN_KEY"] = "  ";
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_ADMIN_KEY"),
    );
  });

  it("rejects negative GATEWAY_PORT", () => {
    setAllRequiredVars();
    process.env["GATEWAY_PORT"] = "-1";
    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_PORT"),
    );
  });
});

describe("loadConfig — dry_run mode", () => {
  it("returns dry_run mode when set", () => {
    process.env["GATEWAY_MODE"] = "dry_run";
    // Dry-run only needs auth keys, not Evolution
    process.env["GATEWAY_ADMIN_KEY"] = "admin-key";
    process.env["GATEWAY_APP_KEY"] = "app-key";
    process.env["GATEWAY_EVO_KEY"] = "evo-key";
    process.env["SERENA_CORE_URL"] = "http://core:3000";
    process.env["SERENA_INTERNAL_TOKEN"] = "token";

    const config = loadConfig();
    assert.equal(config.mode, "dry_run");
    assert.equal(config.port, 3001);
  });

  it("skips Evolution API key validation in dry-run mode", () => {
    process.env["GATEWAY_MODE"] = "dry_run";
    process.env["GATEWAY_ADMIN_KEY"] = "admin-key";
    process.env["GATEWAY_APP_KEY"] = "app-key";
    process.env["GATEWAY_EVO_KEY"] = "evo-key";
    process.env["SERENA_CORE_URL"] = "http://core:3000";
    process.env["SERENA_INTERNAL_TOKEN"] = "token";
    // Evolution vars are missing — should NOT throw

    const config = loadConfig();
    assert.equal(config.mode, "dry_run");
    // Evolution fields may be empty strings in dry-run mode
    assert.equal(typeof config.evolutionApiUrl, "string");
    assert.equal(typeof config.evolutionApiKey, "string");
  });

  it("still validates auth keys in dry-run mode", () => {
    process.env["GATEWAY_MODE"] = "dry_run";
    process.env["GATEWAY_ADMIN_KEY"] = "admin-key";
    // Missing GATEWAY_APP_KEY
    delete process.env["GATEWAY_APP_KEY"];

    assert.throws(
      () => loadConfig(),
      (err: Error) => err.message.includes("GATEWAY_APP_KEY"),
    );
  });
});
