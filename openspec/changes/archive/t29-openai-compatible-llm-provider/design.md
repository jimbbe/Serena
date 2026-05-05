# Design: T29 — OpenAI-Compatible LLM Provider

## Technical Approach

Native `fetch` provider implementing the `LlmProvider` port — zero npm deps. A factory selects mock vs. openai-compatible based on `LLM_PROVIDER` env var. The pipeline receives `providerName` to fix the hardcoded `"mock"` in metadata. Constructor-injected `fetchFn` enables unit testing without network calls.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| **Provider name fix** | (a) Add `name` to port type | (c) Pass `providerName` as constructor param to `ExecutionPipeline` | Port stays zero-change. Pipeline already has DI constructor — adding one param follows existing pattern. Metadata never touches provider instance for this field. |
| | (b) Extract from `modelUsed` | | |
| | (c) Pass `providerName` to pipeline constructor | | |
| **Factory location** | (a) `infrastructure/create-llm-provider.ts` | (a) Infrastructure layer | Factory is coupled to provider implementations which are infrastructure. Bootstrap just calls it — keeps layers clean. |
| | (b) Inline in bootstrap | | |
| | (c) Bootstrap composition root | | |
| **fetchFn injection** | (a) Constructor param (default `globalThis.fetch`) | (a) Constructor injection | Explicit, no global mutation. Each test creates a fake fetch scoped to that provider instance. Simpler than `globalThis.fetch` override used in gateway-wa. |
| | (b) Override `globalThis.fetch` in tests | | |
| **modelUsed fallback** | Hardcoded `"mock-model-v1"` in 5 places (lines 73, 190, 247, 265 + `?? "mock-model-v1"`) | Store configured model once per pipeline | `ExecutionPipeline` stores `configuredModel` from constructor. All failure-path `makeMetadata()` calls use `this.configuredModel`. Success path already uses `providerResult.modelUsed ?? this.configuredModel`. |

## Data Flow

```
server.ts
  │ loadAppEnv() → AppEnv { llmProvider: "openai-compatible", ... }
  ▼
createLlmProvider(appEnv)
  │ AI_PROVIDER=openai-compatible → new OpenAICompatibleLlmProvider({ baseUrl, apiKey, model, timeoutMs })
  │ AI_PROVIDER=mock → new MockLlmProvider()
  ▼
createInMemoryPipeline(llmProvider?)   ← optional param, defaults to MockLlmProvider
  │ new ExecutionPipeline({ provider: llmProvider, providerName, model, ... })
  ▼
ExecutionPipeline.invoke()
  │ POST {baseUrl}/chat/completions
  │   body: { model, messages: [{role, content}], max_tokens, temperature }
  │   signal: AbortSignal.timeout(timeoutMs)
  ▼
  ──→ response.choices[0].message.content  →  { content, tokensUsed: usage.total_tokens, modelUsed: model }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/ai-guide/infrastructure/openai/openai-compatible-llm-provider.ts` | **Create** | Provider class with constructor `{ baseUrl, apiKey, model, timeoutMs, fetchFn? }`. Implements `LlmProvider`. Builds OpenAI chat/completions request, parses response, handles errors with key scrubbing. |
| `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts` | **Create** | `createLlmProvider(appEnv): LlmProvider` — reads `LLM_PROVIDER` env, validates required fields for openai-compatible, returns instance. |
| `apps/core/src/config/env.ts` | **Modify** | Add `llmProvider`, `openaiBaseUrl`, `openaiApiKey`, `openaiModel`, `openaiTimeoutMs` to `AppEnv`. Validate: openai-compatible requires baseUrl + apiKey + model. |
| `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` | **Modify** | Add `providerName` and `configuredModel` to constructor. Pass `providerName` through to `makeMetadata()`. Replace 5 hardcoded `"mock-model-v1"` with `this.configuredModel`. |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | **Modify** | Accept optional `llmProvider?: LlmProvider`. Default to `MockLlmProvider`. Extract provider name for pipeline. |
| `apps/core/src/server.ts` | **Modify** | Call `createLlmProvider(env)`, pass result to `createInMemoryPipeline()`. |
| `apps/core/src/modules/ai-guide/tests/openai-compatible-llm-provider.test.ts` | **Create** | Unit tests: successful call, timeout, HTTP errors, malformed JSON, missing choices, API key never in errors. |

## Interfaces / Contracts

```typescript
// Provider config (infrastructure/openai/)
type OpenAICompatibleConfig = {
  baseUrl: string;           // e.g. "https://api.openai.com/v1"
  apiKey: string;            // Authorization: Bearer {apiKey}
  model: string;             // e.g. "gpt-4o-mini"
  timeoutMs?: number;        // falls back to policy.timeoutMs
  fetchFn?: typeof globalThis.fetch;  // injectable for testing
};

// Pipeline constructor (execution-pipeline.ts) — ADD two params
constructor(deps: {
  provider: LlmProvider;
  providerName: string;     // NEW — "mock" | "openai-compatible"
  configuredModel: string;   // NEW — "mock-model-v1" | "gpt-4o-mini"
  audit?: AiInvocationAudit;
  registry: PromptRegistry;
  contextBuilder: ContextBuilder;
})

// Factory (infrastructure/create-llm-provider.ts)
function createLlmProvider(env: AppEnv): LlmProvider
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| **Unit — Provider** | Request construction, response parsing, error cases, timeout, API key scrubbing | Fake `fetchFn` returning controlled responses. Test all error paths: HTTP 4xx, 5xx, network error, malformed JSON, missing `choices`. Verify key never in error messages. |
| **Unit — Factory** | Config selection (mock vs openai-compatible), validation errors | Pass `AppEnv` objects directly. Assert correct provider type returned, missing fields throw. |
| **Unit — Pipeline metadata** | `makeMetadata()` uses dynamic provider name | Existing pipeline tests updated to assert `metadata.provider` matches `providerName`. Verify failure-path `model` uses `configuredModel`. |
| **Integration** | Pipeline + real-ish provider (fake fetch) | Tests pass `OpenAICompatibleLlmProvider` with fake `fetchFn` to ExecutionPipeline. Verify full flow: request → provider → metadata. |

No real network calls. All tests use `node:test` + `node:assert/strict`.

## Open Questions

None. All decisions covered above.
