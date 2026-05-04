# Archive Report — T27: Wire Conversation History into AiGuide Context

**Archived at**: 2026-05-04
**Source**: `openspec/changes/t27-ai-guide-conversation-history/` → `openspec/changes/archive/2026-05-04-t27-ai-guide-conversation-history/`
**SDD Cycle**: Complete ✓

---

## Summary

Wired conversation history from ConversationStore through ProcessChannelInboundMessage → AiGuideService → ExecutionPipeline → ContextBuilder into all 4 prompt definitions. Defined `AiGuideInput` typed interface replacing `Record<string, string>` to support `recentMessages`, `knownContacts`, and `safetyMemory` typed fields. Activated `includeConversationHistory: true` on all 4 prompts (conversation-reply, risk-review, mediation-understand-request, mediation-clarify) with appropriate `maxRecentMessages` limits (6, 5, 4, 3).

## Engram Artifacts

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| Explore | #588 | `sdd/t27-ai-guide-conversation-history/explore` |
| Proposal | #589 | `sdd/t27-ai-guide-conversation-history/proposal` |
| Spec | #590 | `sdd/t27-ai-guide-conversation-history/spec` |
| Design | #591 | `sdd/t27-ai-guide-conversation-history/design` |
| Tasks | #592 | `sdd/t27-ai-guide-conversation-history/tasks` |
| Apply-Progress | #593 | `sdd/t27-ai-guide-conversation-history/apply-progress` |
| Verify-Report | #594 | `sdd/t27-ai-guide-conversation-history/verify-report` |
| Archive-Report | — | `sdd/t27-ai-guide-conversation-history/archive-report` |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `ai-guide-service` | Updated | Input type changed from `Record<string, string>` to `AiGuideInput`; Added AiGuideInput Type requirement with 7 typed fields |
| `ai-guide-pipeline` | Updated | Added `AiGuideInput` input type; Added `buildUserPrompt()` string-field extraction detail; Added "ExecutionPipeline Flows recentMessages to ContextBuilder" requirement with 4 scenarios |
| `ai-guide-conversation-history` | Created | New spec covering conversation history fetch, formatting, activation in prompts, guard tests — 7 requirements with 13 scenarios |
| `inbound-gate` | Created | New spec covering ProcessChannelInboundMessage conversation history fetch — 1 requirement with 6 scenarios |

## Files Changed (Implementation)

| File | Action |
|------|--------|
| `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts` | **Created** |
| `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-service.ts` | Modified |
| `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` | Modified |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/conversation-reply.v1.ts` | Modified |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/risk-review.v1.ts` | Modified |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` | Modified |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-clarify.v1.ts` | Modified |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified |
| `apps/core/src/modules/ai-guide/tests/context-policy.test.ts` | Modified |
| `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` | Modified |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Modified |
| `docs/ai-guide-prompts.md` | Modified |
| `docs/project-status.md` | Modified |
| `README.md` | Modified (test count: 345→485) |

## Test Results

- **Total tests**: 485 passed ✅ / 0 failed
- **Core**: 447 tests, 0 failures (8 suites)
- **Gateway-wa**: 38 tests, 0 failures (4 suites)
- **Build**: `npm run check` ✅, `npm run typecheck` ✅
- **T27-specific tests**: 15 across 3 test files (5 pipeline + 4 guard + 6 inbound-gate)

## Verification Verdict

**PASS** — All 10 tasks implemented. All source files match specs and design. No regressions.

## Discoveries (Implementation)

- `AiGuideInput` cannot use `Record<string, string> & { recentMessages?: string[] }` directly — TypeScript's index signature constraint requires all properties match the index type. Solution: explicit index signature `[key: string]: string | string[] | undefined` with typed overrides.
- `buildUserPrompt()` extracts only string-valued fields into `templateValues: Record<string, string>` for safe `renderTemplate()` call — array fields bypass template interpolation and go directly to ContextBuilder.build().
- `ProcessChannelInboundMessage` stores the `inboundMsgId` to filter it out when building `recentMessages` — crucial to avoid duplicating the current message.

## Archive Contents

| Artifact | Status |
|----------|--------|
| `proposal.md` | ✅ |
| `design.md` | ✅ |
| `tasks.md` | ✅ (10/10 tasks complete) |
| `specs/ai-guide-conversation-history/spec.md` | ✅ |
| `specs/ai-guide-pipeline/spec.md` | ✅ |
| `specs/ai-guide-service/spec.md` | ✅ |
| `specs/inbound-gate/spec.md` | ✅ |
| `archive-report.md` | ✅ |

## Source of Truth Updated

The following main specs now reflect the new behavior:
- `openspec/specs/ai-guide-service/spec.md`
- `openspec/specs/ai-guide-pipeline/spec.md`
- `openspec/specs/ai-guide-conversation-history/spec.md` (NEW)
- `openspec/specs/inbound-gate/spec.md` (NEW)
