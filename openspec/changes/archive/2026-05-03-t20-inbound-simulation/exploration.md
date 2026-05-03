# Exploration: T20 — Channel-Agnostic Simulation Endpoint

## Current State

Serena currently has a **WhatsApp-coupled** HTTP pipeline:

- `POST /internal/pipeline/process` accepts `{messageId, senderWhatsAppId, messageText, receivedAt}` — the field names are WhatsApp-specific.
- `ProcessIncomingWhatsAppMessage` orchestrator depends on `InboundMessageProcessor` port which expects `{senderId, text, receivedAt}` — already channel-agnostic at the port level, but the orchestrator's input type (`PipelineInput`) has `senderWhatsAppId`.
- `ProcessInboundMessage` (inbound-gate) is already channel-agnostic — it only cares about `senderId`, `text`, `receivedAt`.
- `AiGuideService` (ai-guide module) is fully isolated — takes `GuideUseCaseId` + `Record<string, string>` input, returns `GuideResult`. It is NOT wired into the orchestrator pipeline yet.
- `LlmProfileId` (inbound-gate) and `GuideUseCaseId` (ai-guide) are parallel type systems with no mapping between them.
- The HTTP server (`server.ts`) has a simple routing pattern: match pathname + method, dispatch to handler.
- `OutboundDraft` in mediation-bridge is mediation-focused (`toParticipantId`, `text`, `includesSerenaIntroduction`, `attribution`).

### Existing test patterns
- Unit tests: `node:test` + `node:assert/strict`, colocated in `tests/` directories per module.
- Integration tests: `bootstrap/tests/` — spin up real HTTP server on port 0, use `node:http` client.
- `before`/`after` for shared server fixture, `describe`/`it` for grouping.
- Helper functions: `request()`, `pipelineRequest()`, `uid()` for unique messageIds.
- Total: **196 core tests + 38 gateway-wa = 234 tests**, all passing.

## Affected Areas

- `apps/core/src/config/env.ts` — needs `ENABLE_SIMULATION_ENDPOINTS` env var
- `apps/core/src/bootstrap/server.ts` — needs new route for `POST /dev/simulate/inbound-message`
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — needs AiGuideService wiring
- `apps/core/src/modules/inbound-gate/domain/` — potential home for `InboundMessageCommand`
- `apps/core/src/modules/inbound-gate/domain/llm-profile.ts` — needs mapping to `GuideUseCaseId`
- `apps/core/src/modules/ai-guide/application/use-cases/` — AiGuideService needs to be consumed
- `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` — `PipelineInput` is WhatsApp-specific
- `apps/core/src/server.ts` — bootstrap needs simulation handler wiring
- `docs/simulation-api.md` — new documentation file
- `apps/core/src/bootstrap/tests/` — new integration tests for simulation endpoint

## Design Decisions

### 1. InboundMessageCommand — Location and Shape

**Option A: New module `channel-adapter/`** — Creates a new module for channel-agnostic types.
- Pros: Clean separation, future-proofs for multiple channel adapters
- Cons: Overkill for a single type; adds module before it's needed

**Option B: Inside `inbound-gate/domain/`** — Add `inbound-message-command.ts` next to existing domain types.
- Pros: Inbound-gate is already the entry point for message processing; the command feeds directly into it
- Cons: Slightly couples the command type to inbound-gate naming

**Option C: Inside `orchestrator/domain/`** — Add alongside `PipelineInput` and `PipelineResult`.
- Pros: The orchestrator is the coordination layer; this is the new input contract
- Cons: `PipelineInput` is already there and is WhatsApp-specific — would create confusion

**Recommendation: Option B** — `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts`

Rationale: The inbound-gate is the first module that processes any incoming message. The command type is the normalized input that any channel adapter produces. It naturally belongs at the gate. The type should be:

```typescript
export type InboundMessageCommand = {
  channel: "whatsapp" | "voice" | "web_chat" | "telegram" | "system" | "simulation";
  tenantId?: string;
  externalSenderId: string;
  text: string;
  personId?: string;
  conversationId?: string;
  occurredAt?: string; // ISO 8601
  metadata?: Record<string, unknown>;
};
```

### 2. LlmProfileId → GuideUseCaseId Mapping

**Option A: Inline function in `ProcessChannelInboundMessage`** — Simple mapping function.
- Pros: Minimal, no new files
- Cons: Hard to test independently, scatters the mapping logic

**Option B: Dedicated mapping module in `inbound-gate/domain/`** — `profile-to-usecase.ts`
- Pros: Pure function, testable, single source of truth
- Cons: Small file for a simple mapping

**Option C: Inside ai-guide as a registry method** — Extend `UseCaseRegistry` with `getByProfileId`.
- Pros: Centralized in the AI module
- Cons: Violates module boundaries — ai-guide shouldn't know about inbound-gate's profile IDs

**Recommendation: Option B** — `apps/core/src/modules/inbound-gate/domain/profile-to-usecase.ts`

```typescript
import type { LlmProfileId } from "./llm-profile.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";

export function profileToUseCaseId(profileId: LlmProfileId): GuideUseCaseId {
  const mapping: Record<LlmProfileId, GuideUseCaseId> = {
    conversation: "serena.conversation.reply",
    risk_review: "serena.risk.review",
    mediation_understanding: "serena.mediation.understand_request",
    clarification: "serena.mediation.clarify",
  };
  return mapping[profileId];
}
```

This is a pure function, easily testable, and lives at the boundary where the mapping is conceptually needed (inbound-gate knows about profiles, ai-guide knows about use cases).

### 3. ProcessChannelInboundMessage — Relationship to ProcessInboundMessage

**Option A: Wrapper/Adapter** — `ProcessChannelInboundMessage` adapts `InboundMessageCommand` → `ProcessInboundMessageInput`, calls existing `ProcessInboundMessage`, then calls `AiGuideService` with the resolved use case.
- Pros: Reuses existing logic, minimal duplication, clear single responsibility
- Cons: Two-step orchestration (gate + AI) in one use case

**Option B: Extend ProcessInboundMessage** — Add AI execution as an optional step.
- Pros: Single use case
- Cons: Violates SRP — ProcessInboundMessage is about routing, not AI execution

**Option C: New orchestrator-level use case** — Similar to `ProcessIncomingWhatsAppMessage` but channel-agnostic.
- Pros: Full control over the pipeline
- Cons: Duplicates orchestrator logic prematurely

**Recommendation: Option A** — `ProcessChannelInboundMessage` as a new use case in `inbound-gate/application/use-cases/`:

```typescript
export class ProcessChannelInboundMessage {
  constructor(deps: {
    processInboundMessage: ProcessInboundMessage;
    aiGuideService: AiGuideService;
  }) {}

  async execute(cmd: InboundMessageCommand): Promise<ChannelInboundResult> {
    // 1. Adapt command → ProcessInboundMessageInput
    // 2. Call ProcessInboundMessage → get decision + route
    // 3. If route is llm_profile_required, map profile → useCaseId
    // 4. Call AiGuideService.execute(useCaseId, { input })
    // 5. Return combined result
  }
}
```

The output type `ChannelInboundResult` should include:
- `traceId` (for correlation)
- `inboundDecision`
- `profileId` (or undefined if discarded)
- `useCaseId` (or undefined if discarded)
- `guideResult` (GuideResult | undefined)
- `warnings` (string[])
- `errors` (string[])

### 4. Simulation Endpoint Integration

**Option A: New handler file + route in server.ts** — `simulation-handler.ts` + route in `createHttpServer`.
- Pros: Follows existing pattern (like `internal-pipeline-handler.ts`), clean separation
- Cons: Need to modify `server.ts` to add the route

**Option B: Extend internal-pipeline-handler** — Add simulation logic to existing handler.
- Pros: No new files
- Cons: Violates SRP — internal pipeline and simulation are different concerns

**Option C: Middleware approach** — Add a generic route registration mechanism.
- Pros: Extensible
- Cons: Overengineering for one endpoint

**Recommendation: Option A** — New handler `apps/core/src/bootstrap/simulation-handler.ts`:

```typescript
export function createSimulationHandler(
  processChannelInbound: ProcessChannelInboundMessage,
): (req: IncomingMessage, res: ServerResponse) => Promise<void>
```

And modify `createHttpServer` to accept an optional `simulationHandler`:

```typescript
export function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
  internalToken?: string,
  simulationHandler?: SimulationRequestHandler, // new optional param
)
```

The route check in server.ts:
```typescript
if (url.pathname === "/dev/simulate/inbound-message") {
  if (!simulationHandler) {
    sendJson(res, 404, { error: "simulation_not_enabled" });
    return;
  }
  // ... validate body, call handler
}
```

This keeps the simulation endpoint **disabled by default** (handler is undefined unless explicitly wired).

### 5. OutboundDraft Simulation

**Recommendation: Reuse existing `OutboundDraft` type for now.**

The existing `OutboundDraft` from mediation-bridge has:
- `toParticipantId`, `text`, `includesSerenaIntroduction`, `attribution`

For simulation purposes, this is sufficient. The simulation endpoint can return a simulated `OutboundDraft` when the pipeline produces `mediation_started` or `mediation_reply_recorded`. A channel-aware version can be added later when a real channel adapter needs it.

For the simulation response, we can add a `simulatedOutbound` field that mirrors the `OutboundDraft` structure but with a `channel` field to indicate the target channel.

### 6. AiGuideService Wiring in createInMemoryPipeline

The `createInMemoryPipeline` function needs to be extended to include AiGuideService:

```typescript
export async function createInMemoryPipeline(): Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService; // NEW
}> {
  // ... existing setup ...

  // AI Guide wiring
  const registry = new UseCaseRegistry();
  for (const contract of defaultContracts) {
    registry.register(contract);
  }
  const llmProvider = new MockLlmProvider();
  const aiAudit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider: llmProvider, audit: aiAudit });
  const aiGuideService = new AiGuideService({ registry, pipeline });

  return { orchestrator, bridgeStore, processedMessageStore, aiGuideService };
}
```

### 7. Test Patterns to Follow

Follow the established patterns:

1. **Unit tests** — `node:test` + `node:assert/strict`, colocated in module `tests/` directory
2. **Integration tests** — `bootstrap/tests/` with real HTTP server on port 0
3. **Test helpers** — `request()`, `pipelineRequest()`, `uid()` patterns
4. **Setup/teardown** — `before`/`after` for shared fixtures
5. **Guard tests** — Test that simulation endpoint returns 404 when `ENABLE_SIMULATION_ENDPOINTS` is not set

Key test scenarios:
- Simulation endpoint disabled → 404
- Simulation endpoint enabled, valid payload → 200 with full trace
- Simulation endpoint enabled, invalid payload → 400 with field errors
- Simulation with blocked sender → discard result
- Simulation with conversation → success + guideResult
- Simulation with risk content → success + guideResult with risk review
- Simulation with failed AI (mock provider error) → error handling
- Simulation preserves traceId for correlation

## Approaches for the Overall Feature

### Approach 1: Minimal Simulation (Recommended)
- Add `InboundMessageCommand` type
- Add `profileToUseCaseId` mapping
- Add `ProcessChannelInboundMessage` use case
- Add simulation endpoint with env guard
- Wire AiGuideService into pipeline factory
- Basic integration tests

**Effort: Medium** | **Risk: Low**

### Approach 2: Full Channel Adapter Framework
- Create `channel-adapter` module with adapter interface
- Implement simulation adapter as first concrete adapter
- Refactor `PipelineInput` to use `InboundMessageCommand`
- Full channel-aware `OutboundDraft`

**Effort: High** | **Risk: Medium** (more surface area, more refactoring)

### Approach 3: Simulation Only (No New Use Case)
- Add simulation endpoint that directly calls existing modules
- No `InboundMessageCommand` type yet
- No `ProcessChannelInboundMessage` use case
- Inline mapping in handler

**Effort: Low** | **Risk: Medium** (technical debt, harder to extend)

## Recommendation

**Approach 1** — It strikes the right balance: introduces the channel-agnostic command type and the profile→usecase mapping as reusable building blocks, creates a proper use case for the channel pipeline, and keeps the simulation endpoint as a thin HTTP layer. This sets up the foundation for future channel adapters (voice, webchat, telegram) without over-engineering.

## Risks

1. **AiGuideService throws on clarification** — The `serena.mediation.clarify` use case throws `NotImplementedError`. The simulation handler must catch this and return it as a structured error, not a 500.
2. **MockLlmProvider is deterministic** — Simulation results will be predictable (not "real" AI). This is fine for development but should be documented.
3. **No PostgreSQL yet** — All simulation data is in-memory and lost on restart. This is consistent with the current architecture but should be noted.
4. **Server.ts modification** — Adding a new optional handler parameter to `createHttpServer` is a breaking change for any code that calls it positionally (though there's only `server.ts` currently).
5. **Module boundary crossing** — `profileToUseCaseId` imports from both `inbound-gate` and `ai-guide` domains. This is acceptable for a pure mapping function but should be documented as an intentional cross-module dependency.

## Ready for Proposal

**Yes.** The exploration has identified:
- Clear file locations for all new types and use cases
- A recommended approach (Approach 1: Minimal Simulation)
- Specific design decisions with tradeoff analysis
- Test patterns to follow
- Risks and mitigations

The orchestrator should proceed to `/sdd-propose` to create the change proposal with this analysis.
