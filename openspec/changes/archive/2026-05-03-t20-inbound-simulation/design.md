# Design: T20 — Channel-Agnostic Simulation Endpoint

## Technical Approach

Add an HTTP endpoint (`POST /dev/simulate/inbound-message`) that executes the full inbound pipeline (ProcessInboundMessage → profile resolution → AiGuideService) with no real WhatsApp, no real LLM, and no real message sending. The endpoint is guarded by `ENABLE_SIMULATION_ENDPOINTS=true` and returns a structured trace with all pipeline decisions and AI guide results.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | HTTP route gating | Guard with `ENABLE_SIMULATION_ENDPOINTS` env var in `createHttpServer` fourth optional param | (a) Separate server, (b) Route prefix guard middleware | Follows existing optional-param pattern (`pipelineHandler`), backward compatible |
| 2 | InboundMessageCommand location | `inbound-gate/domain/` | `orchestrator/domain/` | Gate is the natural entry point; command is channel-agnostic adaptation of the existing gate input |
| 3 | profileToUseCaseId mapping | Pure function in `inbound-gate/domain/profile-to-usecase.ts` (cross-module import) | (a) Map inside use case, (b) Duplicate mapping per module | Single source of truth, testable, explicit border between gate and AI guide |
| 4 | AiGuideService wiring | Add to `createInMemoryPipeline` return; reuse same mocks (MockLlmProvider + InMemoryAiInvocationAudit) | (a) Factory separate from orchestrator pipeline, (b) Lazy initialization | Shared in-memory dependencies survive across requests; same pattern as orchestrator wiring |
| 5 | Clarification error handling | `ProcessChannelInboundMessage` catches `NotImplementedError`, returns `errors: ["clarification_not_implemented"]` in result | (a) Let handler catch, (b) Return 501 HTTP | Errors go in result body so consumers get full trace; HTTP 200 with structured error is the simulation contract |
| 6 | OutboundDrafts in result | Empty array `[ ]` — placeholder for Phase 2 when drafts are generated | Generate dummy drafts | Phase 1 scope: simulation endpoint covers inbound gate + AI guide only |

## Data Flow

```
POST /dev/simulate/inbound-message
  { senderId, text, channel }
         │
         ▼
  [simulation-handler.ts]  ── validate (400 if invalid)
         │                    build InboundMessageCommand
         ▼
  ProcessChannelInboundMessage.execute(command)
         │
         ├── 1. Generate traceId (crypto.randomUUID)
         │
         ├── 2. ProcessInboundMessage.execute({ senderId, text })
         │        │
         │        ├── discard ──────────► return result (no AI call)
         │        │
         │        └── llm_profile_required
         │               │
         │               ├── 3. profileToUseCaseId(profileId)
         │               │
         │               └── 4. AiGuideService.execute(useCaseId, { input: text })
         │                      │
         │                      ├── success ───► guideResult: GuideResultSuccess
         │                      └── clarify throws NotImplementedError
         │                             └──► caught → errors: ["clarification_not_implemented"]
         │
         └── 5. Return ChannelInboundResult (traceId, decision, profileId,
                useCaseId, guideResult, outboundDrafts, auditId, warnings, errors)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts` | **Create** | `InboundMessageCommand` and `InboundChannel` types |
| `apps/core/src/modules/inbound-gate/domain/profile-to-usecase.ts` | **Create** | Pure `profileToUseCaseId` mapping function |
| `apps/core/src/modules/inbound-gate/domain/channel-inbound-result.ts` | **Create** | `ChannelInboundResult` (ProcessChannelInboundMessageOutput) |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | **Create** | `ProcessChannelInboundMessage` use case |
| `apps/core/src/bootstrap/simulation-handler.ts` | **Create** | HTTP handler: parse, validate, call use case, respond |
| `apps/core/src/bootstrap/server.ts` | **Modify** | Add 4th optional param `simulationHandler`, mount route when provided |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | **Modify** | Wire `AiGuideService` (registry + provider + audit + pipeline); return it |
| `apps/core/src/config/env.ts` | **Modify** | Add `enableSimulationEndpoints?: boolean` to `AppEnv` |
| `apps/core/src/server.ts` | **Modify** | Read `ENABLE_SIMULATION_ENDPOINTS`, conditionally create/wire simulation handler |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | **Create** | Unit tests for use case |
| `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` | **Create** | Integration tests for endpoint |
| `docs/simulation-api.md` | **Create** | API documentation |

## Interfaces / Contracts

### InboundMessageCommand

```typescript
// apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts

export type InboundChannel = "whatsapp" | "telegram" | "web" | "simulation";

export type InboundMessageCommand = {
  senderId: string;
  text: string;
  channel: InboundChannel;
  receivedAt?: string; // ISO 8601, defaults to now
};
```

### profileToUseCaseId

```typescript
// apps/core/src/modules/inbound-gate/domain/profile-to-usecase.ts

import type { LlmProfileId } from "./llm-profile.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";

export function profileToUseCaseId(profileId: LlmProfileId): GuideUseCaseId {
  switch (profileId) {
    case "conversation":              return "serena.conversation.reply";
    case "mediation_understanding":   return "serena.mediation.understand_request";
    case "risk_review":               return "serena.risk.review";
    case "clarification":             return "serena.mediation.clarify";
  }
}
```

### ChannelInboundResult

```typescript
// apps/core/src/modules/inbound-gate/domain/channel-inbound-result.ts

import type { InboundDecision } from "./inbound-decision.ts";
import type { LlmProfileId } from "./llm-profile.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../ai-guide/domain/guide-result.ts";
import type { OutboundDraft } from "../../mediation-bridge/domain/outbound-draft.ts";

export type ChannelInboundResult = {
  traceId: string;
  inboundDecision: InboundDecision;
  profileId: LlmProfileId | null;       // null when discarded
  useCaseId: GuideUseCaseId | null;     // null when discarded
  guideResult: GuideResult | null;      // null when discarded or clarification throws
  outboundDrafts: OutboundDraft[];      // empty in Phase 1
  auditId: string | null;
  warnings: string[];
  errors: string[];
};
```

### ProcessChannelInboundMessage

```typescript
// apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts

export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: {
    execute(input: { senderId: string; text: string; receivedAt?: Date }): Promise<{
      decision: InboundDecision;
      route: InboundProcessingRoute;
    }>;
  };
  aiGuideService: {
    execute(useCaseId: GuideUseCaseId, input: Record<string, string>): Promise<GuideResult>;
  };
};

export class ProcessChannelInboundMessage {
  constructor(deps: ProcessChannelInboundMessageDependencies);
  async execute(input: InboundMessageCommand): Promise<ChannelInboundResult>;
}
```

### Simulation Handler

```typescript
// apps/core/src/bootstrap/simulation-handler.ts

export type SimulationHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

export function createSimulationHandler(
  useCase: ProcessChannelInboundMessage,
): SimulationHandler;
```

### Server Integration

```typescript
// apps/core/src/bootstrap/server.ts — signature change
export function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
  internalToken?: string,
  simulationHandler?: PipelineRequestHandler,  // NEW — 4th param, optional
);
```

When `simulationHandler` is provided, the server mounts `POST /dev/simulate/inbound-message`. The route has no token guard (dev-only). When absent, the route returns 404 (existing behavior).

### Env changes

```typescript
// apps/core/src/config/env.ts
export type AppEnv = {
  host: string;
  port: number;
  environment: string;
  internalToken: string | undefined;
  enableSimulationEndpoints: boolean;  // NEW — from ENABLE_SIMULATION_ENDPOINTS
};
```

### Wiring in createInMemoryPipeline

```typescript
// apps/core/src/bootstrap/create-in-memory-pipeline.ts — return type change
export async function createInMemoryPipeline(): Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService;  // NEW
}> {
  // ...existing wiring...

  // AI Guide wiring (new)
  const aiRegistry = new UseCaseRegistry();
  for (const contract of defaultContracts) {
    aiRegistry.register(contract);
  }
  const llmProvider = new MockLlmProvider();
  const aiAudit = new InMemoryAiInvocationAudit();
  const executionPipeline = new ExecutionPipeline({ provider: llmProvider, audit: aiAudit });
  const aiGuideService = new AiGuideService({ registry: aiRegistry, pipeline: executionPipeline });

  return { orchestrator, bridgeStore, processedMessageStore, aiGuideService };
}
```

## Testing Strategy

| Layer | What to Test | Approach | File |
|-------|-------------|----------|------|
| **Unit** | `profileToUseCaseId` exhaustive mapping | Pure function; assert each input → expected output | `inbound-gate/tests/profile-to-usecase.test.ts` (inline in use case test file) |
| **Unit** | `ProcessChannelInboundMessage` discard path | Mock ProcessInboundMessage returning discard; assert no AI call, null profileId/useCaseId/guideResult | `inbound-gate/tests/process-channel-inbound-message.test.ts` |
| **Unit** | `ProcessChannelInboundMessage` conversation path | Mock ProcessInboundMessage + Mock AiGuideService; assert correct useCaseId, guideResult present | Same file |
| **Unit** | `ProcessChannelInboundMessage` mediation path | Mock mediation_understanding profile; assert correct useCaseId | Same file |
| **Unit** | `ProcessChannelInboundMessage` risk_review path | Mock risk_review profile; assert correct useCaseId | Same file |
| **Unit** | `ProcessChannelInboundMessage` clarification → structured error | AiGuideService throws for clarify; assert result.errors contains error, status fields present | Same file |
| **Unit** | TraceId generation | Verify traceId is a non-empty string (UUID format) | Same file |
| **Integration** | 404 when `ENABLE_SIMULATION_ENDPOINTS` absent | Start server without flag, POST to endpoint, assert 404 | `bootstrap/tests/simulation-endpoint.test.ts` |
| **Integration** | 200 with full trace on valid payload | Start server with flag, POST valid command, assert 200 + trace fields present | Same file |
| **Integration** | 400 with field errors on invalid payload | POST missing/invalid fields, assert 400 + field-level errors | Same file |
| **Integration** | Blocked sender → discard in result | POST from unknown sender, assert status 200, route=discard, no guide result | Same file |
| **Integration** | Known sender → conversation + guideResult | POST from known sender, assert guideResult present | Same file |
| **Integration** | Clarification → 200 with structured error (not 500) | Trigger clarify use case, assert 200 + errors array in body | Same file |

**Mocking strategy**: Unit tests mock both `ProcessInboundMessage` (for decision control) and `AiGuideService` (for AI response control) using plain objects that satisfy the port types. Integration tests use real `ProcessInboundMessage` + real `MockLlmProvider` — only HTTP is real.

**Test data**: Reuse existing seed contacts from `InMemoryContactDirectory` (maria, carlos, juan). Known sender = `maria`, unknown sender = `pedro`.

## Documentation

`docs/simulation-api.md` structure:

1. **Overview** — What the endpoint does, when to use it
2. **Prerequisites** — `ENABLE_SIMULATION_ENDPOINTS=true`
3. **Endpoint** — `POST /dev/simulate/inbound-message`
4. **Request** — JSON schema with field table (senderId, text, channel, receivedAt)
5. **Response** — JSON schema with `ChannelInboundResult` field table
6. **Examples** — curl for conversation, blocked sender, clarification
7. **Error codes** — 400, 404 (when disabled)
8. **Limitations** — No real LLM, empty outboundDrafts, MockLlmProvider determinism

## Open Questions

None — all design decisions resolved.

## Rollback

Remove `ENABLE_SIMULATION_ENDPOINTS`, revert `server.ts` and `createHttpServer` fourth param, revert `create-in-memory-pipeline.ts` AiGuideService addition, delete all new files. No database migrations.
