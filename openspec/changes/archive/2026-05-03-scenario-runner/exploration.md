# Exploration: Scenario Runner for Multi-Step Conversations

## Current State

The existing simulation endpoint (`POST /dev/simulate/inbound-message`) handles a **single** message per HTTP request. It:
1. Validates the JSON body against `InboundMessageCommand`
2. Calls `ProcessChannelInboundMessage.execute()` once
3. Returns a single `ChannelInboundResult` with the full pipeline trace

The server factory (`createHttpServer`) currently accepts 4 parameters: `environment`, `pipelineHandler`, `internalToken`, `simulationHandler`. Each handler follows the same pattern: a separate file in `bootstrap/` that exports a factory function returning `PipelineRequestHandler`.

## Affected Areas

- `apps/core/src/bootstrap/server.ts` — needs a 5th param for scenario handler (or alternative routing approach)
- `apps/core/src/bootstrap/scenario-runner-handler.ts` — **new** handler file (follows simulation-handler.ts pattern)
- `apps/core/src/bootstrap/scenario-runner.ts` — **new** runner class that orchestrates multi-step execution
- `apps/core/src/server.ts` — wires the new handler conditionally (env guard)
- `apps/core/src/config/env.ts` — may need `ENABLE_SCENARIO_ENDPOINTS` flag (or reuse simulation guard)
- `apps/core/src/bootstrap/tests/scenario-runner.test.ts` — **new** integration tests
- `docs/scenario-runner-api.md` — **new** documentation
- `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` — reference for summary fields

## Approaches

### 1. **New HTTP endpoint + dedicated handler (RECOMMENDED)**
   - `POST /dev/simulate/scenario` with body `{ "scenarioId": "...", "steps": [{ channel, externalSenderId, text }, ...] }`
   - New handler file `bootstrap/scenario-runner-handler.ts` following `simulation-handler.ts` pattern
   - New `ScenarioRunner` class in `bootstrap/scenario-runner.ts` that loops over steps, calling `ProcessChannelInboundMessage.execute()` per step
   - Returns array of `ChannelInboundResult` + summary
   - **Pros**: Clean separation, follows existing patterns, easy to test, no breaking changes
   - **Cons**: Adds another route to server.ts (5th param)
   - **Effort**: Medium

### 2. **Extend existing simulation endpoint with optional `steps` array**
   - `POST /dev/simulate/inbound-message` accepts either single message OR `{ steps: [...] }`
   - No new route needed
   - **Pros**: No server.ts change, single endpoint
   - **Cons**: Violates single responsibility, handler becomes more complex, harder to test, mixes concerns
   - **Effort**: Low

### 3. **CLI-only tool (no HTTP endpoint)**
   - Standalone script that imports pipeline and runs scenarios
   - **Pros**: No server changes, no HTTP overhead
   - **Cons**: Cannot test against running server, loses integration testing value, harder to use in CI
   - **Effort**: Low

### 4. **ScenarioRunner in Application layer as use case**
   - `ScenarioRunner` as a proper use case in `modules/scenario-runner/application/use-cases/`
   - **Pros**: Clean architecture, testable in isolation
   - **Cons**: Overkill for a dev tool; ScenarioRunner is orchestration of existing use cases, not domain logic
   - **Effort**: Medium-High

## Recommendation

**Approach 1** — new HTTP endpoint with dedicated handler. Rationale:

1. **Layer placement**: The `ScenarioRunner` class belongs in `bootstrap/` (not application layer). It's a dev-tool orchestrator that calls existing use cases (`ProcessChannelInboundMessage`), not domain logic. This matches how `simulation-handler.ts` is structured — it's bootstrap-level wiring.

2. **Handler pattern**: Follow `simulation-handler.ts` exactly — separate file, factory function `createScenarioRunnerHandler(processChannelInboundMessage)`, returns `PipelineRequestHandler`. Reuse the same `sendJson` and `readBody` helpers (or extract them to a shared `bootstrap/http-helpers.ts`).

3. **Server extension**: Add a 5th parameter `scenarioHandler?: PipelineRequestHandler` to `createHttpServer()`. Route: `POST /dev/simulate/scenario`. Guard it with the same `ENABLE_SIMULATION_ENDPOINTS` env flag (no need for a separate flag — both are dev-only).

4. **Summary data**: The scenario response should include:
   - `scenarioId`: generated or provided
   - `totalSteps`: number of messages processed
   - `steps`: array of per-step results with:
     - `stepNumber`: 1-based index
     - `command`: the input command (echoed back)
     - `result`: the full `ChannelInboundResult` (traceId, inboundDecision, profileId, useCaseId, guideResult, guideError, identity, warnings, errors)
     - `decisionSummary`: condensed view `{ status, reason, profileId }`
   - `summary`: aggregated view:
     - `decisions`: count by status (`allowed`, `blocked`, `needs_mediation`)
     - `profilesUsed`: unique profileIds encountered
     - `errors`: total step errors
     - `warnings`: all warnings flattened

5. **Session continuity**: The key value proposition — all steps run against the **same** `ProcessChannelInboundMessage` instance, sharing the same in-memory state (sessions, bridge store, contact directory). This means María's first message can start a mediation session, and Carlos's reply in step 2 will find that session.

## Risks

- **State mutation across steps**: The in-memory pipeline has mutable state (sessions, decision audit, processed messages). Steps are NOT isolated — this is intentional for multi-step scenarios but could be confusing if users expect isolation.
- **Long-running requests**: A scenario with many steps could take significant time. Need to consider timeout behavior (the existing `request()` helper in tests uses 5s timeout).
- **Error handling strategy**: If step 3 fails, do we stop the scenario or continue? Recommendation: continue and mark failed steps, return all results.
- **No step dependency**: Steps are sequential but independent in input — no mechanism to use output of step N as input to step N+1. This is fine for Phase 1 but could be a future need.
- **Server.ts parameter growth**: Adding a 5th param to `createHttpServer` is getting unwieldy. Consider refactoring to a config object in a future task (out of scope for this change).

## Ready for Proposal

**Yes** — enough information to write a proposal. The path is clear: new endpoint, new handler file, new runner class, all in `bootstrap/`, following existing patterns.
