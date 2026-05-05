# Proposal: T28 — Wire Known Contacts into AI Guide Mediation Context

## Intent

The ExecutionPipeline, ContextBuilder, and AiGuideInput already support `knownContacts: string[]`, but `ProcessChannelInboundMessage` never populates it. All 4 prompts have `includeKnownContacts: false`. This change wires the existing ContactDirectory data through the mediation flow so the LLM knows which contacts the sender can reference when asking Serena to send a recado.

## Scope

### In Scope
1. Add `ContactDirectory` (full port from contact-directory module) as dependency of `ProcessChannelInboundMessage`
2. In `execute()`, call `contactDirectory.findAll()`, map to `"Name (id: contact-id)"` format, pass as `knownContacts` in `aiGuideService.execute()`
3. Activate `includeKnownContacts: true` on mediation prompts only:
   - `serena.mediation.understand_request.v1`
   - `serena.mediation.clarify.v1`
4. Keep `includeKnownContacts: false` on `conversation-reply.v1` and `risk-review.v1`
5. Update guard test in `context-policy.test.ts` (selective true/false assertion)
6. Add tests: context policy, execution pipeline with knownContacts, inbound pipeline wiring
7. Update `createInMemoryPipeline` to return `contactDirectory`; update `server.ts` injection
8. Update docs: ai-guide-prompts.md, project-status.md, open-questions.md

### Out of Scope
- `includeSafetyMemory` wiring (separate task)
- `includeFullConversation` (remains false — Phase 2+)
- Real LLM, real WhatsApp, PostgreSQL
- Automatic contact disambiguation
- External dependencies or major refactors

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `ai-guide-conversation-history`: Update requirement that all prompts keep `includeKnownContacts: false` → selective true for mediation prompts. Add requirement for ProcessChannelInboundMessage to fetch and pass knownContacts.
- `inbound-gate`: Add requirement for ProcessChannelInboundMessage to fetch knownContacts from ContactDirectory and pass to aiGuideService.
- `ai-guide-pipeline`: Add requirement for knownContacts flowing from input through ExecutionPipeline to ContextBuilder.build() (parallel to existing recentMessages requirement).

## Approach

```
ProcessChannelInboundMessage.execute()
  ├─ contactDirectory.findAll()            ← NEW: O(1) in-memory
  ├─ map Contact[] → string[]              ← "Name (id: contact-id)"
  └─ aiGuideService.execute(useCaseId, { ..., knownContacts })

AiGuideService.execute(useCaseId, input: AiGuideInput)
  └─ pipeline.execute(contract, input)      ← knownContacts passes through

ExecutionPipeline.buildUserPrompt(promptDef, input)
  └─ contextBuilder.build(policy, { ..., knownContacts: input.knownContacts })
       └─ (existing logic: if policy.includeKnownContacts, append section)

Prompt Definitions:
  mediation-understand-request.v1  → includeKnownContacts: true
  mediation-clarify.v1             → includeKnownContacts: true
  conversation-reply.v1            → includeKnownContacts: false (unchanged)
  risk-review.v1                   → includeKnownContacts: false (unchanged)
```

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified | Add `ContactDirectory` dep; fetch and pass `knownContacts` |
| `bootstrap/create-in-memory-pipeline.ts` | Modified | Return `contactDirectory` from factory |
| `core/src/server.ts` | Modified | Pass `contactDirectory` to `ProcessChannelInboundMessage` |
| `ai-guide/prompts/definitions/mediation-understand-request.v1.ts` | Modified | `includeKnownContacts: true` |
| `ai-guide/prompts/definitions/mediation-clarify.v1.ts` | Modified | `includeKnownContacts: true` |
| `ai-guide/tests/context-policy.test.ts` | Modified | Guard: selective true/false for knownContacts |
| `ai-guide/tests/execution-pipeline.test.ts` | Modified | Add knownContacts flow test |
| `inbound-gate/tests/process-channel-inbound-message.test.ts` | Modified | Add knownContacts wiring test |
| `docs/ai-guide-prompts.md` | Modified | Document knownContacts activation per prompt |
| `docs/project-status.md` | Modified | Mark T28 complete |
| `docs/open-questions.md` | Modified | Update if any questions resolved |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong ContactDirectory import (inbound-gate minimal vs contact-directory full) | Medium | Explicit import path from contact-directory module; exploration already identified this |
| Async `findAll()` in hot path | Low | In-memory O(1); can cache later if needed |
| Guard test too loose after flip | Low | New wiring tests verify full path, not just the flag |
| `createInMemoryPipeline` return type change breaks callers | Low | Only `server.ts` consumes it; single update point |

## Rollback Plan

1. Revert mediation prompt definitions: set `includeKnownContacts: false` on both prompts (removes contacts from LLM context immediately).
2. Remove `ContactDirectory` dependency from `ProcessChannelInboundMessage` constructor and `server.ts`.
3. Full `git revert` of the merge commit if needed.

## Dependencies

- T27 (Conversation History) — already merged, established the wiring pattern
- ContactDirectory module — already exists with `findAll()` and seed data
- ContextBuilder — already supports `knownContacts` rendering
- AiGuideInput — already has `knownContacts?: string[]` field

## Success Criteria

- [ ] `ProcessChannelInboundMessage` fetches and passes `knownContacts` to aiGuideService
- [ ] Mediation prompts (`understand_request`, `clarify`) have `includeKnownContacts: true`
- [ ] Non-mediation prompts (`reply`, `risk_review`) keep `includeKnownContacts: false`
- [ ] Guard test asserts selective true/false per prompt
- [ ] New tests pass: pipeline flow with knownContacts, inbound wiring
- [ ] All existing tests pass (no regressions)
- [ ] `createInMemoryPipeline` returns `contactDirectory`; `server.ts` injects it
