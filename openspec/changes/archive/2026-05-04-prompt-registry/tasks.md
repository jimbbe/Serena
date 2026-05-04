# Tasks: Prompt Registry for AI Guide

**Change**: `prompt-registry`
**Branch**: `feat/t23-prompt-registry`
**Status**: implemented

---

## T23-01 ✅: Create PromptId domain type

**Description**: Create `PromptId` as a TypeScript string literal union with versioned dot-notation IDs. Must match the existing `GuideUseCaseId` pattern. Must include all 4 prompt IDs: `serena.conversation.reply.v1`, `serena.risk.review.v1`, `serena.mediation.understand_request.v1`, `serena.mediation.clarify.v1`.

**Files**:
- `apps/core/src/modules/ai-guide/domain/prompt-id.ts` (NEW)

**REQs**: REQ-1 (R1.1, R1.2)

**Verification**: `PromptId` type accepts valid IDs and rejects non-versioned strings at compile time.

---

## T23-02 ✅: Create ContextPolicy domain type

**Description**: Create `ContextPolicy` type with the 8 fields from spec REQ-4. All booleans required except `maxRecentMessages` and `notes` which are optional.

**Files**:
- `apps/core/src/modules/ai-guide/domain/context-policy.ts` (NEW)

**REQs**: REQ-4 (R4.1, R4.2)

**Verification**: Type compiles in strict mode; all fields match spec shape.

---

## T23-03 ✅: Create OutputContract domain type

**Description**: Create `OutputContract` type with `{ format: "text" | "json" }`.

**Files**:
- `apps/core/src/modules/ai-guide/domain/output-contract.ts` (NEW)

**REQs**: REQ-1 (R1.7)

**Verification**: Type compiles; accepts only "text" or "json".

---

## T23-04 ✅: Create PromptDefinition domain type

**Description**: Create `PromptDefinition` type following the DESIGN's shape with spec fields included.

**Files**:
- `apps/core/src/modules/ai-guide/domain/prompt-definition.ts` (NEW)

**REQs**: REQ-1 (R1.3, R1.4, R1.5, R1.6, R1.7, R1.8)

**Verification**: Type compiles; all spec fields are covered; matches design's coherent shape.

---

## T23-05 ✅: Update UseCaseContract domain type

**Description**: Modify `UseCaseContract` to replace `systemPrompt`, `inputTemplate`, and `outputSchemaName` with `promptId: PromptId`.

**Files**:
- `apps/core/src/modules/ai-guide/domain/use-case-contract.ts` (MOD)

**REQs**: REQ-3 (R3.1, R3.4, R3.5)

**Verification**: Type compiles; no `systemPrompt`, `inputTemplate`, or `outputSchemaName` fields; has `promptId`.

---

## T23-06 ✅: Update GuideResult metadata

**Description**: Add `promptId: PromptId` and `promptVersion: number` to the metadata type in both `GuideResultSuccess` and `GuideResultFailed`.

**Files**:
- `apps/core/src/modules/ai-guide/domain/guide-result.ts` (MOD)

**REQs**: REQ-8 (R8.1, R8.2, R8.3, R8.4, R8.5)

**Verification**: Both metadata types include `promptId` and `promptVersion`; existing fields preserved.

---

## T23-07 ✅: Create PromptRegistry port

**Description**: Create `PromptRegistry` port as a type alias.

**Files**:
- `apps/core/src/modules/ai-guide/application/ports/prompt-registry.ts` (NEW)

**REQs**: REQ-2 (R2.1, R2.2, R2.3, R2.5, R2.7)

**Verification**: Port type compiles; depends only on domain types.

---

## T23-08 ✅: Create InMemoryPromptRegistry implementation

**Description**: Create `InMemoryPromptRegistry` class implementing `PromptRegistry`.

**Files**:
- `apps/core/src/modules/ai-guide/application/prompts/in-memory-prompt-registry.ts` (NEW)

**REQs**: REQ-2 (R2.2, R2.3, R2.4, R2.5, R2.6, R2.7)

**Verification**: Throws on duplicate IDs; returns correct prompt by ID; throws with promptId for missing; list returns all.

---

## T23-09 ✅: Create ContextBuilder

**Description**: Create `ContextBuilder` class in `application/prompts/`.

**Files**:
- `apps/core/src/modules/ai-guide/application/prompts/context-builder.ts` (NEW)

**REQs**: REQ-5 (R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R5.8)

**Verification**: Builds string from policy flags; respects maxRecentMessages; handles missing data; no infra deps.

---

## T23-10 ✅: Create default prompts

**Description**: Create `defaultPrompts: PromptDefinition[]` array with all 4 prompts migrated verbatim from `contracts.ts`.

**Files**:
- `apps/core/src/modules/ai-guide/application/prompts/default-prompts.ts` (NEW)

**REQs**: REQ-6 (R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7), REQ-4 (R4.3, R4.4, R4.6)

**Verification**: 4 prompts; correct IDs; correct useCaseId mappings; correct outputContract; correct contextPolicy values; text copied verbatim from contracts.ts.

---

## T23-11 ✅: Update LlmProvider port

**Description**: Modify `LlmProvider.invoke` input to add `promptId: PromptId`, `promptVersion: number`, and `developerPrompt?: string`.

**Files**:
- `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts` (MOD)

**REQs**: REQ-7 (R7.2, R7.3)

**Verification**: Port type compiles; includes new fields; backward compatible with existing fields.

---

## T23-12 ✅: Update AiInvocationAudit port

**Description**: Modify `AiInvocationAudit.record` input: replace `systemPrompt` with `promptId` and `promptVersion`.

**Files**:
- `apps/core/src/modules/ai-guide/application/ports/ai-invocation-audit.ts` (MOD)

**REQs**: REQ-9 (R9.1, R9.3)

**Verification**: Port type compiles; `systemPrompt` removed from input; `promptId` and `promptVersion` added.

---

## T23-13 ✅: Update ExecutionPipeline

**Description**: Modify `ExecutionPipeline` to depend on `PromptRegistry` and `ContextBuilder`.

**Files**:
- `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` (MOD)

**REQs**: REQ-7 (R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R7.7), REQ-8 (R8.1, R8.2)

**Verification**: Pipeline resolves prompt from registry; uses ContextBuilder; passes promptId/version to provider and audit; metadata includes prompt fields; fails gracefully for missing prompts.

---

## T23-14 ✅: Update contracts.ts

**Description**: Replace inline `systemPrompt`/`inputTemplate`/`outputSchemaName` with `promptId` references. Added `serena.mediation.clarify` contract.

**Files**:
- `apps/core/src/modules/ai-guide/application/use-cases/contracts.ts` (MOD)

**REQs**: REQ-3 (R3.1, R3.5), REQ-6 (R6.1)

**Verification**: All contracts have valid `promptId`; no `systemPrompt`/`inputTemplate`/`outputSchemaName` fields; contracts reference correct promptIds.

---

## T23-15 ✅: Update MockLlmProvider

**Description**: Change `MockLlmProvider` to key canned responses by `PromptId` instead of `systemPrompt`.

**Files**:
- `apps/core/src/modules/ai-guide/infrastructure/memory/mock-llm-provider.ts` (MOD)

**REQs**: REQ-10 (R10.1, R10.2, R10.3, R10.4, R10.5, R10.6)

**Verification**: Keys by promptId not systemPrompt; fallback uses promptId+userPrompt; backward compatible; implements updated LlmProvider port.

---

## T23-16 ✅: Update InMemoryAiInvocationAudit

**Description**: Update `AuditRecord` type: remove `systemPrompt`, add `promptId: PromptId` and `promptVersion: number`.

**Files**:
- `apps/core/src/modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts` (MOD)

**REQs**: REQ-9 (R9.2, R9.4, R9.5)

**Verification**: AuditRecord has no systemPrompt; has promptId and promptVersion; record() accepts new input shape.

---

## T23-17 ✅: Test PromptRegistry

**Description**: Create test file for `InMemoryPromptRegistry`.

**Files**:
- `apps/core/src/modules/ai-guide/tests/prompt-registry.test.ts` (NEW)

**REQs**: REQ-2 (all scenarios), REQ-11 (R11.1, R11.2)

**Verification**: All tests pass with `npm run -w @serena/core test` (6 tests).

---

## T23-18 ✅: Test ContextBuilder

**Description**: Create test file for `ContextBuilder`.

**Files**:
- `apps/core/src/modules/ai-guide/tests/context-builder.test.ts` (NEW)

**REQs**: REQ-5 (all scenarios), REQ-11 (R11.9, R11.10)

**Verification**: All tests pass (10 tests).

---

## T23-19 ✅: Test ContextPolicy

**Description**: Create test file validating ContextPolicy configurations.

**Files**:
- `apps/core/src/modules/ai-guide/tests/context-policy.test.ts` (NEW)

**REQs**: REQ-4 (all scenarios), REQ-11 (R11.4)

**Verification**: All tests pass (12 tests).

---

## T23-20 ✅: Update execution-pipeline tests

**Description**: Update `execution-pipeline.test.ts` with promptId-based contracts and registry/ContextBuilder deps.

**Files**:
- `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` (MOD)

**REQs**: REQ-7 (all scenarios), REQ-8 (all scenarios), REQ-11 (R11.7, R11.8)

**Verification**: All tests pass; metadata assertions for promptId/promptVersion; registry resolution tested.

---

## T23-21 ✅: Update mock-llm-provider tests

**Description**: Update `mock-llm-provider.test.ts` with promptId keying.

**Files**:
- `apps/core/src/modules/ai-guide/tests/mock-llm-provider.test.ts` (MOD)

**REQs**: REQ-10 (all scenarios), REQ-11 (R11.11)

**Verification**: All tests pass; keying is by promptId not systemPrompt; fallback is deterministic.

---

## T23-22 ✅: Update in-memory-ai-invocation-audit tests

**Description**: Update `in-memory-ai-invocation-audit.test.ts` with promptId/promptVersion in record calls.

**Files**:
- `apps/core/src/modules/ai-guide/tests/in-memory-ai-invocation-audit.test.ts` (MOD)

**REQs**: REQ-9 (all scenarios), REQ-11 (R11.3)

**Verification**: All tests pass; records contain promptId/promptVersion; no systemPrompt field.

---

## T23-23 ✅: Update ai-guide-service tests

**Description**: Update `ai-guide-service.test.ts` with promptId-based contracts and PromptRegistry.

**Files**:
- `apps/core/src/modules/ai-guide/tests/ai-guide-service.test.ts` (MOD)

**REQs**: REQ-11 (R11.7, R11.8)

**Verification**: All tests pass; service loads correct prompt from registry.

---

## T23-24 ✅: Update use-case-registry tests

**Description**: Update `use-case-registry.test.ts` with promptId instead of systemPrompt/inputTemplate/outputSchemaName.

**Files**:
- `apps/core/src/modules/ai-guide/tests/use-case-registry.test.ts` (MOD)

**REQs**: REQ-11 (R11.3, R11.4)

**Verification**: All tests pass; contracts have valid promptId.

---

## T23-25 ✅: Create AI Guide Prompts documentation

**Description**: Create `docs/ai-guide-prompts.md` as authoritative documentation.

**Files**:
- `docs/ai-guide-prompts.md` (NEW)

**REQs**: REQ-12 (R12.1, R12.2, R12.3, R12.4, R12.5, R12.6, R12.7, R12.8, R12.9, R12.10)

**Verification**: File exists and is non-empty; contains all required sections.

---

## T23-26 ✅: Run full test suite and type check

**Description**: `npm run -w @serena/core test` — 334 tests pass, 0 fail. `npm run check` — 0 errors.

**Files**: All modified files

**REQs**: NFR-1, NFR-2, NFR-3, NFR-6, NFR-7

**Verification**: `npm run -w @serena/core test` passes with zero failures; `npm run check` passes with zero errors.
