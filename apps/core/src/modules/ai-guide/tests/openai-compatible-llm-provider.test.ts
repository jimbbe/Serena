import test from "node:test";
import assert from "node:assert/strict";

import { OpenAICompatibleLlmProvider } from "../infrastructure/openai/openai-compatible-llm-provider.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";
import type { PromptId } from "../domain/prompt-id.ts";

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

const REPLY: PromptId = "serena.conversation.reply.v1";

// ── Successful invocation ───────────────────────────────────────────

test("constructs request to correct endpoint", async () => {
  let capturedUrl = "";
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1/",
    apiKey: "sk-test",
    model: "test-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  const lastReq = fakeFetch.lastRequest();
  assert.ok(lastReq, "fetch must be called");
  assert.equal(lastReq!.url, "https://api.example.com/v1/chat/completions");
  assert.equal(lastReq!.init?.method, "POST");
});

test("includes Authorization Bearer header", async () => {
  let capturedHeaders: Record<string, string> = {};
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-secret-abc123",
    model: "test-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  const lastReq = fakeFetch.lastRequest();
  const headers = (lastReq?.init?.headers ?? {}) as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer sk-secret-abc123");
  assert.equal(headers["Content-Type"], "application/json");
});

test("sends systemPrompt, developerPrompt, and userPrompt in messages array", async () => {
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "SYSTEM",
    developerPrompt: "DEVELOPER",
    userPrompt: "USER",
    policy: defaultPolicy,
  });

  const lastReq = fakeFetch.lastRequest();
  const body = JSON.parse(lastReq!.body as string);
  assert.deepEqual(body.messages, [
    { role: "system", content: "SYSTEM" },
    { role: "system", content: "Developer instructions:\nDEVELOPER" },
    { role: "user", content: "USER" },
  ]);
});

test("returns content, tokensUsed, modelUsed from valid response", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "I am a response" } }],
    usage: { total_tokens: 42 },
    model: "test-model-from-api",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "configured-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: defaultPolicy,
  });

  assert.equal(result.content, "I am a response");
  assert.equal(result.tokensUsed, 42);
  assert.equal(result.modelUsed, "test-model-from-api");
});

test("falls back to config.model when response.model is empty", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "ok" } }],
    usage: { total_tokens: 10 },
    model: "",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "configured-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: defaultPolicy,
  });

  assert.equal(result.modelUsed, "configured-model");
});

test("falls back to config.model when response.model is missing", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "ok" } }],
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "my-custom-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: defaultPolicy,
  });

  assert.equal(result.modelUsed, "my-custom-model");
});

test("tokensUsed is undefined when usage.total_tokens is missing", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "ok" } }],
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: defaultPolicy,
  });

  assert.equal(result.tokensUsed, undefined);
});

// ── HTTP error handling ─────────────────────────────────────────────

test("HTTP 401 throws error with status code and body truncated, NO api key exposed", async () => {
  const fakeFetch = createFakeFetch(401, {
    error: { message: "Invalid API key provided: sk-secret-exposed" },
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-secret-exposed",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    (err: unknown) => {
      const msg = (err as Error).message;
      // Must contain status code
      if (!msg.includes("401")) return false;
      // Must NOT contain the api key
      if (msg.includes("sk-secret-exposed")) return false;
      return true;
    },
  );
});

test("HTTP 500 throws error with status code and body truncated", async () => {
  const fakeFetch = createFakeFetch(500, {
    error: "Internal Server Error",
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("500") && msg.includes("Internal Server Error");
    },
  );
});

test("error body truncated to 1000 chars", async () => {
  const longBody = "x".repeat(2000);
  const fakeFetch = createFakeFetch(500, { error: longBody });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    (err: unknown) => {
      const msg = (err as Error).message;
      // Body after the status would be truncated
      const bodyPart = msg.split(": ").slice(2).join(": ");
      return bodyPart.length <= 1000 + 100; // some padding for prefix
    },
  );
});

// ── Missing/empty content ────────────────────────────────────────────

test("response without choices[0].message.content throws", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: {} }],
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    /LLM response did not contain message content/,
  );
});

test("response with empty content string throws", async () => {
  const fakeFetch = createFakeFetch(200, {
    choices: [{ message: { content: "   " } }],
  });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    /LLM response did not contain message content/,
  );
});

test("response with empty choices array throws", async () => {
  const fakeFetch = createFakeFetch(200, { choices: [] });

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    /LLM response did not contain choices/,
  );
});

test("response is not valid JSON throws", async () => {
  const fakeFetch = createRawFakeFetch(200, "not json at all", "text/plain");

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    /LLM response was not valid JSON/,
  );
});

// ── Timeout handling ────────────────────────────────────────────────

test("request times out via AbortController", async () => {
  // Create a fake fetch that obeys the AbortSignal
  const fakeFetch = async (_url: string | URL, init?: RequestInit) => {
    // Wait for the signal to abort, then throw AbortError
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
  };

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 50, // very short timeout
    fetchFn: fakeFetch as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.invoke({
        promptId: REPLY,
        promptVersion: 1,
        systemPrompt: "sys",
        userPrompt: "hi",
        policy: defaultPolicy,
      }),
    /LLM request timed out after 50ms/,
  );
});

// ── Policy mapping ──────────────────────────────────────────────────

test("maps maxTokens to max_tokens in request body", async () => {
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: { ...defaultPolicy, maxTokens: 512 },
  });

  const body = JSON.parse(fakeFetch.lastRequest()!.body as string);
  assert.equal(body.max_tokens, 512);
});

test("maps temperature from policy", async () => {
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: { ...defaultPolicy, temperature: 0.2 },
  });

  const body = JSON.parse(fakeFetch.lastRequest()!.body as string);
  assert.equal(body.temperature, 0.2);
});

// ── No real network calls ────────────────────────────────────────────

test("does not call real fetch when fetchFn is injected", async () => {
  let realFetchCalled = false;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((async () => {
      realFetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown) as typeof fetch;

    const fakeFetch = createFakeFetch(200, validChatResponse());
    const provider = new OpenAICompatibleLlmProvider({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "test",
      timeoutMs: 5000,
      fetchFn: fakeFetch as typeof fetch,
    });

    await provider.invoke({
      promptId: REPLY,
      promptVersion: 1,
      systemPrompt: "sys",
      userPrompt: "hi",
      policy: defaultPolicy,
    });

    assert.equal(realFetchCalled, false, "real fetch must not be called");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Strip trailing slash from baseUrl ───────────────────────────────

test("strips trailing slash from baseUrl", async () => {
  let capturedUrl = "";
  const fakeFetch = createFakeFetch(200, validChatResponse());

  const provider = new OpenAICompatibleLlmProvider({
    baseUrl: "https://api.example.com/v1///",
    apiKey: "sk-test",
    model: "test",
    timeoutMs: 5000,
    fetchFn: fakeFetch as typeof fetch,
  });

  await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "sys",
    userPrompt: "hi",
    policy: defaultPolicy,
  });

  assert.equal(fakeFetch.lastRequest()!.url, "https://api.example.com/v1/chat/completions");
});

// ═══════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════

function validChatResponse() {
  return {
    choices: [{ message: { content: "Hello from AI" } }],
    usage: { total_tokens: 30 },
    model: "api-model",
  };
}

type FakeFetch = {
  (url: string | URL, init?: RequestInit): Promise<Response>;
  lastRequest: () => { url: string; init?: RequestInit; body: string } | undefined;
};

function createFakeFetch(
  status: number,
  bodyObj: unknown,
): FakeFetch {
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

function createRawFakeFetch(
  status: number,
  body: string,
  contentType: string,
): FakeFetch {
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
    return new Response(body, {
      status,
      headers: { "Content-Type": contentType },
    });
  };
  (fn as FakeFetch).lastRequest = () => lastReq;
  return fn as FakeFetch;
}
