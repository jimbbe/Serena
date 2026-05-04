# Exploration: add-conversation-store

## Current State

Serena is a conversational companion for elderly people, currently in Phase 1 (mediation via WhatsApp). The codebase follows Clean/Hexagonal architecture with modules under `apps/core/src/modules/`. All stores are in-memory — no PostgreSQL, no real WhatsApp, no real LLM.

**Two pipelines exist:**

1. **Internal Pipeline** (`POST /internal/pipeline/process`):
   `IncomingWhatsAppMessage → ProcessIncomingWhatsAppMessage (orchestrator) → InboundGate → MediationUnderstanding → ContactDirectory → SessionManager → MediationBridge → PrudentRewording → PipelineResult`

2. **Simulation Pipeline** (`POST /dev/simulate/inbound-message`):
   `InboundMessageCommand → ProcessChannelInboundMessage → ExternalIdentityResolver → ProcessInboundMessage (EvaluateInboundMessage) → AiGuideService → ChannelInboundResult`

The simulation pipeline is channel-agnostic and newer (T20+). The internal pipeline is WhatsApp-specific and older (T15-T16). Both share the same `ProcessInboundMessage` use case for gate evaluation.

## Key Files Found

| File | Purpose |
|------|---------|
| `apps/core/src/server.ts` | Entry point — wires all handlers and pipeline |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Factory for in-memory dependencies |
| `apps/core/src/bootstrap/simulation-handler.ts` | `POST /dev/simulate/inbound-message` handler |
| `apps/core/src/bootstrap/scenario-handler.ts` | `POST /dev/simulate/scenario` handler |
| `apps/core/src/bootstrap/scenario-runner.ts` | Multi-step scenario orchestrator |
| `apps/core/src/bootstrap/server.ts` | HTTP server factory with routing |
| `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts` | `InboundMessageCommand` type (already has `conversationId`) |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | `ChannelInboundResult` — needs `conversationId` |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Main use case — integration point for ConversationStore |
| `apps/core/src/modules/inbound-gate/application/ports/external-identity-resolver.ts` | Port pattern example |
| `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | In-memory adapter pattern example |
| `apps/core/src/modules/mediation-bridge/application/ports/mediation-bridge-session-store.ts` | Store port pattern (type alias) |
| `apps/core/src/modules/mediation-bridge/infrastructure/memory/in-memory-mediation-bridge-session-store.ts` | Store adapter pattern (Map-based) |
| `apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts` | Another store port pattern |
| `apps/core/src/modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts` | Another store adapter pattern |
| `apps/core/src/modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts` | Orchestrator — coordinates all modules |
| `apps/core/src/modules/inbound-gate/application/results/resolved-inbound-actor.ts` | `ResolvedInboundActor` type |

## Current Architecture Flow

```
Simulation Pipeline (channel-agnostic):
  InboundMessageCommand
    → ProcessChannelInboundMessage.execute()
      → ExternalIdentityResolver.resolve() → ResolvedInboundActor
      → (blocked? → return blocked result)
      → ProcessInboundMessage.execute() → {decision, route}
      → (discard? → return discard result)
      → AiGuideService.execute() → GuideResult
      → return ChannelInboundResult

Internal Pipeline (WhatsApp-specific):
  PipelineInput
    → ProcessIncomingWhatsAppMessage.execute()
      → ProcessInboundMessage.execute() → classification
      → (discard → return)
      → (risk_review → return)
      → (mediation_understanding → handleMediationRequest)
      → (conversation → handleConversationalMessage)
      → return PipelineResult
```

## Types and Interfaces

### InboundMessageCommand (`inbound-gate/domain/inbound-message-command.ts`)
```typescript
type InboundMessageCommand = {
  channel: InboundChannel;
  externalSenderId: string;
  text: string;
  tenantId?: string;
  personId?: string;
  conversationId?: string;  // Already exists!
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};
```

### ChannelInboundResult (`inbound-gate/application/results/channel-inbound-result.ts`)
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
  warnings: string[];
  errors: string[];
  // MISSING: conversationId
};
```

### ExternalIdentityResolver (`inbound-gate/application/ports/external-identity-resolver.ts`)
```typescript
interface ExternalIdentityResolver {
  resolve(command: InboundMessageCommand): Promise<ResolvedInboundActor>;
}
```

### Store Port Pattern (example: `mediation-bridge-session-store.ts`)
```typescript
type MediationBridgeSessionStore = {
  save(session: MediationBridgeSession): Promise<void>;
  findById(sessionId: string): Promise<MediationBridgeSession | undefined>;
};
```

## Integration Points for Conversation Store

1. **`ProcessChannelInboundMessage`** — Add `ConversationStore` as a 4th dependency. After identity resolution, call `findOrCreateConversation(tenantId, personId)`. After pipeline execution, call `appendMessage(conversationId, ...)`.

2. **`ChannelInboundResult`** — Add `conversationId?: string` field.

3. **`SimulationScenarioRunner.execute()`** — After each step, extract `conversationId` from `ChannelInboundResult` and set it on the next step's `InboundMessageCommand`. This enables conversational continuity.

4. **`createInMemoryPipeline()`** — Instantiate `InMemoryConversationStore` and pass to `ProcessChannelInboundMessage`.

5. **`server.ts`** — No changes needed; simulation handler already returns `ChannelInboundResult` which will include the new field.

## Test Patterns

- **Framework**: `node:test` + `node:assert/strict` (Node.js built-in, zero external deps)
- **Pattern**: Mock factories with duck typing, inline mock objects
- **Location**: `modules/*/tests/*.test.ts` and `bootstrap/tests/*.test.ts`
- **HTTP tests**: Spin up real server on port 0 (random), use `node:http` client
- **Example**: `process-channel-inbound-message.test.ts` (1003 lines, 20+ tests) uses mock resolver, mock processInbound, mock aiGuideService

## Gotchas / Edge Cases

1. **`conversationId` already exists** in `InboundMessageCommand` but is currently unused — only generates a warning if missing. This is good: the field is already validated in the simulation handler.

2. **No barrel files** — All imports use full `.ts` paths (e.g., `../domain/inbound-message-command.ts`). This is consistent across the codebase.

3. **Two separate pipelines** — The conversation store should primarily integrate with `ProcessChannelInboundMessage` (simulation pipeline). The internal pipeline (`ProcessIncomingWhatsAppMessage`) is a separate concern and may need its own integration later.

4. **Scenario runner already has `conversationId`** in `ScenarioStepInput` and `ScenarioRequest` — but it doesn't auto-propagate between steps. The runner builds each step's command independently.

5. **`ProcessChannelInboundMessage` already warns** about missing `conversationId` — this warning should be removed or changed once the store auto-creates conversations.

6. **The `adaptInput` method** in `ProcessChannelInboundMessage` converts `InboundMessageCommand` → `ProcessInboundMessageInput` but does NOT pass `conversationId` through. This may need updating.

## Recommended Approach

1. **Create new module `conversation-store`** under `apps/core/src/modules/conversation-store/` with:
   - `domain/` — `Conversation` and `ConversationMessage` types
   - `application/ports/` — `ConversationStore` interface
   - `infrastructure/memory/` — `InMemoryConversationStore` implementation

2. **Add `conversationId` to `ChannelInboundResult`**

3. **Wire into `ProcessChannelInboundMessage`** — inject store, call `findOrCreateConversation` and `appendMessage`

4. **Update `SimulationScenarioRunner`** — propagate `conversationId` between steps

5. **Update `createInMemoryPipeline`** — create and wire the store

6. **Tests** — Follow existing patterns: mock factories, `node:test` + `node:assert/strict`
