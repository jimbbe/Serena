# Exploration: prompt-registry

## Current State

The `ai-guide` module follows Clean/Hexagonal architecture with three layers:

**Domain** (`domain/`):
- `GuideUseCaseId` — 4-value string union literal
- `ExecutionPolicy` — maxTokens, temperature, retry, timeout
- `UseCaseContract` — id + systemPrompt + inputTemplate + outputSchemaName + executionPolicy
- `GuideResult` — discriminated union (success/failed) with metadata

**Application** (`application/`):
- `UseCaseRegistry` — Map-based register/get/getAll
- `ExecutionPipeline` — template rendering, retry loop, audit recording, calls `LlmProvider.invoke({ systemPrompt, userPrompt, policy })`
- `AiGuideService` — facade that looks up contract by useCaseId, delegates to pipeline
- Ports: `LlmProvider` (invoke with raw systemPrompt string), `AiInvocationAudit` (record with systemPrompt string)
- `contracts.ts` — hardcoded default contracts with inline prompt text

**Infrastructure** (`infrastructure/`):
- `MockLlmProvider` — keys canned responses by exact `systemPrompt` text match
- `InMemoryAiInvocationAudit` — stores systemPrompt verbatim in audit records

**Tests** (`tests/`):
- 28 tests total across 5 test files
- Tests construct `UseCaseContract` inline with `systemPrompt` and `inputTemplate`
- `MockLlmProvider` tests specifically verify canned responses keyed by systemPrompt text
- `execution-pipeline.test.ts` has a test that sets canned response by exact systemPrompt string to force empty-content failure path

### Architecture Map

```
┌─────────────────────────────────────────────────────────┐
│  DOMAIN                                                   │
│  GuideUseCaseId | ExecutionPolicy | UseCaseContract      │
│  GuideResult                                             │
├─────────────────────────────────────────────────────────┤
│  APPLICATION                                              │
│  UseCaseRegistry ──> Map<GuideUseCaseId, UseCaseContract>│
│  ExecutionPipeline ──> LlmProvider.invoke(systemPrompt)  │
│  AiGuideService ──> registry.get(id) → pipeline.execute  │
│  Ports: LlmProvider, AiInvocationAudit                   │
├─────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                           │
│  MockLlmProvider ──> cannedResponses.get(systemPrompt)   │
│  InMemoryAiInvocationAudit ──> stores systemPrompt       │
├─────────────────────────────────────────────────────────┤
│  TESTS                                                    │
│  28 tests: registry, pipeline, service, mock, audit      │
└─────────────────────────────────────────────────────────┘
```

## Affected Areas

| Layer | File | Why Affected |
|-------|------|-------------|
| **Domain** | `domain/use-case-contract.ts` | Replace `systemPrompt` + `inputTemplate` with `promptId` |
| **Domain** | `domain/guide-result.ts` | Add `promptId`, `promptVersion` to metadata |
| **Domain** | NEW: `domain/prompt-id.ts` | New type: versioned prompt identifier |
| **Domain** | NEW: `domain/context-policy.ts` | New type: what context the model receives |
| **Domain** | NEW: `domain/output-contract.ts` | New type: expected output format |
| **Application** | NEW: `application/ports/prompt-registry.ts` | Port: get prompt by promptId |
| **Application** | NEW: `application/prompt/context-builder.ts` | Builds input per ContextPolicy |
| **Application** | `application/use-cases/execution-pipeline.ts` | Load prompt from registry, use ContextBuilder |
| **Application** | `application/use-cases/contracts.ts` | Reference promptId instead of inline text |
| **Application** | `application/ports/llm-provider.ts` | Change input from `systemPrompt` to `promptId` |
| **Application** | `application/ports/ai-invocation-audit.ts` | Add `promptId`, `promptVersion` to input |
| **Infrastructure** | `infrastructure/memory/mock-llm-provider.ts` | Key by useCaseId/promptId, not systemPrompt text |
| **Infrastructure** | `infrastructure/memory/in-memory-ai-invocation-audit.ts` | Store promptId/promptVersion in records |
| **Infrastructure** | NEW: `infrastructure/memory/in-memory-prompt-registry.ts` | Default implementation of PromptRegistry |
| **Tests** | All 5 test files | Update contract factories, mock provider usage |

## Approaches

### Approach 1: Incremental — Add promptId alongside existing fields (backward compatible)

Add `promptId` and `promptVersion` as optional fields to `UseCaseContract`. Keep `systemPrompt` and `inputTemplate` as fallback. Pipeline checks for `promptId` first, falls back to inline text.

- **Pros**: Zero breaking changes, tests pass immediately, gradual migration
- **Cons**: Dual code paths in pipeline, technical debt, `UseCaseContract` grows bloated
- **Effort**: Low
- **Risk**: Low but leaves dead code paths

### Approach 2: Clean break — Replace systemPrompt/inputTemplate with promptId (recommended)

Remove `systemPrompt` and `inputTemplate` from `UseCaseContract`. Add `promptId`. Create `PromptRegistry` domain concept. `ContextPolicy` replaces `inputTemplate`. `OutputContract` replaces `outputSchemaName`. Update all consumers.

- **Pros**: Clean architecture, single source of truth for prompts, versioned prompts, no dual paths
- **Cons**: All tests must be updated simultaneously, more files to create
- **Effort**: Medium
- **Risk**: Medium — test breakage is guaranteed but contained

### Approach 3: Hybrid — PromptRegistry as separate concern, UseCaseContract references it

Keep `UseCaseContract` mostly as-is but add `promptId`. The `PromptRegistry` stores full prompt definitions. Pipeline resolves promptId to get systemPrompt + template + contextPolicy. `ContextPolicy` and `OutputContract` are separate domain types.

- **Pros**: Separation of concerns, UseCaseContract stays lean, prompts are independently versionable
- **Cons**: Two lookups per execution (contract + prompt), slightly more indirection
- **Effort**: Medium
- **Risk**: Medium

## Recommendation

**Approach 2 (Clean break)** with elements of Approach 3. Rationale:

1. The current codebase is small (28 tests, ~600 LOC in ai-guide). A clean break is feasible and avoids accumulating technical debt.
2. Versioned prompts (`serena.conversation.reply.v1`) are a first-class domain concept — they should not be an afterthought field.
3. `ContextPolicy` decouples "what context the model receives" from the template string — this is architecturally cleaner.
4. The `MockLlmProvider` keyed by prompt text is a code smell; keying by `useCaseId` or `promptId` is the correct behavior for a mock.

### Proposed File Structure

```
domain/
  prompt-id.ts          ← type: "serena.conversation.reply.v1" (string literal union)
  context-policy.ts     ← type: { includeHistory?: boolean; includeSenderContext?: boolean; ... }
  output-contract.ts    ← type: { format: "text" | "json"; schemaName: string }
  use-case-contract.ts  ← modified: promptId, contextPolicy, outputContract, executionPolicy
  guide-result.ts       ← modified: metadata adds promptId, promptVersion
  guide-use-case-id.ts  ← unchanged
  execution-policy.ts   ← unchanged

application/
  ports/
    prompt-registry.ts  ← port: get(promptId) → PromptDefinition
    llm-provider.ts     ← modified: invoke({ promptId, userPrompt, policy })
    ai-invocation-audit.ts ← modified: input adds promptId, promptVersion
  prompt/
    context-builder.ts  ← builds input string per ContextPolicy
  use-cases/
    execution-pipeline.ts ← modified: resolves promptId, uses ContextBuilder
    contracts.ts        ← modified: references promptId
    use-case-registry.ts  ← unchanged
    ai-guide-service.ts   ← unchanged

infrastructure/
  memory/
    in-memory-prompt-registry.ts ← default PromptRegistry implementation
    mock-llm-provider.ts  ← modified: key by useCaseId, not systemPrompt
    in-memory-ai-invocation-audit.ts ← modified: store promptId/promptVersion
```

### Minimal Set of New Files (5)

1. `domain/prompt-id.ts` — type definition for versioned prompt identifiers
2. `domain/context-policy.ts` — type for per-use-case context configuration
3. `domain/output-contract.ts` — type for expected output format
4. `application/ports/prompt-registry.ts` — port interface
5. `application/prompt/context-builder.ts` — context building logic
6. `infrastructure/memory/in-memory-prompt-registry.ts` — default implementation

### Key Design Decisions

**PromptId format**: Use dot-notation with version suffix: `serena.conversation.reply.v1`. This is a string literal union, not a branded type — consistent with `GuideUseCaseId` pattern.

**PromptRegistry port**: Simple `get(promptId: PromptId): PromptDefinition | undefined`. No external deps, deterministic. `PromptDefinition` contains `systemPrompt`, `version`, and optionally `inputTemplate`.

**ContextPolicy**: Keep it simple for now — a record of boolean flags for what context to include (e.g., `includeSenderName`, `includeConversationHistory`, `includeMediationContext`). The `ContextBuilder` reads the policy and assembles the user prompt.

**LlmProvider port change**: Change from `invoke({ systemPrompt, userPrompt, policy })` to `invoke({ promptId, userPrompt, policy })`. The provider implementation (real or mock) resolves the prompt internally. For the mock, this means keying by `promptId` or `useCaseId` instead of raw text.

**MockLlmProvider refactor**: Key canned responses by `useCaseId` (which is already available in the contract) or by `promptId`. This is cleaner because tests configure "what response to return for this use case" rather than "what response to return for this exact prompt text." The fallback deterministic hash can use `promptId + userPrompt` instead of `systemPrompt + userPrompt`.

**Audit changes**: Add `promptId` and `promptVersion` to both the input and the stored `AuditRecord`. This enables auditing which prompt version produced which output — critical for safety in a companion app for elderly users.

## Risks

1. **Test breakage**: ALL 28 tests will need updates because they construct contracts with `systemPrompt` and `inputTemplate`. The `makeContract` helper in each test file must change. The canned response test in `execution-pipeline.test.ts` that keys by exact systemPrompt text will need to use the new mock keying strategy.

2. **contracts.ts migration**: The 3 default contracts have inline Spanish prompts. These need to move to the `InMemoryPromptRegistry` as `PromptDefinition` entries. The prompt text itself does not change — only where it lives.

3. **Template rendering location**: Currently `ExecutionPipeline.renderTemplate` interpolates `inputTemplate`. With `ContextPolicy`, this logic moves to `ContextBuilder`. The interpolation mechanism stays the same but the assembly of context changes.

4. **GuideResult metadata**: Adding `promptId` and `promptVersion` to metadata is additive and backward-compatible for consumers that only read `provider`, `model`, `attempts`.

5. **LlmProvider port contract change**: Any future real LLM provider implementation will need to accept `promptId` instead of `systemPrompt`. Since no real provider exists yet, this is low risk.

6. **Circular dependency risk**: `ContextBuilder` needs `ContextPolicy` (domain) but should not depend on infrastructure. Keep it in `application/prompt/` as pure logic.

## Next Recommended

**proposal** — The exploration is complete. The recommended approach is a clean break (Approach 2) with 6 new files and 8 modified files. The scope is well-defined and contained within the `ai-guide` module. No cross-module dependencies are affected.
