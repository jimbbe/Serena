# Archive Report: T32 — Mediation Clarification + Confirmation State Machine

**Archived**: 2026-05-09
**Branch**: `feat/t32-mediation-flow-state`
**Type**: M (Medium) — Spec-Driven Development

---

## Summary

Implemented a per-conversation flow state machine for mediation clarification and confirmation. The LLM was already returning `missingFields`, `requiresConfirmation`, `recipientHint`, and `messageDraft` from the mediation prompt, but the system was discarding them. Confirmation phrases like "sí", "mandalo", "mejor no" hit the pipeline fresh with no pending action to resolve, causing a clarification F1 of 0.247.

Post-archive acceptance hardening on 2026-05-10 resolved PR #38 blockers: incomplete requests now clarify instead of confirming, positive confirmation copy no longer claims real sending, edit-without-content no longer fakes an update, and stale OpenSpec verification was updated.

### What Was Built

- **New `mediation-flow` module** with hexagonal boundaries: domain types → port → in-memory adapter
- **Flow state machine**: keyed by `conversationId`, states `idle | clarifying | confirming | paused | resolved`, storing draft, missing fields, and pending action
- **Flow-state-aware routing**: `ProcessChannelInboundMessage` checks active flow BEFORE classification — active confirming flow → keyword resolver (skips LLM); active clarifying flow → AI guide with flow context; no active flow → normal path
- **Keyword confirmation resolver**: pure function mapping Spanish phrases (sí/dale/mandalo → confirm; no/mejor no/cancelar → cancel; cambi/edita → edit)
- **Risk interruption**: risk signal ALWAYS pauses active flows immediately
- **Draft edit extraction**: parses "decile que X", "mejor decile que X", "poné que X", and `editá: X` patterns to extract new message content; edit requests without new content ask what to change instead of pretending an update happened
- **Incomplete-request guard**: source text is authoritative for missing recipient/message on initial flow start, preventing model/mock fabrication of incomplete mediation fields
- **Scenario runner extension**: flow state propagated between steps alongside conversationId

### Artifact Observation IDs (Engram)

| Artifact | Observation ID |
|----------|----------------|
| Proposal | #730 |
| Spec | #731 |
| Design | #732 |
| Tasks | #733 |
| Apply Progress (fixes) | #734 |
| Verify Report | #736 |
| Archive Report | (current) |

---

## Spec Sync Summary

| Domain | Action | Details |
|--------|--------|---------|
| mediation-flow | Created | `openspec/specs/mediation-flow/spec.md` — new domain spec with 18 requirements, 18 scenarios, 8 edge cases, 5 NFRs, 12 ACs |

---

## Implementation Details

### Files Created (6 new modules)

| File | Description |
|------|-------------|
| `apps/core/src/modules/mediation-flow/domain/mediation-flow-state.ts` | Domain types: `MediationFlowStatus`, `PendingAction`, `MissingMediationField`, `MediationDraft`, `MediationFlowState`, `ClarificationQuestion` |
| `apps/core/src/modules/mediation-flow/port/mediation-flow-store.ts` | Store port: `findActiveByConversation`, `startFlow`, `updateFlow`, `clearFlow`, `pauseFlow`, `resumeFlow` |
| `apps/core/src/modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts` | In-memory adapter using `Map<string, MediationFlowState>` |
| `apps/core/src/modules/mediation-flow/index.ts` | Barrel exports |
| `apps/core/src/modules/mediation-flow/__tests__/mediation-flow-store.test.ts` | 17 store unit tests |
| `apps/core/src/modules/mediation-flow/__tests__/flow-resolution.test.ts` | Keyword resolver + routing tests |

### Additional Test Files

| File | Description |
|------|-------------|
| `apps/core/src/modules/mediation-flow/__tests__/integration-scenarios.test.ts` | 9 integration scenario tests (244 lines) |
| `apps/core/src/modules/mediation-flow/__tests__/simulation-acceptance.test.ts` | 100 simulation acceptance tests (915 lines) |

### Files Modified (4 existing)

| File | Changes |
|------|---------|
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Added optional `flowState`, `promptText` fields |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Added flow check [A] before gate, flow start [B] after AI guide, confirmation resolver, draft edit extraction; optional `MediationFlowStore` dep |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Created + wired `InMemoryMediationFlowStore` |
| `apps/core/src/bootstrap/scenario-runner.ts` | Flow state propagation in `ScenarioStepResult` and `ScenarioResult` |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store granularity | Separate `MediationFlowStore` | Single responsibility, independent testing, easy removal |
| Confirmation resolution | Keyword-based | Deterministic, zero LLM cost, narrow activation scope |
| Flow routing order | Check flow BEFORE classifier | Avoids wasting LLM call on "sí" reply |
| `MediationFlowStore` dependency | Optional in constructor | Backward compatibility, zero regression |
| Risk interrupt | Pauses flow immediately | Safety non-negotiable |

---

## Test Results

| Workspace | Tests | Passed | Failed | Skipped |
|-----------|-------|--------|--------|---------|
| @serena/core | 716 | 716 | 0 | 0 |
| @serena/gateway-wa | 59 | 59 | 0 | 0 |
| **Total** | **775** | **775** | **0** | **0** |

- **Type check**: ✅ All workspaces pass `tsc --noEmit`
- **npm run check**: ✅ Passes (structure + typecheck)
- **npm test**: ✅ Previously passed (775 tests, 0 failures)

### Post-acceptance validation (2026-05-10)

| Workspace | Tests | Passed | Failed | Skipped |
|-----------|-------|--------|--------|---------|
| @serena/core | 724 | 724 | 0 | 0 |
| @serena/gateway-wa | 59 | 59 | 0 | 0 |
| **Total** | **783** | **783** | **0** | **0** |

- **npm run check**: ✅ Passes (structure + typecheck)
- **npm test**: ✅ Passes (783 tests, 0 failures)
- **T32 live acceptance simulation**: ✅ 31/31 steps passed

### Test Distribution

| Layer | Tests |
|-------|-------|
| Unit — Store operations | 17 |
| Unit — Keyword resolver | ~11 |
| Unit — Flow routing (mocked) | 8 |
| Integration — Scenarios | 9 |
| Simulation Acceptance | 100 |
| **Total new tests** | **~145** |

---

## Issues Found & Fixed

### CRITICAL (fixed before archive)

1. **extractEditMessage was a no-op** — Edit path incremented draft version but never updated `messageDraft` content. Fixed by adding Spanish edit pattern parsing: "decile que X", "mejor decile que X", "poné que X", and `editá: X`. Added tests verifying `draftMessageDraft` actually changes.

2. **Missing content change assertion** — C5.6 only verified version increment, not message content change. Fixed by adding explicit `draftMessageDraft` assertions in edit tests.

### Additional PR #38 acceptance blockers fixed after archive

3. **Incomplete mediation requests confirmed too early** — `avisale a Carlos`, `escribile a Pedro`, and `llamale a Laura` now stay `clarifying` with `pendingAction = "clarify_message"`.
4. **Confirmation copy promised real sending** — Positive confirmation now explicitly says the message is confirmed/prepared for future sending and not sent by any real channel.
5. **Risk during clarification lacked explicit coverage** — Added explicit clarifying-flow risk pause tests.
6. **Residual active OpenSpec change** — Removed stale `openspec/changes/t32-clarification-confirmation/explore.md` after the main T32 change was archived.

### WARNINGS (acknowledged, not blocking archive)

1. **PendingAction as string union vs spec's discriminated union** — Implementation follows DESIGN (string union), not spec R4 (discriminated union). Low impact — both encode the same information.
2. **Missing `confirmationState` field in `ChannelInboundResult.flowState`** — Resolved flows use `status: "resolved"` with differentiation via `promptText`. Adding explicit field deferred.
3. **Default MockLlmProvider always returns complete fields** — Mitigated by source-text normalization for initial mediation completeness.

---

## Known Limitations / Deferred Items

| Item | Reason | Priority |
|------|--------|----------|
| Flow state timeout/expiry | Spec E8 explicitly deferred | Medium |
| Resume from paused flow | Spec E7 partially deferred (store has `resumeFlow` but routing doesn't auto-resume) | Low |
| PostgreSQL persistence adapter | Out of scope for T32 | Low |
| Real WhatsApp/Evolution API integration | Out of scope for T32 | Low |
| Multi-intent complete handling | Out of scope for T32 | Medium |
| Recipient resolution to external IDs | Stored as hint only | Medium |

---

## Recommendations for Next Steps

1. **T33: Flow state timeout/expiry** — Add TTL for abandoned flows to prevent stale state accumulation
2. **T34: Real WhatsApp integration** — Connect confirmed/locked flows to Evolution API for actual message sending
3. **T35: Multi-intent complete** — Handle multiple mediation intents within a single conversation
4. **T36: Paused flow resumption** — Implement automatic resume from paused state after risk review
5. **Improve MockLlmProvider** — Parameterize default mediation output to simulate realistic partial responses based on input text

---

## Source of Truth Updated

The following spec now reflects the new behavior:
- `openspec/specs/mediation-flow/spec.md` — Created (new domain)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, acceptance-hardened, and archived.
Ready for final PR review and merge approval.
