# Apply Progress: prompt-registry

**Status**: complete
**Date**: Sun May 03 2026
**Tasks Completed**: 26/26

---

## Completed Tasks

| Task | Description | Status |
|------|-------------|--------|
| T23-01 | Create PromptId domain type | ✅ |
| T23-02 | Create ContextPolicy domain type | ✅ |
| T23-03 | Create OutputContract domain type | ✅ |
| T23-04 | Create PromptDefinition domain type | ✅ |
| T23-05 | Update UseCaseContract domain type | ✅ |
| T23-06 | Update GuideResult metadata | ✅ |
| T23-07 | Create PromptRegistry port | ✅ |
| T23-08 | Create InMemoryPromptRegistry | ✅ |
| T23-09 | Create ContextBuilder | ✅ |
| T23-10 | Create default prompts | ✅ |
| T23-11 | Update LlmProvider port | ✅ |
| T23-12 | Update AiInvocationAudit port | ✅ |
| T23-13 | Update ExecutionPipeline | ✅ |
| T23-14 | Update contracts.ts | ✅ |
| T23-15 | Update MockLlmProvider | ✅ |
| T23-16 | Update InMemoryAiInvocationAudit | ✅ |
| T23-17 | Test PromptRegistry | ✅ |
| T23-18 | Test ContextBuilder | ✅ |
| T23-19 | Test ContextPolicy | ✅ |
| T23-20 | Update execution-pipeline tests | ✅ |
| T23-21 | Update mock-llm-provider tests | ✅ |
| T23-22 | Update in-memory-ai-invocation-audit tests | ✅ |
| T23-23 | Update ai-guide-service tests | ✅ |
| T23-24 | Update use-case-registry tests | ✅ |
| T23-25 | Create documentation | ✅ |
| T23-26 | Run full test suite and type check | ✅ |

## Validation Results

- **TypeScript strict mode**: `npm run check` — **0 errors**
- **Tests**: `npm run -w @serena/core test` — **334 pass, 0 fail**
- **New test files**: 3 (prompt-registry.test.ts, context-builder.test.ts, context-policy.test.ts)
- **Modified test files**: 5 (execution-pipeline, ai-guide-service, mock-llm-provider, in-memory-ai-invocation-audit, use-case-registry)

## Files Changed

### New Files (9)
- `domain/prompt-id.ts`
- `domain/context-policy.ts`
- `domain/output-contract.ts`
- `domain/prompt-definition.ts`
- `application/ports/prompt-registry.ts`
- `application/prompts/in-memory-prompt-registry.ts`
- `application/prompts/context-builder.ts`
- `application/prompts/default-prompts.ts`
- `docs/ai-guide-prompts.md`

### New Test Files (3)
- `tests/prompt-registry.test.ts`
- `tests/context-builder.test.ts`
- `tests/context-policy.test.ts`

### Modified Files (11)
- `domain/use-case-contract.ts`
- `domain/guide-result.ts`
- `application/ports/llm-provider.ts`
- `application/ports/ai-invocation-audit.ts`
- `application/use-cases/execution-pipeline.ts`
- `application/use-cases/contracts.ts`
- `infrastructure/memory/mock-llm-provider.ts`
- `infrastructure/memory/in-memory-ai-invocation-audit.ts`
- `bootstrap/create-in-memory-pipeline.ts`
- `bootstrap/tests/scenario-endpoint.test.ts`
- `inbound-gate/tests/process-channel-inbound-message.test.ts`

### Modified Test Files (5)
- `tests/execution-pipeline.test.ts`
- `tests/ai-guide-service.test.ts`
- `tests/mock-llm-provider.test.ts`
- `tests/in-memory-ai-invocation-audit.test.ts`
- `tests/use-case-registry.test.ts`

## Deviations from Design

None — implementation matches design. Minor adjustments:
- ExecutionPipeline wraps `resolvePrompt()` in try/catch to return `GuideResultFailed` instead of throwing uncaught errors for missing prompts.
- Cross-module test files (scenario-endpoint, process-channel-inbound-message) also needed metadata updates due to GuideResult shape change.

## Issues Found

- `exactOptionalPropertyTypes` requires explicit `undefined` check when spreading optional properties like `developerPrompt`.
- `||` and `??` cannot be mixed without parentheses in TypeScript.
- Single-character message test needed fix: `assert.ok(!output.includes("a"))` failed because "a" appeared in section headers like "Historial" / "Mensajes".

## Next Recommended

`sdd-verify` — Validate implementation against specs and design.
