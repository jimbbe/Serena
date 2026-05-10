# Proposal: T32 — Mediation Clarification + Confirmation State Machine

## Intent

The LLM returns `missingFields`, `requiresConfirmation`, `recipientHint`, and `messageDraft` from the mediation prompt, but the system discards them. Confirmation phrases like "sí", "mandalo", "mejor no" hit the pipeline fresh with no pending action to resolve. This causes clarification F1 of 0.247. We need a per-conversation flow state that persists between messages and enables confirmation/clarification resolution.

## Scope

### In Scope
- New domain types: `MediationFlowState`, `MediationDraft`, `PendingAction`, `ConfirmationState`
- New `mediation-flow` module: port (`MediationFlowStore`) + in-memory adapter
- Flow-state-aware routing in `ProcessChannelInboundMessage`: check active flow before classification, resolve pending actions
- Extend `ChannelInboundResult` to expose flow state and missing fields
- Update scenario runner to track flow state across steps
- Comprehensive tests for store, routing, and flow resolution
- Risk rule: `risk_review` ALWAYS interrupts/pauses active mediation flow

### Out of Scope
- Real message sending or WhatsApp integration
- Evolution API integration
- PostgreSQL persistence (in-memory only)
- Multi-intent complete implementation
- Flow state timeout/expiry (deferred)
- Architecture changes beyond the new module

## Capabilities

### New Capabilities
- `mediation-flow-state`: Per-conversation mediation flow tracking with store port, in-memory adapter, flow-state-aware routing, and confirmation/clarification resolution

### Modified Capabilities
- `inbound-gate`: `ProcessChannelInboundMessage` gains flow-state check before classification; `ChannelInboundResult` gains flow state fields
- `scenario-simulation`: Scenario runner tracks and propagates flow state across steps
- `conversation-store`: No changes to port; flow store is separate module

## Approach

1. **New module** `mediation-flow/` following hexagonal boundaries: domain types → port → in-memory adapter
2. **Flow state model**: keyed by `conversationId`, states `idle | clarifying | confirming | paused | resolved`, stores draft, missing fields, and pending action
3. **Routing change**: `ProcessChannelInboundMessage.execute()` checks `MediationFlowStore.findActiveByConversation()` before classification. If active flow exists, resolve user input against pending action instead of re-classifying
4. **Confirmation resolver**: simple keyword matching ("sí", "ok", "mandalo" → confirm; "no", "mejor no", "cancelar" → cancel; else → re-clarify)
5. **Risk interrupt**: if `risk_review` fires during active flow, pause the flow (state → `paused`)
6. **Scenario runner**: carry flow state between steps alongside conversationId

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/mediation-flow/` | New | New module: domain types, port, in-memory adapter |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified | Flow-state-aware routing, confirmation resolver |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add flow state fields |
| `apps/core/src/bootstrap/scenario-runner.ts` | Modified | Track flow state across steps |
| `apps/core/src/bootstrap/simulation-handler.ts` | Modified | Return flow state in result |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire MediationFlowStore |
| `apps/core/src/modules/inbound-gate/tests/` | New/Modified | Flow state and routing tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Circular dependency between mediation-flow and other modules | Low | Flow store only uses conversationId string, no cross-module imports |
| Keyword resolver too simplistic for edge cases | Medium | Start with conservative keyword list; extend via tests |
| Existing tests break from new dependency injection | Medium | Provide no-op mock store for existing tests |
| Flow state leaks across conversations | Low | Store keyed by conversationId; cleared on resolve/close |

## Rollback Plan

1. Revert the change branch — no database migrations or external state to clean up
2. `ProcessChannelInboundMessage` constructor accepts optional `MediationFlowStore`; if undefined, behavior falls back to current classification-only path
3. All new types live in isolated `mediation-flow/` module — removal is a single directory delete
4. Scenario runner changes are additive (flow state field is optional)

## Dependencies

- T31 (merged): semantic classifier, fusion policy, sticky mediation — provides the `missingFields`/`requiresConfirmation` output this change acts on

## Success Criteria

- [ ] `MediationFlowStore` port and in-memory adapter with full test coverage
- [ ] `ProcessChannelInboundMessage` checks flow state before classification and resolves pending actions
- [ ] Confirmation keywords ("sí", "ok", "mandalo", "no", "mejor no") correctly resolve against pending mediation
- [ ] `ChannelInboundResult` exposes `flowState`, `missingFields`, `pendingAction`
- [ ] Scenario runner propagates flow state between steps
- [ ] Risk review interrupts and pauses active mediation flow
- [ ] All existing tests pass with no regressions
- [ ] Clarification F1 improves from 0.247 baseline in scenario evaluation
