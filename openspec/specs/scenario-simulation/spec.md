# Scenario Simulation Specification

## Purpose

Define the `POST /dev/simulate/scenario` endpoint that executes multi-step conversation scenarios against the existing `ProcessChannelInboundMessage` use case. Enables developers to test full conversational flows (mediation, risk, unknown sender) in a single HTTP request.

## Requirements

### Requirement: Scenario Endpoint Routing

The system SHALL register `POST /dev/simulate/scenario` guarded by `ENABLE_SIMULATION_ENDPOINTS`. The endpoint SHALL:

1. Return 404 when simulation is disabled
2. Return 405 for non-POST methods
3. Return 200 with valid payload when enabled

#### Scenario: Disabled returns 404

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is not set
- WHEN POST to `/dev/simulate/scenario`
- THEN response is 404 with `error: "simulation_not_enabled"`

#### Scenario: GET returns 405

- GIVEN simulation is enabled
- WHEN GET to `/dev/simulate/scenario`
- THEN response is 405 with `error: "method_not_allowed"`

#### Scenario: Valid POST returns 200

- GIVEN simulation is enabled and valid scenario payload
- WHEN POST to `/dev/simulate/scenario`
- THEN response is 200 with `ScenarioResult` JSON

### Requirement: Payload Validation

The system SHALL validate the request body with these rules:

| Field | Rule | Error |
|-------|------|-------|
| JSON | Must be valid JSON | `invalid_json` |
| `scenarioId` | Required, non-empty string | `invalid_payload` |
| `tenantId` | Required, non-empty string | `invalid_payload` |
| `steps` | Required, non-empty array | `invalid_payload` |
| `steps[].text` | Required, non-empty after trim | `invalid_payload` |
| `channel` | Required at scenario or step level, valid enum | `invalid_payload` |
| `externalSenderId` | Required at scenario or step level | `invalid_payload` |
| `stopOnError` | Optional, boolean (default: false) | `invalid_payload` |
| `metadata` | Optional, must be object if present | `invalid_payload` |

#### Scenario: Invalid JSON → 400

- GIVEN body is `not json`
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_json"`

#### Scenario: Missing scenarioId → 400

- GIVEN body `{"tenantId": "t1", "steps": [{"text": "hi"}]}`
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_payload"`

#### Scenario: Empty steps → 400

- GIVEN body `{"scenarioId": "s1", "tenantId": "t1", "steps": []}`
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_payload"`

#### Scenario: Step missing text → 400

- GIVEN body has step `{"text": ""}` or step without `text`
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_payload"`

#### Scenario: Invalid channel → 400

- GIVEN body has `"channel": "email"`
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_payload"`

#### Scenario: Missing externalSenderId → 400

- GIVEN scenario has no `externalSenderId` and no step overrides it
- WHEN POST to scenario endpoint
- THEN 400 with `error: "invalid_payload"`

### Requirement: Multi-Step Execution

The system SHALL execute each step sequentially, building an `InboundMessageCommand` from scenario defaults merged with per-step overrides, and calling `ProcessChannelInboundMessage.execute()` for each step.

#### Scenario: Simple conversation (2-3 steps)

- GIVEN scenario with 3 steps of ordinary text from known sender
- WHEN executed
- THEN all 3 steps return `ChannelInboundResult` with successful guide results

#### Scenario: Mediation triggers

- GIVEN step text contains "avisale a..." routing to mediation profile
- WHEN executed
- THEN that step's `profileId` indicates mediation and summary `mediationEvents` increments

#### Scenario: Risk triggers

- GIVEN step text contains "necesito ayuda urgente"
- WHEN executed
- THEN that step's `inboundDecision` status is `risk_review` and summary `riskEvents` increments

#### Scenario: Unknown sender blocked

- GIVEN step from WhatsApp number not in identity store
- WHEN executed
- THEN step returns blocked decision and summary `unknownSenders` increments

#### Scenario: Blocked sender (identity blocked)

- GIVEN step from sender with blocked identity status
- WHEN executed
- THEN step returns blocked decision and summary `blockedSenders` increments

#### Scenario: Mixed scenario counts

- GIVEN scenario with conversation + mediation + risk steps
- WHEN executed
- THEN summary counts each event type correctly across all steps

### Requirement: Step Overrides

Each step MAY override scenario-level defaults. Overrides SHALL merge: step fields take precedence over scenario defaults when building `InboundMessageCommand`.

| Override | Effect |
|----------|--------|
| `channel` | Uses step channel instead of scenario default |
| `externalSenderId` | Different sender for that step |
| `personId` | Passed to command |
| `conversationId` | Passed to command |
| `metadata` | Passed to command |
| `occurredAt` | Passed to command |

#### Scenario: Step overrides channel

- GIVEN scenario default channel is "whatsapp"
- AND step 2 has `"channel": "simulation"`
- WHEN step 2 executes
- THEN the command uses channel "simulation"

#### Scenario: Multi-actor scenario

- GIVEN step 1 has `externalSenderId: "user-a"` and step 2 has `externalSenderId: "user-b"`
- WHEN executed
- THEN each step processes with its respective sender identity

### Requirement: Error Handling (stopOnError)

The system SHALL support `stopOnError` flag controlling execution flow on step failure.

#### Scenario: stopOnError=true stops on failure

- GIVEN `stopOnError: true` and step 2 of 3 throws
- WHEN executed
- THEN only steps 1 and 2 appear in result, step 2 has error, step 3 not executed

#### Scenario: stopOnError=false continues

- GIVEN `stopOnError: false` (default) and step 2 of 3 throws
- WHEN executed
- THEN all 3 steps appear in result, step 2 has error, step 3 still runs

#### Scenario: Failed guideResult marks failed step

- GIVEN step's `guideResult.status` is `"failed"`
- WHEN executed
- THEN step appears in `failedSteps`, not `successfulSteps`

#### Scenario: guideError present marks failed step

- GIVEN step result has `guideError` field
- WHEN executed
- THEN step appears in `failedSteps`

### Requirement: Summary Aggregation

The response SHALL include a `summary` object with aggregated counts across all executed steps.

#### Scenario: totalSteps matches executed count

- GIVEN 5 steps with `stopOnError: true` and step 3 fails
- THEN `summary.totalSteps` is 3

#### Scenario: successfulSteps + failedSteps = totalSteps

- GIVEN any execution
- THEN `summary.successfulSteps + summary.failedSteps === summary.totalSteps`

#### Scenario: riskEvents counts urgent_or_risk_content

- GIVEN 2 steps with `inboundDecision.status === "risk_review"`
- THEN `summary.riskEvents` is 2

#### Scenario: mediationEvents counts mediation

- GIVEN steps with `profileId` indicating mediation or `inboundDecision.status` is `needs_mediation`
- THEN `summary.mediationEvents` reflects count

#### Scenario: unknownSenders counts unknown identity

- GIVEN steps where identity is unknown or `inboundDecision.reason` is `unknown_sender`
- THEN `summary.unknownSenders` reflects count

#### Scenario: blockedSenders counts blocked status

- GIVEN steps with `inboundDecision.status === "blocked"`
- THEN `summary.blockedSenders` reflects count

### Requirement: Pipeline Fidelity

The scenario runner SHALL NOT duplicate domain logic. It SHALL use the same `ProcessChannelInboundMessage` instance for all steps.

#### Scenario: Same use case instance

- GIVEN scenario with 3 steps
- WHEN executed
- THEN all steps call the same `ProcessChannelInboundMessage.execute()` instance

#### Scenario: State persists across steps

- GIVEN step 1 creates a session
- WHEN step 2 executes
- THEN step 2 sees the session created by step 1 (shared in-memory state)

#### Scenario: No logic duplication

- GIVEN scenario runner implementation
- THEN it does NOT reimplement identity resolution, gate evaluation, or AI guide logic

### Requirement: Response Schema

The system SHALL return a `ScenarioResult` with this structure:

```typescript
interface ScenarioResult {
  scenarioId: string;
  steps: StepResult[];
  summary: ScenarioSummary;
}

interface StepResult {
  stepIndex: number;
  command: InboundMessageCommand;
  result?: ChannelInboundResult;
  error?: string;
}

interface ScenarioSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  riskEvents: number;
  mediationEvents: number;
  unknownSenders: number;
  blockedSenders: number;
}
```

#### Scenario: Response includes all fields

- GIVEN valid 2-step scenario
- WHEN executed successfully
- THEN response has `scenarioId`, `steps[]` with 2 entries, and `summary` with all counters

## Manual Simulation Readiness

### Requirement: Manual Scenario Simulation Readiness Guide

The project documentation MUST define a copy/paste manual flow for `POST /dev/simulate/scenario` using the same canonical local startup path as inbound simulation. The flow MUST cover ambiguity, risk, unknown user, and continuity cases with explicit multi-step examples, and MUST document which response fields and summary counters to inspect. The guide MUST NOT introduce a runner, console workflow, real WhatsApp/Evolution, PostgreSQL, dependency additions, prompt/policy changes, or unrelated business-logic changes.

#### Scenario: Multi-step ambiguity and risk are documented

- GIVEN a developer needs to validate ambiguous or risky behavior manually
- WHEN they read the scenario simulation guide
- THEN they find copy/paste multi-step examples and the expected fields to inspect in `steps[]` and `summary`
