# Delta for Inbound Simulation Endpoint

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Server Integration — Backward Compatible

The `createHttpServer` function SHALL accept an optional `scenarioHandler` parameter as the 5th positional argument without breaking existing callers.

```typescript
export function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
  internalToken?: string,
  simulationHandler?: PipelineRequestHandler,
  scenarioHandler?: PipelineRequestHandler,  // NEW 5th param
)
```

(Previously: 4 positional parameters — environment, pipelineHandler, internalToken, simulationHandler)

#### Scenario: Existing callers work without changes

- GIVEN code that calls `createHttpServer(env, pipeline, token, simulation)`
- WHEN the call is made
- THEN it works exactly as before (5th param is undefined)

#### Scenario: Scenario handler only invoked for matching path

- GIVEN a scenario handler is provided
- WHEN a request is sent to `/dev/simulate/inbound-message`
- THEN the scenario handler is NOT invoked

#### Scenario: Scenario handler invoked for correct path

- GIVEN a scenario handler is provided
- WHEN a POST request is sent to `/dev/simulate/scenario`
- THEN the scenario handler processes the request
