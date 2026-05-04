# Proposal: Scenario Runner for Multi-Step Conversations

## Intent

Add a `POST /dev/simulate/scenario` endpoint that executes multi-step conversation scenarios against the existing `ProcessChannelInboundMessage` use case, enabling developers to test full conversational flows (mediation, risk, unknown sender) in a single request.

## Scope

### In Scope
- New HTTP endpoint `POST /dev/simulate/scenario` guarded by `ENABLE_SIMULATION_ENDPOINTS`
- `ScenarioRunner` class in `bootstrap/` that iterates steps, builds `InboundMessageCommand` per step, calls `ProcessChannelInboundMessage.execute()`
- Request body with `scenarioId`, `tenantId`, step defaults (`channel`, `externalSenderId`, `conversationId`), `stopOnError`, and `steps[]` with per-step overrides
- Response with per-step results + aggregated summary (successfulSteps, failedSteps, riskEvents, mediationEvents, unknownSenders, blockedSenders)
- Tests covering conversation, mediation, risk, unknown sender, blocked sender, stopOnError, ai-guide failed
- Documentation in `docs/simulation-api.md`

### Out of Scope
- Real WhatsApp, real LLM, or real message sending
- Step output chaining (using step N output as step N+1 input)
- CLI tool or non-HTTP scenario execution
- Moving `ScenarioRunner` to application layer (it's a dev-tool orchestrator, not domain logic)
- Refactoring `createHttpServer` to use config object (deferred — 5th param is acceptable for now)

## Capabilities

### New Capabilities
- `scenario-simulation`: Multi-step scenario execution endpoint with per-step results and aggregated summary. Covers request validation, step orchestration, summary aggregation rules, and error handling (stopOnError).

### Modified Capabilities
- `inbound-simulation-endpoint`: Add `scenarioHandler` as 5th optional parameter to `createHttpServer()`, register route `POST /dev/simulate/scenario` alongside existing `/dev/simulate/inbound-message`.

## Approach

### New Files
- `apps/core/src/bootstrap/scenario-runner.ts` — `ScenarioRunner` class: loops over steps, merges defaults + overrides into `InboundMessageCommand`, calls `ProcessChannelInboundMessage.execute()`, captures result/error, builds summary
- `apps/core/src/bootstrap/scenario-runner-handler.ts` — HTTP handler factory `createScenarioRunnerHandler(runner)`: validates request body, delegates to runner, returns JSON response
- `apps/core/src/bootstrap/tests/scenario-runner.test.ts` — `node:test` integration tests with shared server fixtures

### Modified Files
- `apps/core/src/bootstrap/server.ts` — add 5th param `scenarioHandler?: PipelineRequestHandler`, route `POST /dev/simulate/scenario`
- `apps/core/src/server.ts` — wire scenario handler conditionally (same env guard as simulation)
- `docs/simulation-api.md` — add scenario endpoint documentation

### Architecture

```
HTTP Request → server.ts route → scenario-runner-handler.ts
  → validates body → ScenarioRunner.execute()
    → for each step: build InboundMessageCommand (defaults + overrides)
    → ProcessChannelInboundMessage.execute(cmd)  ← existing use case, NO duplication
    → capture ChannelInboundResult or error
    → aggregate summary
  → return ScenarioResult JSON
```

Clean Architecture boundary: `ScenarioRunner` lives in `bootstrap/` as a dev-tool orchestrator. It calls the existing application-layer use case `ProcessChannelInboundMessage` — no domain logic duplication.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `bootstrap/scenario-runner.ts` | New | Runner class orchestrating multi-step execution |
| `bootstrap/scenario-runner-handler.ts` | New | HTTP handler with body validation |
| `bootstrap/tests/scenario-runner.test.ts` | New | Integration tests |
| `bootstrap/server.ts` | Modified | 5th param + route registration |
| `server.ts` | Modified | Wire scenario handler with env guard |
| `docs/simulation-api.md` | Modified | Add scenario endpoint docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| State mutation across steps (sessions, audit) | Medium | Intentional — shared state is the value prop; document clearly |
| Long-running requests with many steps | Medium | Tests use small step counts; timeout handled by existing test infra |
| `createHttpServer` param growth (5 params) | Low | Acceptable for now; refactor to config object in future task |
| Summary aggregation logic complexity | Low | Clear rules defined in requirements; tested per scenario |

## Rollback Plan

1. Remove `scenarioHandler` param from `createHttpServer()` call in `server.ts`
2. Delete `bootstrap/scenario-runner.ts`, `bootstrap/scenario-runner-handler.ts`, `bootstrap/tests/scenario-runner.test.ts`
3. Revert `docs/simulation-api.md` changes
4. No database or state migration needed — pure code addition

## Dependencies

- Existing `ProcessChannelInboundMessage` use case (T19/T20)
- Existing `ChannelInboundResult` type
- Existing simulation endpoint guard (`ENABLE_SIMULATION_ENDPOINTS`)

## Success Criteria

- [ ] `POST /dev/simulate/scenario` returns 404 when `ENABLE_SIMULATION_ENDPOINTS` is not set
- [ ] Valid scenario with 3+ steps returns 200 with correct per-step results and summary
- [ ] `stopOnError: true` stops execution on first failed step
- [ ] `stopOnError: false` (default) continues through all steps regardless of errors
- [ ] Summary correctly counts riskEvents, mediationEvents, unknownSenders, blockedSenders
- [ ] All 7 test scenarios pass (conversation, mediation, risk, unknown sender, blocked sender, stopOnError true/false, ai-guide failed)
- [ ] `docs/simulation-api.md` includes scenario endpoint documentation with examples
- [ ] No logic duplication — runner calls `ProcessChannelInboundMessage.execute()` only
