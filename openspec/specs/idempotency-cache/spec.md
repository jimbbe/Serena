# Idempotency Cache Specification

## Purpose

Prevent duplicate pipeline execution for the same incoming message by detecting repeated `messageId` values and returning cached results. Uses in-memory storage only (data lost on restart).

## Requirements

### Requirement: MessageId Validation

The system MUST require a `messageId` field in the pipeline payload. It MUST be a non-empty string. Requests without a valid `messageId` MUST be rejected with HTTP 400.

#### Scenario: Missing messageId returns 400

- GIVEN a valid token is provided
- WHEN a POST request is sent to `/internal/pipeline/process` with a payload that has no `messageId` field
- THEN the response is 400 with `{ error: "invalid_payload" }`
- AND the validation errors include `messageId`

#### Scenario: Empty messageId returns 400

- GIVEN a valid token is provided
- WHEN a POST request is sent to `/internal/pipeline/process` with `messageId: ""` (empty string)
- THEN the response is 400 with `{ error: "invalid_payload" }`
- AND the validation errors include `messageId`

#### Scenario: Whitespace-only messageId returns 400

- GIVEN a valid token is provided
- WHEN a POST request is sent to `/internal/pipeline/process` with `messageId: "   "` (whitespace only)
- THEN the response is 400 with `{ error: "invalid_payload" }`

### Requirement: Idempotent Pipeline Execution

The system MUST track processed messageIds. On first encounter, the pipeline executes and the result is cached. On duplicate encounter, the cached result is returned without re-executing the pipeline.

#### Scenario: First request with new messageId executes pipeline

- GIVEN a valid token and a `messageId` that has never been seen
- WHEN a POST request is sent to `/internal/pipeline/process` with a valid payload
- THEN the pipeline executes
- AND the response is 200 with the `PipelineResult`
- AND the response does NOT contain a `duplicate` field (or `duplicate: false`)
- AND the messageId is stored for future detection

#### Scenario: Duplicate messageId returns cached result

- GIVEN a valid token and a `messageId` that was previously processed
- WHEN a POST request is sent to `/internal/pipeline/process` with the same payload and same `messageId`
- THEN the pipeline does NOT execute again
- AND the response is 200 with the same `PipelineResult` as the first request
- AND the response contains `duplicate: true`

#### Scenario: Different messageIds execute independently

- GIVEN a valid token
- WHEN two POST requests are sent with different `messageId` values and different payloads
- THEN each request executes the pipeline independently
- AND neither response contains `duplicate: true`
- AND results do not cross-contaminate

### Requirement: In-Memory Storage

The idempotency store MUST be in-memory only. A `ProcessedMessageStore` port MUST exist in the domain layer with an `InMemoryProcessedMessageStore` adapter in the infrastructure layer. Data loss on process restart is an accepted limitation for Phase 1.

#### Scenario: Idempotency data is lost on restart

- GIVEN a messageId was processed and cached
- WHEN the server process restarts
- THEN the same messageId is treated as new (not a duplicate)
- AND the pipeline executes again
- AND this limitation is documented in `docs/t17b-internal-hardening.md`
