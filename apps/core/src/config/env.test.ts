import test from "node:test";
import assert from "node:assert/strict";

import { loadAppEnv, type AppEnv } from "./env.ts";

function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    HOST: "0.0.0.0",
    PORT: "3000",
    APP_ENV: "local",
    ...overrides,
  };
}

// ── Default values ──────────────────────────────────────────────────

test("default provider is mock", () => {
  const env = loadAppEnv(makeEnv());
  assert.equal(env.aiProvider, "mock");
});

test("default timeout is 30000", () => {
  const env = loadAppEnv(makeEnv());
  assert.equal(env.aiTimeoutMs, 30000);
});

test("default config produces backward-compatible AppEnv", () => {
  const env = loadAppEnv(makeEnv());
  assert.equal(env.host, "0.0.0.0");
  assert.equal(env.port, 3000);
  assert.equal(env.environment, "local");
  assert.equal(env.internalToken, undefined);
  assert.equal(env.enableSimulationEndpoints, false);
  assert.equal(env.aiProvider, "mock");
  assert.equal(env.aiBaseUrl, undefined);
  assert.equal(env.aiApiKey, undefined);
  assert.equal(env.aiModel, undefined);
  assert.equal(env.aiTimeoutMs, 30000);
});

// ── AI_PROVIDER parsing ─────────────────────────────────────────────

test("AI_PROVIDER=mock accepted", () => {
  const env = loadAppEnv(makeEnv({ AI_PROVIDER: "mock" }));
  assert.equal(env.aiProvider, "mock");
});

test("AI_PROVIDER=openai-compatible accepted", () => {
  const env = loadAppEnv(makeEnv({
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "https://api.example.com/v1",
    AI_API_KEY: "sk-test",
    AI_MODEL: "gpt-4o",
  }));
  assert.equal(env.aiProvider, "openai-compatible");
});

test("AI_PROVIDER case-insensitive", () => {
  const env = loadAppEnv(makeEnv({
    AI_PROVIDER: "MOCK",
  }));
  assert.equal(env.aiProvider, "mock");
});

test("unknown AI_PROVIDER throws", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_PROVIDER: "openai" })),
    /AI_PROVIDER must be one of/,
  );
});

test("unknown AI_PROVIDER message lists valid values", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_PROVIDER: "anthropic" })),
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("mock") && msg.includes("openai-compatible");
    },
  );
});

// ── AI_TIMEOUT_MS parsing ───────────────────────────────────────────

test("AI_TIMEOUT_MS custom value accepted", () => {
  const env = loadAppEnv(makeEnv({ AI_TIMEOUT_MS: "60000" }));
  assert.equal(env.aiTimeoutMs, 60000);
});

test("AI_TIMEOUT_MS non-integer throws", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_TIMEOUT_MS: "not-a-number" })),
    /AI_TIMEOUT_MS must be a positive integer/,
  );
});

test("AI_TIMEOUT_MS zero throws", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_TIMEOUT_MS: "0" })),
    /AI_TIMEOUT_MS must be a positive integer/,
  );
});

test("AI_TIMEOUT_MS negative throws", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_TIMEOUT_MS: "-500" })),
    /AI_TIMEOUT_MS must be a positive integer/,
  );
});

test("AI_TIMEOUT_MS float throws", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({ AI_TIMEOUT_MS: "30.5" })),
    /AI_TIMEOUT_MS must be a positive integer/,
  );
});

// ── OpenAI-compatible validation ────────────────────────────────────

test("openai-compatible requires AI_BASE_URL", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({
      AI_PROVIDER: "openai-compatible",
      // AI_BASE_URL missing
      AI_API_KEY: "sk-test",
      AI_MODEL: "gpt-4o",
    })),
    /requires: AI_BASE_URL/,
  );
});

test("openai-compatible requires AI_API_KEY", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({
      AI_PROVIDER: "openai-compatible",
      AI_BASE_URL: "https://api.example.com/v1",
      // AI_API_KEY missing
      AI_MODEL: "gpt-4o",
    })),
    /requires:.*AI_API_KEY/,
  );
});

test("openai-compatible requires AI_MODEL", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({
      AI_PROVIDER: "openai-compatible",
      AI_BASE_URL: "https://api.example.com/v1",
      AI_API_KEY: "sk-test",
      // AI_MODEL missing
    })),
    /requires:.*AI_MODEL/,
  );
});

test("openai-compatible error lists all missing vars", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({
      AI_PROVIDER: "openai-compatible",
    })),
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("AI_BASE_URL") &&
             msg.includes("AI_API_KEY") &&
             msg.includes("AI_MODEL");
    },
  );
});

// ── Mock provider ignores OpenAI vars ───────────────────────────────

test("mock provider ignores OpenAI env vars", () => {
  const env = loadAppEnv(makeEnv({
    AI_PROVIDER: "mock",
    AI_BASE_URL: "https://evil.example.com",
    AI_API_KEY: "should-be-ignored",
    AI_MODEL: "should-be-ignored",
  }));
  assert.equal(env.aiProvider, "mock");
  // Vars are still parsed (they exist in the type) but not validated
  assert.equal(env.aiBaseUrl, "https://evil.example.com");
  assert.equal(env.aiApiKey, "should-be-ignored");
  assert.equal(env.aiModel, "should-be-ignored");
});

// ── API key never in error messages ─────────────────────────────────

test("API key never appears in error messages", () => {
  assert.throws(
    () => loadAppEnv(makeEnv({
      AI_PROVIDER: "openai-compatible",
      AI_API_KEY: "sk-super-secret-123",
      // missing AI_BASE_URL and AI_MODEL
    })),
    (err: unknown) => {
      const msg = (err as Error).message;
      return !msg.includes("sk-super-secret-123");
    },
  );
});

// ── Backward compatibility ──────────────────────────────────────────

test("existing env vars still parsed correctly", () => {
  const env = loadAppEnv(makeEnv({
    HOST: "127.0.0.1",
    PORT: "4000",
    APP_ENV: "staging",
    SERENA_INTERNAL_TOKEN: "my-token",
    ENABLE_SIMULATION_ENDPOINTS: "true",
  }));
  assert.equal(env.host, "127.0.0.1");
  assert.equal(env.port, 4000);
  assert.equal(env.environment, "staging");
  assert.equal(env.internalToken, "my-token");
  assert.equal(env.enableSimulationEndpoints, true);
  assert.equal(env.aiProvider, "mock");
  assert.equal(env.aiTimeoutMs, 30000);
});

// ── Trim whitespace from AI vars ────────────────────────────────────

test("AI_BASE_URL trailing whitespace trimmed", () => {
  const env = loadAppEnv(makeEnv({
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "  https://api.example.com/v1  ",
    AI_API_KEY: "sk-test",
    AI_MODEL: "gpt-4o",
  }));
  assert.equal(env.aiBaseUrl, "https://api.example.com/v1");
});

test("AI_API_KEY whitespace trimmed", () => {
  const env = loadAppEnv(makeEnv({
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "https://api.example.com/v1",
    AI_API_KEY: "  sk-test  ",
    AI_MODEL: "gpt-4o",
  }));
  assert.equal(env.aiApiKey, "sk-test");
});
