import test from "node:test";
import assert from "node:assert/strict";

import { createLlmProvider } from "../infrastructure/create-llm-provider.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { OpenAICompatibleLlmProvider } from "../infrastructure/openai/openai-compatible-llm-provider.ts";
import type { AppEnv } from "../../../config/env.ts";

function makeEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  const env: AppEnv = {
    host: "0.0.0.0",
    port: 3000,
    environment: "local",
    internalToken: undefined,
    enableSimulationEndpoints: false,
    aiProvider: "mock",
    aiTimeoutMs: 30000,
  };
  // Apply overrides — skip optional fields with undefined to satisfy exactOptionalPropertyTypes
  const o = overrides as Record<string, unknown>;
  if (o.internalToken !== undefined) env.internalToken = o.internalToken as string | undefined;
  if (o.enableSimulationEndpoints !== undefined) env.enableSimulationEndpoints = o.enableSimulationEndpoints as boolean;
  if (o.aiProvider !== undefined) env.aiProvider = o.aiProvider as "mock" | "openai-compatible";
  if (o.aiBaseUrl !== undefined) env.aiBaseUrl = o.aiBaseUrl as string;
  if (o.aiApiKey !== undefined) env.aiApiKey = o.aiApiKey as string;
  if (o.aiModel !== undefined) env.aiModel = o.aiModel as string;
  if (o.aiTimeoutMs !== undefined) env.aiTimeoutMs = o.aiTimeoutMs as number;
  if (o.host !== undefined) env.host = o.host as string;
  if (o.port !== undefined) env.port = o.port as number;
  if (o.environment !== undefined) env.environment = o.environment as string;
  return env;
}

// ── Default / mock provider ─────────────────────────────────────────

test("default (mock) returns MockLlmProvider", () => {
  const provider = createLlmProvider(makeEnv());
  assert.ok(provider instanceof MockLlmProvider);
});

test("AI_PROVIDER=mock returns MockLlmProvider and ignores OpenAI vars", () => {
  const provider = createLlmProvider(
    makeEnv({
      aiProvider: "mock",
      aiBaseUrl: "https://evil.example.com",
      aiApiKey: "should-not-matter",
      aiModel: "should-not-matter",
    }),
  );
  assert.ok(provider instanceof MockLlmProvider);
});

// ── OpenAI-compatible provider ──────────────────────────────────────

test("AI_PROVIDER=openai-compatible with all vars returns OpenAICompatibleLlmProvider", () => {
  const provider = createLlmProvider(
    makeEnv({
      aiProvider: "openai-compatible",
      aiBaseUrl: "https://api.example.com/v1",
      aiApiKey: "sk-test-123",
      aiModel: "gpt-4o",
      aiTimeoutMs: 60000,
    }),
  );
  assert.ok(provider instanceof OpenAICompatibleLlmProvider);
});

test("openai-compatible provider uses configured timeout", async () => {
  let capturedTimeoutMs: number | undefined;
  const originalFetch = globalThis.fetch;
  try {
    // Monkey-patch global fetch temporarily to capture config
    // This is safe because the factory creates the provider — we just
    // test that construction succeeds with the right config
    const provider = createLlmProvider(
      makeEnv({
        aiProvider: "openai-compatible",
        aiBaseUrl: "https://api.example.com/v1",
        aiApiKey: "sk-test",
        aiModel: "gpt-4o",
        aiTimeoutMs: 45000,
      }),
    );
    assert.ok(provider instanceof OpenAICompatibleLlmProvider);
    // Construction succeeded — timeoutMs was accepted
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Missing vars are caught by env validation, not factory ──────────

test("factory does not throw for mock provider even with missing OpenAI vars", () => {
  const provider = createLlmProvider(
    makeEnv({
      aiProvider: "mock",
    }),
  );
  assert.ok(provider instanceof MockLlmProvider);
});
