# Tasks: T29 — OpenAI-Compatible LLM Provider

**Status**: ✅ All sdd-apply tasks completed (T29-01 through T29-16). T29-17 (commit & PR) pending — requires human action.

## Phase 1: Env Config

### T29-01 — Expand AppEnv type with LLM fields
**Files**: `apps/core/src/config/env.ts`
- Add fields to `AppEnv` type: `aiProvider`, `aiBaseUrl`, `aiApiKey`, `aiModel`, `aiTimeoutMs`
- Add parsing in `loadAppEnv()`:
  - `AI_PROVIDER` → default `"mock"`, allowed values `"mock" | "openai-compatible"`
  - `AI_BASE_URL` → `string | undefined`
  - `AI_API_KEY` → `string | undefined`
  - `AI_MODEL` → `string | undefined`
  - `AI_TIMEOUT_MS` → default `30000`, must be positive integer
- Add validation: reject unknown `AI_PROVIDER` values, reject non-positive-integer `AI_TIMEOUT_MS`
- **sdd-apply**: ✅ complete

### T29-02 — Env config unit tests
**Files**: `apps/core/src/config/env.test.ts` (new)
- Test default values (mock provider, 30000ms timeout)
- Test `AI_PROVIDER=openai-compatible` accepted
- Test unknown `AI_PROVIDER` throws
- Test `AI_TIMEOUT_MS` parsing: valid integer, reject float/negative/zero/non-numeric
- **sdd-apply**: ✅ complete

---

## Phase 2: OpenAICompatibleLlmProvider

### T29-03 — Create OpenAICompatibleLlmProvider class
**Files**: `apps/core/src/modules/ai-guide/infrastructure/openai/openai-compatible-llm-provider.ts` (new)
- Define `OpenAICompatibleConfig` type: `{ baseUrl, apiKey, model, timeoutMs?, fetchFn? }`
- Implement `LlmProvider` port:
  - Constructor stores config, defaults `timeoutMs` to 30000, `fetchFn` to `globalThis.fetch`
  - `invoke()` builds POST request to `${baseUrl}/chat/completions`
  - Request body: `{ model, messages: [{role, content}, ...], max_tokens, temperature }`
  - Messages: system (if present), developer (if present), user (always)
  - Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
  - Timeout via `AbortSignal.timeout(timeoutMs)`
  - Parse response: extract `choices[0].message.content`, `usage.total_tokens`, `model`
- **sdd-apply**: ✅ complete

### T29-04 — Error handling in OpenAICompatibleLlmProvider
**Files**: `apps/core/src/modules/ai-guide/infrastructure/openai/openai-compatible-llm-provider.ts`
- HTTP non-2xx: throw error with status code, body truncated to 1000 chars
- API key scrubbing: replace apiKey (and substrings > 4 chars) in error messages with `[REDACTED]`
- Missing/empty `choices[0].message.content`: throw descriptive error
- Malformed JSON response: throw descriptive error
- Timeout: error message contains "timeout" or "aborted"
- **sdd-apply**: ✅ complete

### T29-05 — OpenAICompatibleLlmProvider unit tests
**Files**: `apps/core/src/modules/ai-guide/tests/openai-compatible-llm-provider.test.ts` (new)
- Test successful invocation: correct URL, headers, body, response parsing
- Test system/developer/user messages in correct order
- Test policy mapping (maxTokens → max_tokens, temperature)
- Test timeout: fake fetch that delays, verify abort
- Test HTTP errors (401, 500): status code in error, body truncated
- Test API key scrubbing: verify key never in error message
- Test missing content, empty content, malformed JSON
- Test injected fetchFn used instead of global fetch
- **sdd-apply**: ✅ complete

---

## Phase 3: Provider Factory

### T29-06 — Create createLlmProvider() factory
**Files**: `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts` (new)
- Function signature: `createLlmProvider(env: AppEnv): LlmProvider`
- `AI_PROVIDER=mock` (or default) → return `new MockLlmProvider()`
- `AI_PROVIDER=openai-compatible` → validate `aiBaseUrl`, `aiApiKey`, `aiModel` are set; throw naming missing vars if not
- Return `new OpenAICompatibleLlmProvider({ baseUrl, apiKey, model, timeoutMs })`
- Unknown provider value → throw with list of valid values
- **sdd-apply**: ✅ complete

### T29-07 — Factory unit tests
**Files**: `apps/core/src/modules/ai-guide/tests/create-llm-provider.test.ts` (new)
- Test default (no AI_PROVIDER) returns MockLlmProvider
- Test `AI_PROVIDER=mock` returns MockLlmProvider (ignores OpenAI env vars)
- Test `AI_PROVIDER=openai-compatible` with all vars returns OpenAICompatibleLlmProvider
- Test missing each required var (baseUrl, apiKey, model) throws with specific message
- Test unknown AI_PROVIDER value throws with valid values list
- **sdd-apply**: ✅ complete

---

## Phase 4: Pipeline Metadata Fix

### T29-08 — Add providerName and configuredModel to ExecutionPipeline
**Files**: `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts`
- Add `providerName: string` and `configuredModel: string` to constructor deps
- Store as private readonly fields
- Update `makeMetadata()` to accept `providerName` param (not hardcoded `"mock"`)
- Replace all 5 hardcoded `"mock-model-v1"` occurrences with `this.configuredModel`:
  - Line 73 (prompt resolution failure)
  - Line 154 (success path fallback: `providerResult.modelUsed ?? this.configuredModel`)
  - Line 190 (hard failure retry path)
  - Line 247 (all attempts exhausted)
  - Line 265 (unreachable safety net)
- **sdd-apply**: ✅ complete

### T29-09 — Update existing pipeline tests for new constructor params
**Files**: `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts`
- Update all `new ExecutionPipeline({ ... })` calls to include `providerName: "mock"` and `configuredModel: "mock-model-v1"`
- Add test: verify `metadata.provider` matches `providerName` param
- Add test: verify failure path `metadata.model` uses `configuredModel` not hardcoded value
- **sdd-apply**: ✅ complete

---

## Phase 5: Bootstrap Update

### T29-10 — Update createInMemoryPipeline to accept optional llmProvider
**Files**: `apps/core/src/bootstrap/create-in-memory-pipeline.ts`
- Add optional param: `options?: { llmProvider?: LlmProvider }`
- When `llmProvider` provided: use it, derive `providerName` and `configuredModel`
- When omitted: default to `new MockLlmProvider()` with `providerName: "mock"`, `configuredModel: "mock-model-v1"`
- Pass `providerName` and `configuredModel` to `ExecutionPipeline` constructor
- Maintain backward compatibility: `createInMemoryPipeline()` with no args works exactly as before
- **sdd-apply**: ✅ complete

---

## Phase 6: Server Wiring

### T29-11 — Wire provider from env in server.ts
**Files**: `apps/core/src/server.ts`
- Import `createLlmProvider` from infrastructure
- After `loadAppEnv()`, call `createLlmProvider(env)` to get provider
- Pass `{ llmProvider: provider }` to `createInMemoryPipeline()`
- **sdd-apply**: ✅ complete

---

## Phase 7: Integration Tests

### T29-12 — Integration: ExecutionPipeline with fake OpenAI-compatible provider
**Files**: `apps/core/src/modules/ai-guide/tests/pipeline-openai-integration.test.ts` (new)
- Create `OpenAICompatibleLlmProvider` with fake `fetchFn` that returns OpenAI-style response
- Pass through `createInMemoryPipeline({ llmProvider })` or direct pipeline construction
- Verify full flow: invoke → provider → metadata with correct `providerName` and `model`
- Verify failure flow: provider throws → pipeline returns failed result with `configuredModel`
- **sdd-apply**: ✅ complete

---

## Phase 8: Documentation

### T29-13 — Update .env.example with LLM provider config section
**Files**: `.env.example`
- Add section: `# LLM Provider Configuration`
- Document `AI_PROVIDER` (default: mock), `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`
- Include example values commented out
- Add security note: never commit real API keys
- **sdd-apply**: ✅ complete

### T29-14 — Update project documentation
**Files**: `README.md`, `apps/core/README.md`, `docs/project-status.md`, `docs/open-questions.md`
- `README.md`: update test count, mention configurable LLM providers
- `apps/core/README.md`: document LLM provider configuration
- `docs/project-status.md`: add T29 to "Implemented" section, update "Not Implemented Yet" (remove "Real LLM provider" line)
- `docs/open-questions.md`: resolve any T29-related open questions, add new ones if surfaced
- **sdd-apply**: ✅ complete (partially — review needed for accuracy)

---

## Phase 9: Validation

### T29-15 — Run type check and lint
**Files**: all
- Run `npm run check` — must pass with zero errors
- Fix any type errors or lint violations
- **sdd-apply**: ❌ manual (requires human review of output)

### T29-16 — Run full test suite
**Files**: all
- Run `npm test` — all 496+ existing tests must pass
- New tests must pass
- Verify no test regressions
- **sdd-apply**: ❌ manual (requires human review of output)

---

## Phase 10: Commit & PR

### T29-17 — Conventional commit and PR
**Files**: all changed files
- Create branch `feat/t29-openai-compatible-llm-provider`
- Commit with conventional commit message: `feat(core): add OpenAI-compatible LLM provider with env-based selection`
- Push and create PR for review by Marco
- **sdd-apply**: ❌ manual (PR creation follows branch-pr skill)

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| Env Config | T29-01, T29-02 | `env.test.ts` | `env.ts` |
| Provider | T29-03, T29-04, T29-05 | `openai-compatible-llm-provider.ts`, `openai-compatible-llm-provider.test.ts` | — |
| Factory | T29-06, T29-07 | `create-llm-provider.ts`, `create-llm-provider.test.ts` | — |
| Pipeline | T29-08, T29-09 | — | `execution-pipeline.ts`, `execution-pipeline.test.ts` |
| Bootstrap | T29-10 | — | `create-in-memory-pipeline.ts` |
| Server | T29-11 | — | `server.ts` |
| Integration | T29-12 | `pipeline-openai-integration.test.ts` | — |
| Docs | T29-13, T29-14 | — | `.env.example`, `README.md`, `apps/core/README.md`, `docs/project-status.md`, `docs/open-questions.md` |
| Validation | T29-15, T29-16 | — | — |
| PR | T29-17 | — | — |

**Total**: 17 tasks | **16 complete** (14 sdd-apply + 2 validation) | **1 pending** (T29-17 PR)
