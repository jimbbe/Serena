# Inbound Simulation Tests Specification

## Purpose

Define the test coverage requirements for the T20 simulation feature, ensuring all new types, functions, use cases, and the HTTP endpoint are verified with unit and integration tests following the project's established patterns.

## Requirements

### Requirement: Test Tooling and Patterns

All tests SHALL use:
- `node:test` for test runner
- `node:assert/strict` for assertions
- TypeScript strict mode (no `any`, no implicit `any`)
- Colocated `tests/` directories per module for unit tests
- `bootstrap/tests/` for integration tests

#### Scenario: Unit tests follow existing patterns

- GIVEN a new unit test file
- WHEN it is written
- THEN it uses `import test from "node:test"` and `import assert from "node:assert/strict"`

#### Scenario: Integration tests follow existing patterns

- GIVEN a new integration test file
- WHEN it is written
- THEN it uses `before`/`after` for server setup, `describe`/`it` for grouping, and helper functions like `request()`

### Requirement: Unit Tests — InboundMessageCommand Type

Since `InboundMessageCommand` is a TypeScript type (not a runtime value), its "tests" SHALL be compile-time verification:

- A test file SHALL exist at `inbound-gate/tests/inbound-message-command.test.ts`
- It SHALL contain tests that verify the type accepts valid values and rejects invalid ones at compile time
- Runtime validation tests SHALL be covered by the endpoint and use case tests

#### Scenario: Type accepts valid channel values

- GIVEN a variable typed as `InboundMessageCommand`
- WHEN assigned with `channel: "simulation"`
- THEN it compiles without errors

#### Scenario: Type rejects invalid channel values

- GIVEN a variable typed as `InboundMessageCommand`
- WHEN assigned with `channel: "email"` (as a literal)
- THEN TypeScript reports a compile error

### Requirement: Unit Tests — profileToUseCaseId

Tests SHALL exist at `inbound-gate/tests/profile-to-usecase.test.ts` covering:

1. All four profile → use case mappings
2. Pure function behavior (deterministic, no side effects)
3. Type exhaustiveness (new profile causes compile error)

#### Scenario: All mappings tested

- GIVEN the `profileToUseCaseId` function
- WHEN tested with each of the four `LlmProfileId` values
- THEN each returns the correct `GuideUseCaseId`

#### Scenario: Deterministic behavior verified

- GIVEN the function is called twice with the same input
- WHEN the results are compared
- THEN they are strictly equal

### Requirement: Unit Tests — ProcessChannelInboundMessage

Tests SHALL exist at `inbound-gate/tests/process-channel-inbound-message.test.ts` covering:

1. Blocked sender flow (no AI call)
2. Allowed sender → conversation flow (AI called)
3. Needs mediation → risk review flow (AI called)
4. Needs mediation → mediation understanding flow (AI called)
5. Clarification flow (NotImplementedError caught)
6. Trace ID generated
7. Command-to-input adaptation (occurredAt parsing)
8. Result structure completeness

#### Scenario: Blocked sender does not call AI guide

- GIVEN a mock `ProcessInboundMessage` that returns a blocked decision
- AND a mock `AiGuideService` that tracks calls
- WHEN `execute` is called
- THEN `AiGuideService.execute` is NOT called
- AND the result has `guideResult: undefined`

#### Scenario: Conversation flow calls AI guide

- GIVEN a mock `ProcessInboundMessage` that returns an allowed decision with `conversation` profile
- AND a mock `AiGuideService` that returns a success result
- WHEN `execute` is called
- THEN `AiGuideService.execute` IS called with `useCaseId = "serena.conversation.reply"`
- AND the result contains `guideResult`

#### Scenario: Clarification error is caught and structured

- GIVEN a mock `ProcessInboundMessage` that returns a decision routing to `clarification`
- AND a mock `AiGuideService` that throws `NotImplementedError`
- WHEN `execute` is called
- THEN the result has `guideError` with code `"not_implemented"`
- AND `guideResult` is `undefined`
- AND the use case does NOT throw

#### Scenario: Trace ID is present in result

- GIVEN any valid command
- WHEN `execute` is called
- THEN `result.traceId` is a non-empty string

#### Scenario: Custom trace ID generator is used

- GIVEN a `generateTraceId` function that returns `"test-trace-123"`
- WHEN `execute` is called
- THEN `result.traceId === "test-trace-123"`

### Requirement: Integration Tests — Simulation Endpoint

Tests SHALL exist at `bootstrap/tests/simulation-endpoint.test.ts` covering:

1. Endpoint disabled → 404
2. Valid payload → 200 with full trace
3. Invalid JSON → 400
4. Missing required fields → 400 with field errors
5. Invalid channel → 400
6. Blocked sender → 200 with discard result
7. Conversation → 200 with guideResult
8. Clarification → 200 with structured error (not 500)
9. Wrong HTTP method → 405
10. Existing pipeline endpoint unchanged

#### Scenario: Endpoint returns 404 when disabled

- GIVEN a server started without `ENABLE_SIMULATION_ENDPOINTS`
- WHEN POST `/dev/simulate/inbound-message` is called
- THEN the response status is 404

#### Scenario: Endpoint returns 200 with valid payload

- GIVEN a server started with `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN POST `/dev/simulate/inbound-message` is called with a valid command from a known sender
- THEN the response status is 200
- AND the body contains `traceId`, `inboundDecision`, `profileId`, `useCaseId`, `guideResult`

#### Scenario: Invalid JSON returns 400

- GIVEN a server with simulation enabled
- WHEN POST `/dev/simulate/inbound-message` is called with invalid JSON
- THEN the response status is 400
- AND the body contains `error: "invalid_json"`

#### Scenario: Missing fields returns 400 with details

- GIVEN a server with simulation enabled
- WHEN POST `/dev/simulate/inbound-message` is called with `{"channel": "simulation"}`
- THEN the response status is 400
- AND the body contains `error: "invalid_payload"` and `fields` array

#### Scenario: Blocked sender returns 200 with discard

- GIVEN a server with simulation enabled
- WHEN POST `/dev/simulate/inbound-message` is called with an unknown sender
- THEN the response status is 200
- AND the body contains `inboundDecision.status === "blocked"`

#### Scenario: Clarification returns 200, not 500

- GIVEN a server with simulation enabled
- WHEN POST `/dev/simulate/inbound-message` is called with a command that routes to clarification
- THEN the response status is 200
- AND the body contains `guideError` with code `"not_implemented"`

#### Scenario: Wrong method returns 405

- GIVEN a server with simulation enabled
- WHEN GET `/dev/simulate/inbound-message` is called
- THEN the response status is 405

#### Scenario: Existing pipeline endpoint is unchanged

- GIVEN a server with simulation enabled
- WHEN POST `/internal/pipeline/process` is called with valid pipeline input
- THEN the response is the same as before T20 (no regression)

### Requirement: Test Coverage Threshold

The feature SHALL achieve at least 90% line coverage for:
- `inbound-gate/domain/inbound-message-command.ts` (type-only, compile-time)
- `inbound-gate/domain/profile-to-usecase.ts`
- `inbound-gate/application/use-cases/process-channel-inbound-message.ts`
- `bootstrap/simulation-handler.ts`
- `config/env.ts` (new env var parsing)

#### Scenario: profileToUseCaseId has 100% coverage

- GIVEN the test suite runs
- WHEN coverage is measured
- THEN `profile-to-usecase.ts` has 100% branch and line coverage

#### Scenario: ProcessChannelInboundMessage has 90%+ coverage

- GIVEN the test suite runs
- WHEN coverage is measured
- THEN `process-channel-inbound-message.ts` has at least 90% line coverage

### Requirement: No Regression in Existing Tests

All existing 234+ tests SHALL continue to pass after T20 changes. The simulation feature SHALL NOT modify existing behavior of:
- `POST /internal/pipeline/process`
- `GET /health`
- `ProcessInboundMessage`
- `EvaluateInboundMessage`
- `AiGuideService`

#### Scenario: All existing tests pass

- GIVEN the full test suite is run
- WHEN tests complete
- THEN all pre-existing tests pass with the same results as before T20

### Requirement: npm run check Passes

After implementation, `npm run check` SHALL pass with zero errors and zero warnings. This includes:
- TypeScript compilation (`tsc --noEmit`)
- Linting (if configured)
- Test execution
- Type checking in strict mode

#### Scenario: Full check passes

- GIVEN all T20 code is implemented
- WHEN `npm run check` is executed
- THEN it exits with code 0
