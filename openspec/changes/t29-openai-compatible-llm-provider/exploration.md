# Exploration: T29 — OpenAI-Compatible LLM Provider

## 1. LlmProvider Port

**File**: `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts`

```typescript
export type LlmProvider = {
  invoke(input: {
    promptId: PromptId;
    promptVersion: number;
    systemPrompt: string;
    userPrompt: string;
    developerPrompt?: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }>;
};
```

**Analysis**: It's a type alias (not interface), following the project's DecisionAudit pattern. Single method `invoke()` that takes a structured request object and returns a Promise with content + optional metadata. The port is already clean and implementation-agnostic — perfect for adding an OpenAI-compatible adapter without any port changes.

## 2. MockLlmProvider

**File**: `apps/core/src/modules/ai-guide/infrastructure/memory/mock-llm-provider.ts`

**Construction**: `new MockLlmProvider(canned?: Map<PromptId, { content: string; tokensUsed?: number }>)`

- Accepts optional Map of canned responses keyed by `PromptId`
- Auto-seeds defaults for all 4 prompts via `primeDefaults()`
- Returns `{ content, tokensUsed, modelUsed: "mock-model-v1" }`
- Has deterministic fallback hash for unconfigured promptIds

**Analysis**: Lives in `infrastructure/memory/` — the new OpenAI provider should go in `infrastructure/openai/` (or `infrastructure/llm/`). The MockLlmProvider will remain for testing and dev.

## 3. ExecutionPipeline

**File**: `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts`

**How it uses LlmProvider**:
- Constructor: `{ provider: LlmProvider; audit?; registry; contextBuilder }`
- Calls `this.provider.invoke({ promptId, promptVersion, systemPrompt, userPrompt, developerPrompt?, policy })`
- Retry loop based on `contract.executionPolicy.retryOnFailure` and `maxRetries`

**OutputContract validation**:
- Renders `OutputContract` into `developerPrompt` via `renderOutputContract()`
- Validates response with `validateOutputContract()` — hard failure (not retried)
- Empty content is also a hard failure

**Metadata propagation**:
- `makeMetadata()` uses `providerResult.modelUsed ?? "mock-model-v1"` — so `modelUsed` IS propagated
- `tokensUsed` is passed to audit recording
- **GOTCHA**: `provider` field in metadata is hardcoded as `"mock"` in `makeMetadata()` (line 27: `provider: "mock" as const`). This will need to become dynamic when a real provider is used.

## 4. ExecutionPolicy Type

**File**: `apps/core/src/modules/ai-guide/domain/execution-policy.ts`

```typescript
export type ExecutionPolicy = {
  maxTokens: number;
  temperature: number;
  retryOnFailure: boolean;
  maxRetries: number;
  timeoutMs: number;
};
```

**Analysis**: Already has `maxTokens`, `temperature`, `retryOnFailure`, `maxRetries`, and `timeoutMs` — all the fields needed for an OpenAI-compatible provider. The `policy` is passed through to `LlmProvider.invoke()` so the real provider can use `maxTokens` and `temperature` directly. **No changes needed to ExecutionPolicy.**

## 5. SystemPrompt, DeveloperPrompt, UserPrompt

**How prompts are structured**: They are all **strings**, passed as part of the `invoke()` input object.

- `systemPrompt: string` — comes from `PromptDefinition.systemPrompt`
- `userPrompt: string` — assembled by `ExecutionPipeline.buildUserPrompt()` via `ContextBuilder`
- `developerPrompt?: string` — optional, comes from `PromptDefinition.developerPrompt` + rendered `OutputContract`

The pipeline assembles the final `developerPrompt` by joining `promptDef.developerPrompt` and `renderOutputContract(promptDef.outputContract)` with `"\n\n"`.

## 6. Bootstrap & Server

**File**: `apps/core/src/bootstrap/create-in-memory-pipeline.ts`

**How LlmProvider is created and injected**:
```typescript
const llmProvider = new MockLlmProvider();
const executionPipeline = new ExecutionPipeline({
  provider: llmProvider,
  audit: aiAudit,
  registry: promptRegistry,
  contextBuilder,
});
```

**Pipeline factory return type**:
```typescript
Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService;
  processInboundMessage: ProcessInboundMessage;
  identityResolver: InMemoryExternalIdentityResolver;
  conversationStore: InMemoryConversationStore;
  contactDirectory: InMemoryContactDirectory;
}>
```

**File**: `apps/core/src/server.ts`

- Calls `loadAppEnv()` for configuration
- Calls `createInMemoryPipeline()` for all dependencies
- Wires simulation endpoints conditionally based on `env.enableSimulationEndpoints`

**Analysis**: The factory needs to accept a parameter or read env to decide which LlmProvider to instantiate. The cleanest approach: add an `llmProvider` parameter or a factory option to `createInMemoryPipeline()`, or create a separate `createRealAiGuideService()` helper.

## 7. Env Config

**File**: `apps/core/src/config/env.ts`

```typescript
export type AppEnv = {
  host: string;
  port: number;
  environment: string;
  internalToken: string | undefined;
  enableSimulationEndpoints: boolean;
};
```

**How env is loaded**: `loadAppEnv()` reads from `process.env` with defaults. Validation: throws if PORT is not a positive integer.

**Analysis**: Need to add OpenAI-related fields to `AppEnv`:
- `openaiApiKey: string | undefined`
- `openaiBaseUrl: string | undefined` (for OpenAI-compatible providers like OpenRouter)
- `openaiModel: string | undefined`
- `llmProvider: "mock" | "openai-compatible"` (or similar selector)

## 8. Test Patterns

**File**: `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts`

**Framework**: `node:test` + `node:assert/strict` — zero external dependencies.

**Pattern**:
- Helper functions: `makeContract()`, `makeRegistry()`, `makeContextBuilder()`
- Default policy: `{ maxTokens: 256, temperature: 0.7, retryOnFailure: false, maxRetries: 0, timeoutMs: 10000 }`
- Tests use inline mock providers: `{ async invoke() { throw new Error("..."); } }`
- Tests spy on provider invocations by wrapping: `provider: { async invoke(req) { receivedDeveloperPrompt = req.developerPrompt; return mockProvider.invoke(req); } }`

**Config/env tests**: No existing config/env tests found in ai-guide. The env.ts module is only tested implicitly through server startup.

**Total test count**: 496 tests (458 core + 38 gateway-wa).

## 9. .env.example

**File**: `.env.example`

Contains: `APP_ENV`, `NODE_ENV`, `CORE_PORT`, PostgreSQL vars, `SERENA_INTERNAL_TOKEN`, WhatsApp provider vars.

**Missing for T29**: No OpenAI/LLM configuration section. Need to add:
```
# LLM Provider configuration
LLM_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## 10. OpenSpec Structure

**Directory**: `openspec/`
- `specs/` — 23 domain spec directories (source of truth)
- `changes/` — only `archive/` exists (all previous changes archived)
- **No `config.yaml`** found — the project doesn't use one yet

**Recent change pattern** (from `2026-05-04-t28-ai-guide-known-contacts-context/`):
```
exploration.md
proposal.md
specs/ai-guide-pipeline/spec.md  (delta spec)
design.md
tasks.md
apply-progress.md
verify-report.md
archive-report.md
```

**Delta spec pattern**: Creates/updates domain-specific spec files under `specs/{domain}/spec.md` with Given/When/Then scenarios.

## 11. Docs to Update

| File | Current State | What to Update |
|------|--------------|----------------|
| `README.md` | Says "Sin LLM real todavia" | Update to mention OpenAI-compatible provider |
| `apps/core/README.md` | ai-guide status: "Mock deterministico" | Update to real provider info |
| `docs/project-status.md` | "only MockLlmProvider deterministico" | Add T29 implementation details |
| `docs/ai-guide-prompts.md` | Documents prompt flow | Add provider configuration section |
| `docs/simulation-api.md` | No changes needed | — |
| `docs/open-questions.md` | "LLM provider real? Sigue pendiente" | Mark as resolved |

## Affected Areas

- `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts` — port stays AS-IS (already clean)
- `apps/core/src/modules/ai-guide/infrastructure/` — **new**: `openai-compatible-llm-provider.ts`
- `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` — **change**: `makeMetadata()` hardcoded `"mock"` → dynamic provider name
- `apps/core/src/config/env.ts` — **change**: add OpenAI env fields
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — **change**: accept or create real provider
- `.env.example` — **change**: add LLM provider config section
- `apps/core/src/modules/ai-guide/tests/` — **new**: tests for OpenAI provider
- `docs/` — multiple files for documentation updates

## Approaches

### Approach 1: OpenAI SDK-based Provider
Use `openai` npm package as the HTTP client.
- **Pros**: Type safety, built-in retry, streaming support for future
- **Cons**: Adds npm dependency (currently zero external deps in core)
- **Effort**: Medium

### Approach 2: Native fetch-based Provider (Recommended)
Use Node 22 built-in `fetch` to call OpenAI-compatible API directly.
- **Pros**: Zero new dependencies, matches existing project pattern (gateway-wa uses native fetch), simple, any OpenAI-compatible endpoint works (OpenAI, OpenRouter, local models)
- **Cons**: Manual error handling, no streaming initially
- **Effort**: Low

### Approach 3: Strategy Pattern with Provider Registry
Create a provider registry that selects between mock and real at runtime.
- **Pros**: Clean separation, easy to add more providers later
- **Cons**: Over-engineering for a single additional provider
- **Effort**: Medium-High

## Recommendation

**Approach 2 (native fetch)** is the best fit. The project has a strong convention of zero external npm dependencies in core. The `gateway-wa` module already uses native `fetch` successfully. The `LlmProvider` port is already clean and needs zero changes.

Key implementation points:
1. Create `OpenAiCompatibleLlmProvider` in `infrastructure/openai/`
2. Add env vars: `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
3. Fix `makeMetadata()` to use dynamic provider name (not hardcoded "mock")
4. Wire in `createInMemoryPipeline()` based on env config
5. Tests use native `node:test` with fake `fetch` (same pattern as gateway-wa)

## Risks

1. **`makeMetadata()` hardcoded `"mock"`**: Line 27 of execution-pipeline.ts hardcodes `provider: "mock" as const`. This MUST become dynamic or the real provider will report as "mock" in metadata and audit records.
2. **`modelUsed` fallback**: On failure paths, the pipeline hardcodes `"mock-model-v1"` as the model. Real provider errors should report the actual configured model.
3. **API key security**: Must ensure OpenAI key is never logged or included in error messages.
4. **Timeout handling**: `ExecutionPolicy.timeoutMs` exists but the current pipeline doesn't enforce it at the HTTP level. The new provider should implement `AbortSignal` with timeout.
5. **No config.yaml**: The openspec directory lacks a `config.yaml`, which the convention expects. This is a pre-existing gap, not a T29 blocker.

## Ready for Proposal

**Yes**. The codebase is well-structured for this change. The `LlmProvider` port is already clean and implementation-agnostic. `ExecutionPolicy` already has all needed fields. The only code changes are: new provider implementation, env config expansion, metadata provider name fix, and bootstrap wiring.
