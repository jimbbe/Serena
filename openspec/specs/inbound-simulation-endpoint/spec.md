# Inbound Simulation Endpoint Specification

## Purpose

Define the `POST /dev/simulate/inbound-message` HTTP endpoint that allows developers to test the full Serena pipeline (inbound gate → AI guide) without real WhatsApp, real LLM, or real message sending. The endpoint is disabled by default and protected by an environment variable guard.

## Requirements

### Requirement: Environment Variable Guard

The system SHALL define `ENABLE_SIMULATION_ENDPOINTS` as a boolean environment variable in `config/env.ts`. The variable SHALL:

- Default to `false` (or `undefined`) when not set
- Accept `"true"` (case-insensitive) as enabled
- Any other value (including `"false"`, `"0"`, `"yes"`) SHALL be treated as disabled

The `AppEnv` type SHALL be extended to include `enableSimulationEndpoints: boolean`.

#### Scenario: Default is disabled

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is not set
- WHEN `loadAppEnv` is called
- THEN `enableSimulationEndpoints` is `false`

#### Scenario: "true" enables the endpoint

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN `loadAppEnv` is called
- THEN `enableSimulationEndpoints` is `true`

#### Scenario: "TRUE" (uppercase) enables the endpoint

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=TRUE`
- WHEN `loadAppEnv` is called
- THEN `enableSimulationEndpoints` is `true`

#### Scenario: "false" keeps it disabled

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=false`
- WHEN `loadAppEnv` is called
- THEN `enableSimulationEndpoints` is `false`

### Requirement: POST /dev/simulate/inbound-message Route

The system SHALL register `POST /dev/simulate/inbound-message` in `server.ts` via `createHttpServer`. The route SHALL:

1. Accept only `POST` method (return 405 for other methods)
2. Be guarded by `ENABLE_SIMULATION_ENDPOINTS` (return 404 if disabled)
3. Parse and validate the JSON body against `InboundMessageCommand`
4. Call `ProcessChannelInboundMessage.execute(cmd)`
5. Return `ChannelInboundResult` as JSON with status 200 on success

#### Scenario: GET returns 405

- GIVEN the simulation endpoint is enabled
- WHEN a GET request is sent to `/dev/simulate/inbound-message`
- THEN the response is 405 with `error: "method_not_allowed"`

#### Scenario: Disabled endpoint returns 404

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is not set
- WHEN a POST request is sent to `/dev/simulate/inbound-message`
- THEN the response is 404 with `error: "simulation_not_enabled"`

#### Scenario: Enabled endpoint accepts POST

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN a POST request with valid JSON is sent to `/dev/simulate/inbound-message`
- THEN the request is processed and a result is returned

### Requirement: Scenario Handler Route

The system SHALL register `POST /dev/simulate/scenario` alongside the existing `/dev/simulate/inbound-message` route. The route SHALL:

1. Use the same `ENABLE_SIMULATION_ENDPOINTS` guard as the inbound-message endpoint
2. Accept only POST method (return 405 for other methods)
3. Delegate to `ScenarioRunner.execute()` for processing
4. Return `ScenarioResult` as JSON with status 200 on success

#### Scenario: Scenario endpoint shares same guard

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is not set
- WHEN POST to `/dev/simulate/scenario`
- THEN response is 404 with `error: "simulation_not_enabled"`

#### Scenario: Scenario POST returns 200

- GIVEN simulation is enabled and valid scenario payload
- WHEN POST to `/dev/simulate/scenario`
- THEN response is 200 with `ScenarioResult` JSON

### Requirement: Request Body Validation

The endpoint SHALL validate the request body with the following rules (matching the `InboundMessageCommand` validation spec):

1. Body must be valid JSON
2. `channel` — required, must be one of the six valid channel strings
3. `externalSenderId` — required, non-empty after trimming
4. `text` — required, non-empty after trimming
5. Optional fields validated if present (see inbound-simulation-command spec)

#### Scenario: Invalid JSON returns 400

- GIVEN a request with `Content-Type: application/json`
- WHEN the body is not valid JSON
- THEN the response is 400 with `error: "invalid_json"`

#### Scenario: Missing required fields returns 400 with field errors

- GIVEN a request with `{"channel": "simulation"}` (missing externalSenderId and text)
- WHEN the request is processed
- THEN the response is 400 with `error: "invalid_payload"` and `fields` array listing missing fields

#### Scenario: Invalid channel value returns 400

- GIVEN a request with `{"channel": "email", "externalSenderId": "x", "text": "y"}`
- WHEN the request is processed
- THEN the response is 400 with a field error for `channel`

### Requirement: Successful Response

On successful execution, the endpoint SHALL return:

- Status: `200`
- Content-Type: `application/json; charset=utf-8`
- Body: `ChannelInboundResult` as JSON

#### Scenario: Valid conversation request returns 200 with full trace

- GIVEN a valid command from a known sender with ordinary text
- WHEN the request is processed
- THEN the response is 200
- AND the body contains `traceId`, `identity`, `inboundDecision`, `profileId`, `useCaseId`, `guideResult`

#### Scenario: Blocked sender returns 200 with discard result

- GIVEN a valid command from an unknown sender
- WHEN the request is processed
- THEN the response is 200
- AND the body contains `inboundDecision` with status `"blocked"`
- AND `guideResult` is `null` or `undefined`

#### Scenario: Clarification returns 200 with structured error

- GIVEN a valid command that routes to the `clarification` profile
- WHEN the request is processed
- THEN the response is 200 (NOT 500)
- AND the body contains `guideError` with code `"not_implemented"`

### Requirement: Error Responses

The endpoint SHALL return appropriate error responses:

| Status | Condition | Response Body |
|--------|-----------|---------------|
| 404 | Endpoint disabled | `{ error: "simulation_not_enabled" }` |
| 405 | Wrong HTTP method | `{ error: "method_not_allowed", detail: "..." }` |
| 400 | Invalid JSON | `{ error: "invalid_json" }` |
| 400 | Validation errors | `{ error: "invalid_payload", detail: "...", fields: [...] }` |
| 500 | Pipeline execution failure | `{ error: "pipeline_execution_failed", detail: "..." }` |

#### Scenario: Pipeline exception returns 500

- GIVEN the simulation endpoint is enabled
- WHEN `ProcessChannelInboundMessage.execute` throws an unexpected error
- THEN the response is 500 with `error: "pipeline_execution_failed"`

### Requirement: Server Integration — Backward Compatible

The `createHttpServer` function SHALL accept optional `simulationHandler` (4th) and `scenarioHandler` (5th) positional arguments without breaking existing callers.

```typescript
export function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
  internalToken?: string,
  simulationHandler?: PipelineRequestHandler,
  scenarioHandler?: PipelineRequestHandler,  // NEW 5th param
)
```

(Previously: 3 positional parameters — environment, pipelineHandler, internalToken)

#### Scenario: Existing callers work without changes

- GIVEN code that calls `createHttpServer(env, pipeline, token, simulation)`
- WHEN the call is made
- THEN it works exactly as before (5th param is undefined)

#### Scenario: Simulation handler is only invoked for matching path

- GIVEN a simulation handler is provided
- WHEN a request is sent to `/internal/pipeline/process`
- THEN the simulation handler is NOT invoked

#### Scenario: Scenario handler only invoked for matching path

- GIVEN a scenario handler is provided
- WHEN a request is sent to `/dev/simulate/inbound-message`
- THEN the scenario handler is NOT invoked

#### Scenario: Scenario handler invoked for correct path

- GIVEN a scenario handler is provided
- WHEN a POST request is sent to `/dev/simulate/scenario`
- THEN the scenario handler processes the request

### Requirement: Handler Factory

The system SHALL define `createSimulationHandler(processChannelInbound: ProcessChannelInboundMessage): PipelineRequestHandler` in `bootstrap/simulation-handler.ts`. The handler SHALL:

1. Read and parse the request body
2. Validate against `InboundMessageCommand`
3. Call `processChannelInbound.execute(cmd)`
4. Return the result as JSON
5. Handle errors gracefully (no uncaught exceptions)

#### Scenario: Handler reads body correctly

- GIVEN a POST request with JSON body
- WHEN the handler is invoked
- THEN it parses the body and extracts the command fields

#### Scenario: Handler returns JSON response

- GIVEN a successfully processed command
- WHEN the handler completes
- THEN it calls `sendJson(res, 200, result)`

### Requirement: Scenario Handler Factory

The system SHALL define `createScenarioHandler(runner: ScenarioRunner): PipelineRequestHandler` in `bootstrap/scenario-runner-handler.ts`. The handler SHALL:

1. Read and parse the request body as JSON
2. Validate against `ScenarioInput` schema (scenarioId, tenantId, steps, channel, externalSenderId, stopOnError, metadata)
3. Call `runner.execute(input)`
4. Return the `ScenarioResult` as JSON
5. Handle errors gracefully (no uncaught exceptions)

#### Scenario: Handler validates and delegates

- GIVEN a POST request with valid scenario JSON body
- WHEN the handler is invoked
- THEN it validates the body and calls `runner.execute()`

#### Scenario: Handler returns JSON response

- GIVEN a successfully processed scenario
- WHEN the handler completes
- THEN it calls `sendJson(res, 200, scenarioResult)`

### Requirement: Pipeline Factory Wiring

The `createInMemoryPipeline` function SHALL be extended to return `aiGuideService` alongside existing outputs:

```typescript
export async function createInMemoryPipeline(): Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService;  // NEW
}>
```

The `AiGuideService` SHALL be wired with:
- `UseCaseRegistry` with all default contracts registered
- `MockLlmProvider` (deterministic, no real LLM calls)
- `InMemoryAiInvocationAudit`
- `ExecutionPipeline`

#### Scenario: Pipeline factory returns aiGuideService

- GIVEN `createInMemoryPipeline` is called
- WHEN it resolves
- THEN the result includes `aiGuideService`

#### Scenario: AiGuideService uses MockLlmProvider

- GIVEN the pipeline factory has completed
- WHEN `aiGuideService.execute` is called
- THEN it uses `MockLlmProvider` (no real LLM calls)

### Requirement: Bootstrap Wiring in server.ts

The main `server.ts` bootstrap file SHALL:

1. Check `config.enableSimulationEndpoints`
2. If enabled, create `ProcessChannelInboundMessage` with the pipeline's `ProcessInboundMessage` and `aiGuideService`
3. Create `createSimulationHandler` and pass it to `createHttpServer`
4. If disabled, pass `undefined` as the simulation handler

#### Scenario: Server starts with simulation disabled by default

- GIVEN no `ENABLE_SIMULATION_ENDPOINTS` env var
- WHEN the server starts
- THEN the simulation route returns 404

#### Scenario: Server starts with simulation enabled

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN the server starts
- THEN the simulation route processes requests
