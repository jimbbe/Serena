# Design: Prompt Registry for AI Guide

## Technical Approach

Clean break replacing `UseCaseContract.systemPrompt` + `inputTemplate` with a versioned `promptId` that resolves through `PromptRegistry`. `ContextBuilder` assembles user context per `ContextPolicy`. The pipeline resolves `promptId → PromptDefinition` before invoking the provider, passing both the ID and rendered text. `MockLlmProvider` keys canned responses by `promptId`, not exact prompt text — eliminating the primary code smell this change targets.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Prompt type files | (a) One file per concept vs (b) Single `prompt-types.ts` | (a) matches existing pattern (`guide-result.ts`, `execution-policy.ts`), easier to navigate | **Option (a)** — `prompt-id.ts`, `prompt-definition.ts`, `context-policy.ts`, `output-contract.ts` |
| PromptRegistry location | (a) Port in `application/ports/` + impl in `infrastructure/` vs (b) Direct impl in `application/prompts/` | (b) is simpler (no I/O), but (a) follows established port-adapter pattern (LlmProvider, AiInvocationAudit) | **Option (a) modified** — Port in `application/ports/prompt-registry.ts`, default impl in `application/prompts/in-memory-prompt-registry.ts` (no external deps justifies application-layer location) |
| ContextBuilder location | `application/prompts/context-builder.ts` | Orchestrates template rendering + context assembly; pure logic for Phase 1 (no ConversationStore/ContactDirectory yet). Constructor takes future deps as optional | **`application/prompts/context-builder.ts`** |
| LlmProvider port change | Keep `systemPrompt` + add `promptId`, `promptVersion`, `developerPrompt?` | Provider receives BOTH the ID (for logging/mocking) AND the rendered text (to invoke). Pipeline resolves, not provider | **Additive** — `invoke({ promptId, promptVersion, systemPrompt, userPrompt, developerPrompt?, policy })` |
| MockLlmProvider keying | `Map<PromptId, ...>` instead of `Map<string, ...>` (systemPrompt) | Removes fragility of exact string matching; tests configure per use-case intent | **Key by `promptId`** |
| UseCaseContract shape | `{ id, promptId, executionPolicy }` — no contextPolicy/outputContract duplication | PromptDefinition is single source of truth; contract is lean routing layer | **Contract references promptId only** |

## File Structure

```
domain/
├── prompt-id.ts               NEW    String literal union: "serena.conversation.reply.v1" | ...
├── prompt-definition.ts       NEW    { id, version, systemPrompt, inputTemplate?, developerPrompt?, contextPolicy, outputContract }
├── context-policy.ts          NEW    { maxHistoryMessages, includeCurrentMessage, includeResolvedIdentity, includeChannelMetadata, includeSafetyMemory, includeKnownContacts }
├── output-contract.ts         NEW    { format: "text" | "json" }
├── use-case-contract.ts       MOD    Remove systemPrompt/inputTemplate; add promptId
├── guide-result.ts            MOD    Add promptId, promptVersion to metadata (both branches)
├── guide-use-case-id.ts       UNCH
├── execution-policy.ts        UNCH
application/
├── ports/
│   ├── prompt-registry.ts     NEW    Type: { get(promptId): PromptDefinition | undefined; list(): PromptDefinition[] }
│   ├── llm-provider.ts        MOD    Add promptId, promptVersion, developerPrompt? to invoke input
│   └── ai-invocation-audit.ts MOD    Add promptId, promptVersion to record input
├── prompts/
│   ├── in-memory-prompt-registry.ts NEW  Class Implements PromptRegistry from Map
│   ├── context-builder.ts     NEW    Renders inputTemplate, assembles context per ContextPolicy (Phase 1: template only, future deps optional)
│   └── default-prompts.ts     NEW    PromptDefinition[] — migrated text from contracts.ts
└── use-cases/
    ├── execution-pipeline.ts  MOD    Depend on PromptRegistry + ContextBuilder; resolve promptId before invoke; pass metadata
    ├── contracts.ts           MOD    Reference promptId instead of inline strings
    ├── use-case-registry.ts   UNCH
    └── ai-guide-service.ts   UNCH
infrastructure/
└── memory/
    ├── mock-llm-provider.ts   MOD    Key Map<PromptId, ...>; invoke accepts new port shape
    └── in-memory-ai-invocation-audit.ts MOD  Store promptId, promptVersion in AuditRecord
```

**5 new, 8 modified, 3 unchanged** (16 total).

## Data Flow

```
AiGuideService.execute(useCaseId, input)
  │
  ├─► UseCaseRegistry.get(useCaseId) → UseCaseContract { promptId, executionPolicy }
  ├─► PromptRegistry.get(promptId) → PromptDefinition { systemPrompt, inputTemplate, contextPolicy, outputContract, version }
  ├─► ContextBuilder.build({ prompt, input }) → { systemPrompt, userPrompt, developerPrompt? }
  │     └─ renderTemplate(inputTemplate, input)  // Phase 1 only
  ├─► LlmProvider.invoke({ promptId, promptVersion, systemPrompt, userPrompt, developerPrompt?, policy })
  ├─► AiInvocationAudit.record({ promptId, promptVersion, useCaseId, systemPrompt, userPrompt }, result)
  └─► GuideResult { metadata: { ..., promptId, promptVersion } }
```

## Interface Changes

### `UseCaseContract` (domain)
```ts
// OLD
{ id: GuideUseCaseId; systemPrompt: string; inputTemplate: string; outputSchemaName: string; executionPolicy: ExecutionPolicy }
// NEW
{ id: GuideUseCaseId; promptId: PromptId; executionPolicy: ExecutionPolicy }
```

### `GuideResult` metadata (both branches)
```ts
// ADD to existing metadata
promptId: PromptId;
promptVersion: string;
```

### `LlmProvider.invoke` input
```ts
// ADD fields
promptId: PromptId;
promptVersion: string;
developerPrompt?: string;
// KEEP: systemPrompt, userPrompt, policy
```

### `AiInvocationAudit.record` input
```ts
// ADD fields
promptId: PromptId;
promptVersion: string;
// KEEP: useCaseId, systemPrompt, userPrompt
```

### `AuditRecord` (infrastructure)
```ts
// ADD fields
promptId: PromptId;
promptVersion: string;
```

### `MockLlmProvider` canned responses
```ts
// OLD: Map<string, { content, tokensUsed }>  keyed by systemPrompt
// NEW: Map<PromptId, { content, tokensUsed }>  keyed by promptId
```

## Testing Strategy

| What | Where | Approach |
|------|-------|----------|
| PromptRegistry CRUD | NEW `tests/prompt-registry.test.ts` | Register, get by ID, get unknown, list |
| ContextBuilder assembly | NEW `tests/context-builder.test.ts` | Template interpolation, empty deps, all 4 policy combos |
| ContextPolicy validation | NEW `tests/context-policy.test.ts` | Boundary values, invalid configs |
| Pipeline with resolved prompts | MOD `execution-pipeline.test.ts` | makeContract uses promptId; cannedResponses key by promptId; empty-result test updated |
| Mock provider keying | MOD `mock-llm-provider.test.ts` | Replace systemPrompt keying with promptId |
| Audit records | MOD `in-memory-ai-invocation-audit.test.ts` | Assert promptId/promptVersion in records |
| Service integration | MOD `ai-guide-service.test.ts` | Factory updated to promptId-based contracts |
| Registry contracts | MOD `use-case-registry.test.ts` | Factory updated to promptId-based contracts |

All 28 existing tests + 3 new test files. Run: `npm run -w @serena/core test`.

## Risk Mitigation

| Risk (from probe) | Mitigation |
|-------------------|-----------|
| All 28 tests break simultaneously | Update `makeContract()` helpers first per test file; cascade from domain types outward |
| contracts.ts prompt text migration | Copy verbatim to `default-prompts.ts` — text content unchanged, only location moves |
| Template rendering moves to ContextBuilder | Identical `renderTemplate` regex logic, extracted and tested independently |
| Circular dependency | PromptRegistry port depends only on domain types; ContextBuilder depends only on domain types + optional future ports |
| `outputSchemaName` removal | Replaced by `outputContract.format` in PromptDefinition; no consumer currently reads `outputSchemaName` dynamically |

## Next Recommended

**tasks** — Ready for implementation checklist.
