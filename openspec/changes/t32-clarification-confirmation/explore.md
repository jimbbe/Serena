# Exploration: T32 — Mediation Clarification + Confirmation State Machine

## Current State

### Inbound Processing Pipeline

The pipeline flows through `ProcessChannelInboundMessage.execute()`:

```
InboundMessageCommand
  → ExternalIdentityResolver.resolve(cmd)
  → ConversationStore.findOrCreateConversation(...)
  → ConversationStore.appendMessage(inbound)
  → ProcessInboundMessage.execute(adaptedInput)
      → EvaluateInboundMessage.execute()
          → InboundDecision (blocked/allowed/needs_mediation)
      → InboundProcessingRoute (discard | llm_profile_required)
  → AiGuideService.execute("serena.inbound.classify_intent")  ← semantic classifier
  → applyFusionPolicy(deterministicProfile, aiIntent, confidence, matchedSignals)
  → profileToUseCaseId(profileId)
  → AiGuideService.execute(useCaseId, context)  ← main guide
  → ChannelInboundResult
```

### Key Types

**ChannelInboundResult** (`inbound-gate/application/results/channel-inbound-result.ts`):
```typescript
type ChannelInboundResult = {
  traceId: string;
  channel: InboundChannel;
  inboundDecision: InboundDecision;
  profileId: LlmProfileId | undefined;
  useCaseId: GuideUseCaseId | undefined;
  guideResult: GuideResult | undefined;
  guideError?: { message: string; code?: string };
  simulatedOutbound?: SimulatedOutbound;
  identity?: ResolvedInboundActor;
  conversation?: { id: string; status: string; messageCount: number };
  warnings: string[];
  errors: string[];
};
```

**LlmProfileId** (`inbound-gate/domain/llm-profile.ts`):
```typescript
type LlmProfileId = "conversation" | "mediation_understanding" | "risk_review" | "clarification";
```

**GuideUseCaseId** (`ai-guide/domain/guide-use-case-id.ts`):
```typescript
type GuideUseCaseId =
  | "serena.conversation.reply"
  | "serena.risk.review"
  | "serena.mediation.understand_request"
  | "serena.mediation.clarify"
  | "serena.inbound.classify_intent";
```

**Mediation Output Contract** (`mediation-understand-request.v1.ts`):
```json
{
  "isMediationRequest": true,
  "recipientHint": "string | null",
  "messageDraft": "string | null",
  "requiresConfirmation": true,
  "missingFields": ["recipient" | "message" | "confirmation"],
  "riskSignal": false
}
```

**Clarification Output Contract** (`mediation-clarify.v1.ts`):
```json
{
  "question": "string",
  "reason": "string"
}
```

### Fusion Policy (8 rules, in order)

1. Deterministic risk + HARD signal → `risk_review` (non-negotiable)
2. Deterministic risk + SOFT-only → fall through to AI
3. AI says risk → `risk_review`
4. Deterministic mediation → `mediation_understanding` (sticky, cannot downgrade)
5. AI says mediation → `mediation_understanding`
6. AI says clarification → `clarification`
7. AI says conversation → `conversation`
8. Unknown AI → fallback deterministic

### ConversationStore

**Port** (`conversation-store/port/conversation-store.ts`):
```typescript
type ConversationStore = {
  findOrCreateConversation(input): Promise<Conversation>;
  getConversation(conversationId): Promise<Conversation | undefined>;
  appendMessage(message): Promise<ConversationMessage>;
  listMessages(conversationId): Promise<ConversationMessage[]>;
};
```

**In-Memory Adapter** uses `Map<string, Conversation>` + `Map<string, ConversationMessage[]>`.

**Domain types**:
- `Conversation`: `{ id, tenantId, personId, status, createdAt, updatedAt, metadata? }`
- `ConversationMessage`: `{ id, conversationId, tenantId, personId, channel, direction, text, occurredAt, metadata? }`

### Simulation/Scenario Infrastructure

**Single-step**: `POST /dev/simulate/inbound-message` → `simulation-handler.ts` → `ProcessChannelInboundMessage.execute(cmd)` → `ChannelInboundResult`

**Multi-step**: `POST /dev/simulate/scenario` → `scenario-handler.ts` → `SimulationScenarioRunner.execute(request)` → `ScenarioResult`

Scenario runner auto-propagates `conversationId` between steps via `autoConversationId` variable. Each step calls `ProcessChannelInboundMessage.execute()` independently — no state carries over except conversationId.

### Test Patterns

- `node:test` with `describe`/`it`/`test`
- `assert/strict` for assertions
- Table-driven tests with helper factories (e.g., `blockedDecision()`, `allowedDecision()`)
- MockLlmProvider with canned responses per PromptId
- Real AiGuideService + ExecutionPipeline + MockLlmProvider in integration tests
- HTTP server tests spin up real server on random port

## Affected Areas

- `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` — main orchestrator, must add state-aware routing
- `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` — must expose clarification/confirmation state
- `apps/core/src/modules/inbound-gate/domain/llm-profile.ts` — may need clarification route
- `apps/core/src/modules/ai-guide/domain/guide-use-case-id.ts` — clarification use case exists
- `apps/core/src/modules/conversation-store/` — must store mediation flow state
- `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` — output contract has `missingFields`, `requiresConfirmation`
- `apps/core/src/bootstrap/scenario-runner.ts` — multi-step scenarios must maintain flow state
- `apps/core/src/bootstrap/simulation-handler.ts` — must return flow state in result
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — must wire new stores/adapters

## Gap Analysis (What T32 Must Build)

### 1. No Mediation Flow State

The `mediation.understand_request` prompt returns `missingFields: ["recipient", "message", "confirmation"]` and `requiresConfirmation: true`, but:
- **No type** represents this state (MediationFlowState, PendingAction, MediationDraft)
- **No store** persists this state between messages
- **No mechanism** resolves "sí", "ok", "mandalo" against a pending action

### 2. No Clarification → Response Loop

When `missingFields` is non-empty:
- Current system generates a clarification question via `serena.mediation.clarify`
- But the question goes to `ChannelInboundResult.guideResult.output.question`
- **Nothing stores** what was asked or what's pending
- Next message from user hits the pipeline fresh — no context about what's being clarified

### 3. No Confirmation State Machine

When `requiresConfirmation: true`:
- Current system returns it in `guideResult.output.requiresConfirmation`
- **Nothing acts on it** — no outbound message is generated, no confirmation request is sent
- User saying "sí" / "ok" / "mandalo" has no pending action to resolve

### 4. Scenario Runner Has No Flow State

`SimulationScenarioRunner` only auto-propagates `conversationId`. It doesn't:
- Track mediation flow state across steps
- Validate step sequences (e.g., clarification → response → confirmation)
- Surface flow state in `ScenarioResult`

### 5. ChannelInboundResult Missing Fields

Current result type lacks:
- `missingFields?: string[]` — what data is still needed
- `recipientHint?: string` — who the recipient is
- `messageDraft?: string` — draft message to send
- `requiresConfirmation?: boolean` — whether user confirmation is needed
- `pendingAction?: PendingAction` — what action is waiting for confirmation
- `flowState?: MediationFlowState` — current state of the mediation flow

## Recommendations

### Where to Place New Types

1. **MediationFlowState** → `apps/core/src/modules/mediation-flow/domain/mediation-flow-state.ts`
   - New module following hexagonal architecture
   - Domain type: `{ conversationId, state, recipientHint, messageDraft, missingFields, requiresConfirmation, createdAt, updatedAt }`
   - State enum: `"idle" | "clarifying" | "confirming" | "sent"`

2. **MediationFlowStore** → `apps/core/src/modules/mediation-flow/port/mediation-flow-store.ts`
   - Port following ConversationStore pattern
   - Methods: `findActiveByConversation(conversationId)`, `upsert(flowState)`, `close(conversationId)`

3. **InMemoryMediationFlowStore** → `apps/core/src/modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts`
   - Map-based adapter following InMemoryConversationStore pattern

4. **FlowState-aware routing** → Modify `ProcessChannelInboundMessage.execute()` to:
   - Check for active flow state before classification
   - Route "sí"/"ok"/"mandalo" to confirmation resolution when flow state exists
   - Route clarification responses to update flow state
   - Update flow state after each mediation step

5. **ChannelInboundResult extensions** → Add optional fields for flow state, pending action, missing fields

### Architecture Decision

The mediation flow state is **per-conversation** and **ephemeral** (lives during active mediation). It should be stored in the ConversationStore's metadata OR in a separate MediationFlowStore that keys by conversationId.

**Recommended**: Separate MediationFlowStore (cleaner separation of concerns, easier to swap storage backend later).

## Risks

- Circular dependency risk if mediation-flow module imports from conversation-store domain types → use shared types only
- State machine complexity: must handle timeout/expiry for abandoned clarifications
- MockLlmProvider must be updated to handle flow-state-aware routing in tests
- Scenario runner must be extended to track flow state across steps for T32 evaluation

## Ready for Proposal

**Yes** — exploration is complete. All relevant code paths, types, and patterns are mapped. T32 can proceed to proposal phase with clear understanding of what exists and what must be built.
