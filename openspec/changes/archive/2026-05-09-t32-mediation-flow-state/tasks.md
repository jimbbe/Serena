# Tasks: T32 — Mediation Clarification + Confirmation State Machine

## Phase 1: Foundation — MediationFlow module

- [x] 1.1 Create `modules/mediation-flow/domain/mediation-flow-state.ts` — domain types: `MediationFlowStatus`, `PendingAction`, `MissingMediationField`, `MediationDraft`, `MediationFlowState`, `ClarificationQuestion`. All readonly. — XS — Compiles with strict mode, types used by downstream tasks.
- [x] 1.2 Create `modules/mediation-flow/port/mediation-flow-store.ts` — store port type alias with `findActiveByConversation`, `startFlow`, `updateFlow`, `clearFlow`, `pauseFlow`, `resumeFlow`. — XS — Correctly typed, no circular deps.
- [x] 1.3 Create `modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts` — `Map<string, MediationFlowState>` with all port methods. Follows `InMemoryConversationStore` pattern. — S — All CRUD operations work, idempotent pause/resume, missing key returns undefined.
- [x] 1.4 Create `modules/mediation-flow/index.ts` — barrel exporting all types, port, adapter. — XS — Modules resolved, clean imports.

## Phase 2: Core — Resolution + Flow Routing

- [x] 2.1 Create `resolveConfirmationInput(text: string): ConfirmationResolution` pure function. Maps keywords: sí/si/dale/ok/mandalo/envialo/confirmo → confirm; no/mejor no/cancelar/cancela/espera → cancel; cambi/edita/corregi → edit; else → unknown. — XS — All keyword variants tested, unknown returns `{action:"unknown", matchedKeyword:null}`.
- [x] 2.2 Extend `ChannelInboundResult` — add optional `flowState`, `promptText` fields. All optional for backward compat. — XS — Existing consumers ignore new fields, no type errors.
- [x] 2.3 Add `mediationFlowStore?: MediationFlowStore` to `ProcessChannelInboundMessageDependencies` + constructor. If undefined, current behavior unchanged. — S — Zero regressions with undefined dep.
- [x] 2.4 Implement flow check [A] before gate: after identity resolution + conversation tracking, query `findActiveByConversation`. Active flow found → if `confirming` call keyword resolver; if `clarifying` call AI guide directly with mediation clarify use case + flow context; build channel result from resolved action. Risk signal → pause flow immediately. — M — Active confirming flow skips gate+classifier; clarifying flow routes to AI guide with context; risk pauses flow; no active flow → normal path unchanged.
- [x] 2.5 Implement flow start [B] after AI guide: parse `guideResult.output` for `missingFields`, `recipientHint`, `messageDraft`. If mediation output detected → `startFlow()` with status `clarifying` or `confirming` based on field presence. — M — Full mediation creates flow with correct status; mediation with both fields → confirming; partial → clarifying; non-mediation → no flow.

## Phase 3: Wiring

- [x] 3.1 Wire `InMemoryMediationFlowStore` in `createInMemoryPipeline()` — create shared instance, pass to `ProcessChannelInboundMessage`. — XS — Pipeline factory creates store, use case receives it, scenario runner propagates.
- [x] 3.2 Update `SimulationScenarioRunner` — add `flowState?: {...}` field to `ScenarioStepResult` and `ScenarioResult`. Propagate from step result. — S — Each step carries flow state; `ScenarioResult` shows aggregate/terminal flow state.

## Phase 4: Tests

- [x] 4.1 Unit tests for `InMemoryMediationFlowStore` — findActive, startFlow, updateFlow, clearFlow, pause/resume idempotency, missing key → undefined, multiple conversations isolated. — S — All store operations verified, same pattern as `conversation-store.test.ts`.
- [x] 4.2 Unit tests for `resolveConfirmationInput` — table-driven: all confirm keywords, all cancel keywords, edit keywords, unknown text, empty string, mixed case, embedded in longer text. — S — 100% keyword coverage, boundary cases.
- [x] 4.3 Unit tests for flow routing — mock store: active confirming flow returns via keyword resolver; active clarifying flow routes to AI guide; no active flow normal path; risk pauses flow; undefined store = fallback. — M — 3 routing paths verified, regression for all existing test suite.
- [x] 4.4 Integration scenario tests — use `createInMemoryPipeline()` with real store: S1-S18 scenarios from spec executed as multi-step sequences. Verify flow state transitions, keyword resolution, risk pause, edit version increment. — M — Scenario scripts pass: clarifying→confirming→resolved chain works end-to-end.
- [x] 4.5 Regression check — `npm run check` passes with existing tests unchanged. — XS — Exit code 0, zero TS errors.

## Phase 5: Acceptance

- [x] 5.1 Simulation acceptance tests — 100 simulations across 10 categories (complete mediations, missing recipient/message/both, confirmations, cancellations, edits, risk interrupts, non-mediation, borderline). All reach expected terminal states without real outbound calls. — M — All 10 sets produce correct terminal flow states; no WhatsApp/Evolution/DB calls.
