# Proposal: T29 — OpenAI-Compatible LLM Provider

## Intent

Serena currently uses only `MockLlmProvider` for all LLM calls — no real AI is available. This change adds a configurable `OpenAICompatibleLlmProvider` behind the existing `LlmProvider` port, enabling Serena to call any OpenAI-compatible API (OpenAI, OpenRouter, local models) without SDK dependencies, while keeping mock as the safe default for tests and dev.

## Scope

### In Scope
- New `OpenAICompatibleLlmProvider` implementing `LlmProvider` port (native `fetch`, zero SDK deps)
- Provider factory (`createLlmProvider`) selecting mock or real based on env
- Env config expansion: `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`
- Bootstrap wiring: `createInMemoryPipeline` accepts optional provider/appEnv; `server.ts` uses `loadAppEnv()`
- Fix `makeMetadata()` provider name: hardcoded `"mock"` → dynamic from provider
- Tests: provider unit tests (fake `fetchFn`), config selection tests, integration with ExecutionPipeline
- Documentation: `.env.example`, `README.md`, `apps/core/README.md`, `docs/project-status.md`, `docs/ai-guide-prompts.md`, `docs/open-questions.md`

### Out of Scope
- Streaming support (future)
- Retry logic at provider level (pipeline already handles retries)
- Token counting beyond `usage.total_tokens` from response
- Real WhatsApp integration (separate task)
- PostgreSQL persistence (separate task)
- Multiple provider support beyond mock + openai-compatible

## Capabilities

### New Capabilities
- `openai-compatible-provider`: OpenAI-compatible HTTP LLM provider using native fetch, with timeout, error handling, and secure API key management

### Modified Capabilities
- `ai-guide-pipeline`: `makeMetadata()` provider name changes from hardcoded `"mock"` to dynamic value reflecting actual provider in use
- `ai-guide-mocks`: No requirement changes — MockLlmProvider remains default and fully functional

## Approach

1. **Native fetch provider** — `OpenAICompatibleLlmProvider` calls `${baseUrl}/chat/completions` with standard OpenAI request format. Constructor accepts `{ baseUrl, apiKey, model, timeoutMs, fetchFn? }`. Uses `AbortController` for timeout. No SDK dependency.
2. **Factory pattern** — `createLlmProvider(appEnv)` reads `AI_PROVIDER` env var and returns the appropriate implementation. Unknown values throw. Mock ignores AI_API_KEY/AI_BASE_URL/AI_MODEL.
3. **Env expansion** — Add `aiProvider`, `aiBasePath`, `aiApiKey`, `aiModel`, `aiTimeoutMs` to `AppEnv` type with validation rules.
4. **Bootstrap wiring** — `createInMemoryPipeline` accepts optional `llmProvider` parameter (defaults to mock). `server.ts` creates provider via factory using `loadAppEnv()`.
5. **Metadata fix** — `ExecutionPipeline.makeMetadata()` receives provider name dynamically instead of hardcoding `"mock"`.
6. **Security** — API key never logged, never included in error messages. Error bodies truncated to 1000 chars with key scrubbing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/ai-guide/infrastructure/openai-compatible/openai-compatible-llm-provider.ts` | New | OpenAI-compatible provider implementation |
| `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts` | New | Provider factory |
| `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` | Modified | Dynamic provider name in `makeMetadata()` |
| `apps/core/src/config/env.ts` | Modified | Add AI provider env fields to `AppEnv` |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Accept optional llmProvider parameter |
| `apps/core/src/server.ts` | Modified | Wire real provider via factory + `loadAppEnv()` |
| `apps/core/src/modules/ai-guide/tests/openai-compatible-llm-provider.test.ts` | New | Provider unit tests with fake fetch |
| `.env.example` | Modified | Add LLM provider config section |
| `README.md`, `apps/core/README.md`, `docs/` | Modified | Documentation updates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API key leak in logs/errors | Low | Never log apiKey; scrub from error messages; truncate body to 1000 chars |
| Provider name still hardcoded "mock" in metadata | Low | Explicit test verifying dynamic provider name in metadata |
| Timeout not enforced at HTTP level | Low | `AbortController` with `setTimeout` in provider implementation |
| Breaking existing tests that expect mock | Low | Mock stays default; all existing tests unchanged |
| Invalid env config causes runtime crash | Med | Validation at startup with clear error messages; defaults to mock |

## Rollback Plan

1. Revert `AI_PROVIDER` env var to `mock` (default) — no code changes needed
2. If issues persist, git revert the entire change branch — `MockLlmProvider` remains untouched and fully functional as the default
3. No database migrations or external state to clean up

## Dependencies

- None — uses Node.js built-in `fetch` (available in Node 22+)
- Existing `LlmProvider` port (already clean, no changes needed)
- Existing `ExecutionPolicy` type (already has `timeoutMs`, no changes needed)

## Success Criteria

- [ ] `OpenAICompatibleLlmProvider` implements `LlmProvider` port and passes all unit tests with fake `fetchFn`
- [ ] `AI_PROVIDER=mock` (default) → MockLlmProvider used, no env vars required
- [ ] `AI_PROVIDER=openai-compatible` with valid config → real provider used
- [ ] Missing required env vars for openai-compatible → clear startup error
- [ ] API key never appears in logs, errors, or test output
- [ ] `makeMetadata()` reports correct provider name (not hardcoded "mock")
- [ ] `npm run check` passes (type-check + lint)
- [ ] `npm test` passes (all 496+ existing tests + new tests)
- [ ] Documentation updated across all specified files
