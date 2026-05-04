# Archive Report: prompt-registry

**Change**: `prompt-registry`
**Change ID**: T23
**Branch**: `feat/t23-prompt-registry`
**Archived**: 2026-05-04
**SDD Cycle**: Full (explore → propose → spec → design → tasks → apply → verify → archive)

---

## Executive Summary

The `prompt-registry` change replaced fragile inline `systemPrompt` + `inputTemplate` strings in `UseCaseContract` with a versioned `PromptId` → `PromptRegistry` → `ContextBuilder` pipeline in the `ai-guide` module. This eliminates the code smell of `MockLlmProvider` keying canned responses by exact prompt text and enables auditable prompt versioning.

- **9 new source files**, **3 new test files**, **11 modified source files**, **5 modified test files**
- **334 tests pass** (28 existing + 3 new test files + cross-module)
- **`npm run check`**: 0 errors
- **Verification**: PASS, no blocking issues

---

## Artifacts

### Archive Contents (`openspec/changes/archive/2026-05-04-prompt-registry/`)

| Artifact | Path | Status |
|----------|------|--------|
| Exploration | `explore.md` | ✅ |
| Proposal | `proposal.md` | ✅ |
| Delta Spec | `spec.md` | ✅ |
| Design | `design.md` | ✅ |
| Tasks | `tasks.md` | ✅ (26/26 tasks complete) |
| Apply Progress | `apply-progress.md` | ✅ |
| Verify Report | `verify-report.md` | ✅ |
| Archive Report | `archive-report.md` | ✅ (this file) |

### Main Specs Updated (`openspec/specs/`)

| Domain Spec | Action | Summary of Changes |
|-------------|--------|-------------------|
| `ai-guide-domain/spec.md` | Updated | UseCaseContract: systemPrompt/inputTemplate → promptId; GuideResult: added promptId/promptVersion; New requirements: PromptId, ContextPolicy, OutputContract, PromptDefinition |
| `ai-guide-ports/spec.md` | Updated | Added PromptRegistry port; Updated LlmProvider port (promptId/version input); Updated AiInvocationAudit (removed systemPrompt, added promptId/version) |
| `ai-guide-pipeline/spec.md` | Updated | Pipeline depends on PromptRegistry + ContextBuilder; resolves promptId; builds context via ContextBuilder; includes promptId/promptVersion in metadata |
| `ai-guide-mocks/spec.md` | Updated | Added InMemoryPromptRegistry tests; MockLlmProvider keys by promptId (not systemPrompt); InMemoryAiInvocationAudit stores promptId/version, no systemPrompt |
| `ai-guide-tests/spec.md` | Updated | Added requirements for PromptRegistry, ContextBuilder, ContextPolicy, MockLlmProvider, and InMemoryAiInvocationAudit tests; total test count: 334 |

### Engram Artifacts

| Artifact | Topic Key | Status |
|----------|-----------|--------|
| Explore | `sdd/prompt-registry/explore` | ✅ Archived |
| Proposal | `sdd/prompt-registry/proposal` | ✅ Archived |
| Spec | `sdd/prompt-registry/spec` | ✅ Archived |
| Design | `sdd/prompt-registry/design` | ✅ Archived |
| Tasks | `sdd/prompt-registry/tasks` | ✅ Archived |
| Verify Report | `sdd/prompt-registry/verify-report` | ✅ Archived |
| Archive Report | `sdd/prompt-registry/archive-report` | ✅ (this save) |

---

## Spec Compliance Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| REQ-1: Prompt Types | ✅ COMPLIANT | PromptId literal union, PromptDefinition with all fields |
| REQ-2: PromptRegistry | ✅ COMPLIANT | Port + InMemoryPromptRegistry with validation |
| REQ-3: UseCaseContract | ⚠️ PARTIAL | promptId added, contextPolicy/enabled deferred (design decision) |
| REQ-4: ContextPolicy | ✅ COMPLIANT | 8-field shape matches spec exactly |
| REQ-5: ContextBuilder | ✅ COMPLIANT | All scenarios covered, graceful missing data |
| REQ-6: Prompt Content | ✅ COMPLIANT | 4 prompts with correct text, outputMode, useCaseIds |
| REQ-7: ExecutionPipeline | ✅ COMPLIANT | Registry resolution, ContextBuilder, promptId in metadata |
| REQ-8: GuideResult Metadata | ✅ COMPLIANT | promptId + promptVersion in both success and failed |
| REQ-9: Audit Updated | ✅ COMPLIANT | promptId/version in records, systemPrompt removed |
| REQ-10: MockLlmProvider | ✅ COMPLIANT | Keyed by promptId, not systemPrompt |
| REQ-11: Tests | ✅ COMPLIANT | 334 tests, 0 fail |
| REQ-12: Documentation | ✅ COMPLIANT | docs/ai-guide-prompts.md — 190 lines |

**Compliance**: 50/52 scenarios compliant (2 partial = intentional design decisions documented in verify-report)

---

## Key Design Decisions

1. **Lean UseCaseContract** — Contract references `promptId` only; contextPolicy, outputContract live in PromptDefinition (single source of truth)
2. **Clean break** — No dual code paths; `systemPrompt`/`inputTemplate`/`providerPolicy` removed entirely
3. **PromptRegistry in application layer** — No external I/O, deterministic. Port in `application/ports/`, impl in `application/prompts/`
4. **`promptVersion: number`** — Type is number (spec-compliant), not string as design initially specified
5. **ContextPolicy in PromptDefinition** — Each prompt carries its own context policy, enabling per-prompt context configuration

---

## Verification

- **Build**: `npm run check` → 0 errors
- **Tests**: `npm run -w @serena/core test` → 334 pass, 0 fail, 7 suites, ~2468ms
- **Issues**: 0 critical, 4 warnings (spec/design sync items, not functional)
- **Verdict**: PASS — Ready for archive

---

## Risks & Remaining Items

1. **Spec-vs-Implementation: ContextPolicy location** — Spec REQ-3 says UseCaseContract should have `contextPolicy`. Implementation puts it in PromptDefinition. Recommend syncing spec to match implementation for Phase 2.
2. **`enabled` flag deferred** — Spec includes `enabled?: boolean` on UseCaseContract. Not implemented. Useful for Phase 2 when use cases need conditional disabling.

---

## Next Steps

**None** — This change is closed. Ready for the next change.

---

## Files Changed (Summary)

### New Files (9)
- `apps/core/src/modules/ai-guide/domain/prompt-id.ts`
- `apps/core/src/modules/ai-guide/domain/context-policy.ts`
- `apps/core/src/modules/ai-guide/domain/output-contract.ts`
- `apps/core/src/modules/ai-guide/domain/prompt-definition.ts`
- `apps/core/src/modules/ai-guide/application/ports/prompt-registry.ts`
- `apps/core/src/modules/ai-guide/application/prompts/in-memory-prompt-registry.ts`
- `apps/core/src/modules/ai-guide/application/prompts/context-builder.ts`
- `apps/core/src/modules/ai-guide/application/prompts/default-prompts.ts`
- `docs/ai-guide-prompts.md`

### New Test Files (3)
- `apps/core/src/modules/ai-guide/tests/prompt-registry.test.ts`
- `apps/core/src/modules/ai-guide/tests/context-builder.test.ts`
- `apps/core/src/modules/ai-guide/tests/context-policy.test.ts`

### Modified Source Files (11)
- `apps/core/src/modules/ai-guide/domain/use-case-contract.ts`
- `apps/core/src/modules/ai-guide/domain/guide-result.ts`
- `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts`
- `apps/core/src/modules/ai-guide/application/ports/ai-invocation-audit.ts`
- `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts`
- `apps/core/src/modules/ai-guide/application/use-cases/contracts.ts`
- `apps/core/src/modules/ai-guide/infrastructure/memory/mock-llm-provider.ts`
- `apps/core/src/modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts`
- `apps/core/src/modules/ai-guide/bootstrap/create-in-memory-pipeline.ts`
- `apps/core/src/modules/ai-guide/bootstrap/tests/scenario-endpoint.test.ts`
- `apps/core/src/modules/ai-guide/inbound-gate/tests/process-channel-inbound-message.test.ts`

### Modified Test Files (5)
- `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts`
- `apps/core/src/modules/ai-guide/tests/ai-guide-service.test.ts`
- `apps/core/src/modules/ai-guide/tests/mock-llm-provider.test.ts`
- `apps/core/src/modules/ai-guide/tests/in-memory-ai-invocation-audit.test.ts`
- `apps/core/src/modules/ai-guide/tests/use-case-registry.test.ts`
