# Design: Scenario Runner

## Technical Approach

Multi-step conversation simulator that iterates over a sequence of step inputs, building an `InboundMessageCommand` per step via defaults + overrides, then calling the existing `ProcessChannelInboundMessage.execute()` for each. A pure summary function aggregates step results. The runner lives in `bootstrap/` as a dev-tool orchestrator — no domain logic, no new use cases.

## Architecture Decisions

| # | Decision | Options | Choice | Rationale |
|---|----------|---------|--------|-----------|
| 1 | Runner location | bootstrap/ (orchestrator) vs application/ | bootstrap/ | It's a dev-tool that orchestrates existing use cases — same layer as simulation-handler.ts. Not domain logic. |
| 2 | Type placement | Separate types.ts vs inline in runner | inline in scenario-runner.ts | Follows server.ts pattern (`PipelineRequestHandler` defined in-file). Types are single-consumer. ~30 lines. |
| 3 | Server param shape | 5th positional vs config object | 5th positional `scenarioHandler` | Matches existing pattern (4 params already). Config object refactor is a separate concern. Backward-compatible — `undefined` disables route. |
| 4 | Summary calculation | Method on class vs pure function | pure `calculateSummary(steps)` | No state needed. Testable in isolation. Named export. |
| 5 | Step validation | Reuse simulation-handler's `validateCommand` vs new validator | Dedicated `validateScenarioRequest` with adapted rules | Different shape: `steps[]` array, `stopOnError`, defaults propagation. Validation rules differ enough to warrant separate code. |
| 6 | Error on execute() throw | stopOnError breaks loop | stopOnError=true → break; stopOnError=false → capture, continue | Spec-compliant. Matches R5. |

## Data Flow

```
POST /dev/simulate/scenario
  │
  ├─ createScenarioHandler(runner)
  │    ├─ parse JSON → ScenarioRequest
  │    ├─ validate → 400 on invalid
  │    └─ runner.execute(request)
  │
  └─ SimulationScenarioRunner.execute()
       │
       ├─ For each step (sequential):
       │    ├─ merge defaults + step overrides → InboundMessageCommand
       │    ├─ try { result = ProcessChannelInboundMessage.execute(cmd) }
       │    │   catch → capture error, break if stopOnError
       │    └─ push ScenarioStepResult (step index, results, error?)
       │
       ├─ calculateSummary(steps) → ScenarioSummary
       └─ return { scenarioId, steps, summary }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/bootstrap/scenario-runner.ts` | Create | `SimulationScenarioRunner` class + `calculateSummary` + all scenario types |
| `apps/core/src/bootstrap/scenario-handler.ts` | Create | `createScenarioHandler(runner)` factory — HTTP handler for POST /dev/simulate/scenario |
| `apps/core/src/bootstrap/server.ts` | Modify | Add 5th param `scenarioHandler`, route `POST /dev/simulate/scenario`, same env-guard as simulation |
| `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts` | Create | Integration tests: validation, multi-step flows, stopOnError, summary |

## Type Definitions

All defined in `scenario-runner.ts`:

```typescript
type ScenarioRequest = {
  scenarioId: string;
  tenantId: string;
  steps: ScenarioStepInput[];
  stopOnError?: boolean;          // default false
  metadata?: Record<string, unknown>;
};

type ScenarioStepInput = {
  text: string;                   // required, non-empty
  channel?: InboundChannel;       // override scenario default
  externalSenderId?: string;      // required at scenario or step level
  personId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;            // ISO 8601
};

type ScenarioStepResult = {
  index: number;                  // 0-based step index
  input: ScenarioStepInput;
  result: ChannelInboundResult | null;
  error?: string;                 // set when execute() throws
};

type ScenarioSummary = {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  riskEvents: number;
  mediationEvents: number;
  unknownSenders: number;
  blockedSenders: number;
};

type ScenarioResult = {
  scenarioId: string;
  steps: ScenarioStepResult[];
  summary: ScenarioSummary;
};
```

## Summary Rules

`calculateSummary(steps: ScenarioStepResult[]): ScenarioSummary`

A step is **failed** when: `result === null` (threw) OR `result.errors.length > 0` OR `result.guideError !== undefined` OR `result.guideResult?.status === "failed"`.

Event counts (from `result.inboundDecision` and `result.identity`):
- **riskEvents**: `inboundDecision.reason === "urgent_or_risk_content"`
- **mediationEvents**: `inboundDecision.reason === "third_party_mediation_request"` OR `inboundDecision.status === "needs_mediation"`
- **unknownSenders**: `identity.status === "unknown"`
- **blockedSenders**: `identity.status === "blocked"` OR `inboundDecision.status === "blocked"`

Invariant: `successfulSteps + failedSteps === totalSteps`.

## Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| `execute()` throws | Capture error in `step.error`, set `step.result = null`. If `stopOnError` → break. |
| Validation failure | Return 400 with field errors (same shape as simulation-handler). |
| `ProcessChannelInboundMessage` internal error | Already handled by use case (captures in `errors[]`, `guideError`). Runner only adds its own try/catch around the call. |
| Missing `externalSenderId` at scenario AND step | Validation error before execution starts. |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Integration | Full HTTP endpoint | Real `ProcessChannelInboundMessage` via `createInMemoryPipeline()`. HTTP server with scenario handler enabled. Test validation (400), multi-step conversation, stopOnError, summary invariants. |
| Integration | Mocked pipeline for failure paths | Same pattern as `simulation-endpoint.test.ts` clarification test: mock `ProcessInboundMessage` to return a specific route, verify step captures `guideError` as failure. |
| Unit | `calculateSummary` | Pure function — no IO. Test all event count rules independently. |

## Rollback Plan

No migration required. The new endpoint is additive and opt-in (gated by `ENABLE_SIMULATION_ENDPOINTS` via same 404 guard as `/dev/simulate/inbound-message`). Remove the 5th param from `createHttpServer()` call sites to disable. No existing code paths affected.
