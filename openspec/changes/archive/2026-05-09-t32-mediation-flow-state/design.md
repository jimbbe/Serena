# Design: T32 — Mediation Clarification + Confirmation State Machine

## Technical Approach

Follow the InMemoryConversationStore pattern: domain types → port (type alias) → in-memory adapter, wired as shared instance in `createInMemoryPipeline()`. Flow routing intercepts `ProcessChannelInboundMessage.execute()` at two points: (A) before classification — if active flow exists, resolve user input against pending action via keyword resolver; (B) after AI guide — if mediation result has `missingFields`/`requiresConfirmation`, start a new flow. Risk ALWAYS pauses active flows.

## Architecture Decisions

| Decision | Choice | Tradeoff / Rationale |
|----------|--------|---------------------|
| Store granularity | Separate `MediationFlowStore`, not embedded in `ConversationStore` | Single responsibility. Flow state is ephemeral (cleared on resolve), keyed by conversationId only. Independent testing and removal. |
| Confirmation resolution | Keyword-based (sí/no/mandalo/dale/etc.) | Deterministic, zero LLM cost, narrow activation scope (only when `pendingAction` exists). LLM-based would re-classify "sí" as conversational noise. |
| Flow routing order | Check flow BEFORE classifier | Avoids wasting LLM call on "sí" reply. If user is answering a clarification question, intent classification is irrelevant. |
| `MediationFlowStore` dependency | Optional in `ProcessChannelInboundMessage` constructor | Backward compatibility. If undefined, behavior falls back to current no-flow path. Ensures zero test regressions. |
| Risk interrupt | Risk pauses flow to `paused` status; `risk_review` profile always clears routing shortcut | Safety non-negotiable. Detection path: text matches HARD risk → flow paused → normal risk pipeline runs. SOFT risk or AI-detected risk in active flow: pause and re-evaluate. |

## Data Flow

```
InboundMessageCommand
  │
  ├─ Identity resolution
  ├─ Conversation tracking
  ├─ Blocked? → return
  │
  ├─[A] MediationFlowStore.findActiveByConversation(conversationId)
  │   ├─ Active flow found → resolveConfirmationInput(text) → return result
  │   │   (skips gate + classifier entirely)
  │   └─ No active flow → continue
  │
  ├─ Gate evaluation (ProcessInboundMessage)
  ├─ Discard? → return
  ├─ Classify intent (serena.inbound.classify_intent)
  ├─ Execute AI guide
  │
  └─[B] If guideResult contains mediation output with missingFields:
        └─ MediationFlowStore.startFlow(state)
           (status = clarifying | confirming | idle based on missingFields)
```

## Type Definitions

```typescript
// domain/mediation-flow-state.ts
export type MediationFlowStatus = "idle" | "clarifying" | "confirming" | "paused" | "resolved";

export type PendingAction =
  | "clarify_recipient" | "clarify_message" | "clarify_both"
  | "confirm_mediation" | "edit_mediation" | "cancel_mediation";

export type MissingMediationField = "recipient" | "message" | "confirmation";

export type MediationDraft = {
  readonly id: string;
  readonly conversationId: string;
  readonly requesterPersonId: string;
  readonly recipientHint: string | null;
  readonly messageDraft: string | null;
  readonly sourceMessageId: string;
  readonly sourceText: string;
  readonly version: number;
  readonly status: "draft" | "confirmed" | "sent" | "cancelled";
};

export type ClarificationQuestion = {
  readonly questionText: string;
  readonly fieldRequested: MissingMediationField;
  readonly relatedDraftId: string;
};

export type MediationFlowState = {
  readonly conversationId: string;
  readonly personId: string;
  readonly status: MediationFlowStatus;
  readonly draft: MediationDraft | null;
  readonly pendingAction: PendingAction | null;
  readonly missingFields: readonly MissingMediationField[];
  readonly lastQuestion: ClarificationQuestion | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

## Store Interface (port)

```typescript
export type MediationFlowStore = {
  findActiveByConversation(conversationId: string): Promise<MediationFlowState | undefined>;
  startFlow(state: MediationFlowState): Promise<MediationFlowState>;
  updateFlow(state: MediationFlowState): Promise<MediationFlowState>;
  clearFlow(conversationId: string): Promise<void>;
  pauseFlow(conversationId: string): Promise<MediationFlowState | undefined>;
  resumeFlow(conversationId: string): Promise<MediationFlowState | undefined>;
};
```

## Keyword Resolver (pure function, no deps)

```typescript
export type ConfirmationResolution = {
  action: "confirm" | "cancel" | "edit" | "unknown";
  matchedKeyword: string | null;
};

export function resolveConfirmationInput(text: string): ConfirmationResolution;
// "sí"|"si"|"dale"|"ok"|"mandalo"|"envialo"|"confirmo" → confirm
// "no"|"mejor no"|"cancelar"|"cancela"|"espera" → cancel
// "cambi"|"edita"|"corregi" → edit
// else → unknown
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `modules/mediation-flow/domain/mediation-flow-state.ts` | Create | All domain types |
| `modules/mediation-flow/port/mediation-flow-store.ts` | Create | Store port (type alias) |
| `modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts` | Create | Map-based adapter |
| `modules/mediation-flow/index.ts` | Create | Barrel exports |
| `modules/mediation-flow/__tests__/mediation-flow-store.test.ts` | Create | Store unit tests |
| `modules/mediation-flow/__tests__/flow-resolution.test.ts` | Create | Keyword resolver + routing tests |
| `modules/channel-inbound/.../process-channel-inbound-message.ts` | Modify | Add flow check [A] + flow start [B]; optional `MediationFlowStore` dep |
| `modules/inbound-gate/.../channel-inbound-result.ts` | Modify | Add optional `mediationFlow?`, `pendingAction?`, `missingFields?` |
| `bootstrap/create-in-memory-pipeline.ts` | Modify | Create + wire `InMemoryMediationFlowStore` |
| `bootstrap/scenario-runner.ts` | Modify | Expose flow state in `ScenarioStepResult` and `ScenarioSummary` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — Store | findActive, startFlow, updateFlow, clearFlow, pause/resume idempotency | `node:test`; same pattern as `conversation-store.test.ts` |
| Unit — Resolver | All keyword variants → correct action; unknown text → unknown; nil input | Pure function; table-driven test |
| Unit — Routing | Active flow skips classification; no flow passes through; risk pauses flow | Mock store + mock dependencies (pattern from T30 tests) |
| Integration | Full scenario: message "Decile a Mari..." → flow started → "sí" → flow resolved | Use `createInMemoryPipeline()` with real store |
| Regression | All existing `process-channel-inbound-message.test.ts` tests pass | Optional dep = undefined falls back to current behavior |

## Rollback Plan

1. Revert branch — no database state, no migrations
2. `MediationFlowStore` is optional dep in `ProcessChannelInboundMessage`; if `undefined`, behavior = current
3. All new types in isolated `mediation-flow/` directory — single directory delete
4. `ChannelInboundResult` fields are optional; existing consumers ignore new keys

## Open Questions

- None — all decisions resolved above
