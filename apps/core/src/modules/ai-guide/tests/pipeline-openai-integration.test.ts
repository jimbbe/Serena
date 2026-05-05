import test from "node:test";
import assert from "node:assert/strict";

import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { OpenAICompatibleLlmProvider } from "../infrastructure/openai/openai-compatible-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
import { InMemoryPromptRegistry } from "../application/prompts/in-memory-prompt-registry.ts";
import { ContextBuilder } from "../application/prompts/context-builder.ts";
import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptId } from "../domain/prompt-id.ts";
import type { GuideResultSuccess, GuideResultFailed } from "../domain/guide-result.ts";
import type { UseCaseContract } from "../domain/use-case-contract.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

const REPLY: PromptId = "serena.conversation.reply.v1";
const RISK: PromptId = "serena.risk.review.v1";

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

function makeContract(overrides?: Partial<UseCaseContract>): UseCaseContract {
  return {
    id: "serena.conversation.reply",
    promptId: REPLY,
    executionPolicy: { ...defaultPolicy },
    ...overrides,
  };
}

function makeRegistry() {
  return new InMemoryPromptRegistry(defaultPrompts);
}

function makeContextBuilder() {
  return new ContextBuilder();
}

// ═══════════════════════════════════════════════════════════════════════
// Fake fetch helper
// ═══════════════════════════════════════════════════════════════════════

type FakeFetch = {
  (url: string | URL, init?: RequestInit): Promise<Response>;
  lastRequest: () => { url: string; init?: RequestInit; body: string } | undefined;
};

function createFakeFetch(status: number, bodyObj: unknown): FakeFetch {
  let lastReq: { url: string; init?: RequestInit; body: string } | undefined;
  const fn = async (url: string | URL, init?: RequestInit) => {
    const entry: { url: string; init?: RequestInit; body: string } = {
      url: url.toString(),
      body: init?.body?.toString() ?? "",
    };
    if (init !== undefined) {
      entry.init = init;
    }
    lastReq = entry;
    return new Response(JSON.stringify(bodyObj), { status });
  };
  (fn as FakeFetch).lastRequest = () => lastReq;
  return fn as FakeFetch;
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

test("pipeline with fake OpenAI-compatible provider returns success with correct metadata", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "Hello from OpenAI-compatible API" } }],
    usage: { total_tokens: 55 },
    model: "gpt-4o-from-api",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-integration",
    model: "gpt-4o",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "gpt-4o",
  });

  const result = await pipeline.execute(makeContract(), { input: "Hello" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.output, "Hello from OpenAI-compatible API");
  assert.equal(success.metadata.provider, "openai-compatible");
  // Model from API response takes precedence over configured model
  assert.equal(success.metadata.model, "gpt-4o-from-api");
  assert.equal(success.metadata.attempts, 1);
  assert.equal(success.metadata.auditRecorded, true);
  assert.equal(success.metadata.promptId, REPLY);
  assert.equal(success.metadata.promptVersion, 1);
});

test("pipeline with fake provider — modelUsed falls back to configuredModel when API returns empty model", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "Hello" } }],
    model: "",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "my-fallback-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const pipeline = new ExecutionPipeline({
    provider,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "my-fallback-model",
  });

  const result = await pipeline.execute(makeContract(), { input: "Hi" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.metadata.model, "my-fallback-model");
});

test("pipeline with fake provider — failure path uses configuredModel in metadata", async () => {
  const fakeFetch = createFakeFetch(500, { error: "Internal error" });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "gpt-4o-mini",
  });

  const result = await pipeline.execute(makeContract(), { input: "Test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.metadata.provider, "openai-compatible");
  assert.equal(failed.metadata.model, "gpt-4o-mini");
  assert.ok(failed.error.message.includes("500"));
});

test("pipeline with fake provider — validation failure still uses configuredModel", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "not valid json" } }],
    usage: { total_tokens: 5 },
    model: "gpt-4o",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "gpt-4o",
  });

  const result = await pipeline.execute(
    makeContract({ id: "serena.risk.review", promptId: RISK }),
    { input: "test" },
  );

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.metadata.provider, "openai-compatible");
  assert.equal(failed.metadata.model, "gpt-4o");
  assert.ok(failed.error.message.includes("Output contract validation failed"));
});

test("pipeline with fake provider — understand_request with valid JSON returns success", async () => {
  const validMediationResponse = JSON.stringify({
    isMediationRequest: true,
    recipientHint: "Mari",
    messageDraft: "Llego más tarde.",
    requiresConfirmation: true,
    missingFields: ["confirmation"],
    riskSignal: false,
  });

  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: validMediationResponse } }],
    usage: { total_tokens: 35 },
    model: "custom-mediation-model",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "custom-mediation-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const pipeline = new ExecutionPipeline({
    provider,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "custom-mediation-model",
  });

  const result = await pipeline.execute(
    makeContract({
      id: "serena.mediation.understand_request",
      promptId: "serena.mediation.understand_request.v1",
    }),
    { input: "Decile a Mari que llego más tarde" },
  );

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.metadata.provider, "openai-compatible");
  assert.equal(success.metadata.model, "custom-mediation-model");
  assert.ok(typeof success.output === "string");
  const parsed = JSON.parse(success.output as string);
  assert.equal(parsed.isMediationRequest, true);
});

test("pipeline with timeout via fake fetch returns failed with configuredModel", async () => {
  // Fake fetch that obeys AbortSignal
  const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
    if (init?.signal) {
      await new Promise<void>((_resolve, reject) => {
        const signal = init.signal!;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "timeout-model",
    timeoutMs: 10, // very short
    fetchFn: fakeFetch,
  });

  const pipeline = new ExecutionPipeline({
    provider,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
    providerName: "openai-compatible",
    configuredModel: "timeout-model",
  });

  const result = await pipeline.execute(makeContract(), { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.metadata.provider, "openai-compatible");
  assert.equal(failed.metadata.model, "timeout-model");
  assert.ok(failed.error.message.includes("timed out"));
});
