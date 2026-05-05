# Delta Spec: T30A — Post-T29 Local Readiness + Docs/Spec Sync

## Purpose

Address validation gaps, configuration gaps, and documentation hygiene discovered after T29 closure. Ensures local dev stack is reliable, resilient to hangs, and specs reflect actual system state.

---

## Modified Capability: internal-pipeline-http (receivedAt validation)

### Requirement: receivedAt Must Be Valid ISO 8601 UTC Timestamp

The system MUST validate that the `receivedAt` field in the pipeline input body is a valid ISO 8601 UTC timestamp string with `Z` suffix when present. A string that is present but not a valid ISO 8601 UTC timestamp MUST be rejected with HTTP 400 using the existing `invalid_payload` error format.

#### Validation rules

- If `receivedAt` is absent → pipeline proceeds (backward compatible, uses server time downstream).
- If `receivedAt` is present and `typeof === "string"` → MUST pass strict ISO 8601 UTC validation (regex + Date round-trip).
- Valid formats: `"2026-05-02T22:00:00.000Z"`, `"2026-05-02T22:00:00Z"`.
- Invalid values like `"not-a-date"`, `"abc"`, `""`, `"2026-05-02T12:34:56"` (no timezone), `"2026/05/02"`, `"May 2 2026"`, `"2026-13-45"` MUST be rejected.
- Rejection MUST use the existing generic format: `{ error: "invalid_payload", detail: "One or more fields are invalid or missing", fields: [{ field: "receivedAt", message: "Must be a valid ISO 8601 UTC timestamp" }] }`.

#### Scenario: Valid ISO 8601 timestamp passes validation

- GIVEN a POST to `/internal/pipeline/process` with `receivedAt: "2026-05-02T22:00:00.000Z"`
- WHEN the request is processed
- THEN validation passes and the pipeline executes normally

#### Scenario: Invalid string in receivedAt returns 400

- GIVEN a POST to `/internal/pipeline/process` with `receivedAt: "not-a-date"`
- WHEN the request is processed
- THEN the response is 400 with `{ error: "invalid_payload", detail: "One or more fields are invalid or missing", fields: [{ field: "receivedAt", message: "Must be a valid ISO 8601 UTC timestamp" }] }`
- AND the pipeline is NOT executed

#### Scenario: Empty string in receivedAt returns 400

- GIVEN a POST to `/internal/pipeline/process` with `receivedAt: ""`
- WHEN the request is processed
- THEN the response is 400 with `{ error: "invalid_payload", fields: [{ field: "receivedAt", message: "Must be a valid ISO 8601 UTC timestamp" }] }`
- AND the pipeline is NOT executed

#### Scenario: Missing receivedAt is accepted (backward compatible)

- GIVEN a POST to `/internal/pipeline/process` WITHOUT a `receivedAt` field
- WHEN the request is processed
- THEN validation passes and the pipeline executes (uses server time downstream)

#### Scenario: ISO 8601 without timezone or with offset is rejected

- GIVEN a POST with `receivedAt: "2026-05-02T22:00:00.000+03:00"` or `receivedAt: "2026-05-02T22:00:00"`
- WHEN the request is processed
- THEN the response is 400 — only UTC Z-suffixed timestamps are accepted

#### Scenario: Invalid date values like month 13 are rejected

- GIVEN a POST with `receivedAt: "2026-13-45T00:00:00.000Z"`
- WHEN the request is processed
- THEN the response is 400 — impossible dates fail the Date round-trip check

---

## Modified Capability: gateway-wa (timeout on fetch to core)

### Requirement: Configurable Timeout on HTTP Call to Serena Core

The system MUST apply a configurable timeout to the `fetch()` call in `call-serena-core.ts`. The timeout MUST use `AbortSignal` to cancel the request when exceeded.

#### Configuration

- `GATEWAY_CORE_TIMEOUT_MS`: timeout in milliseconds for the HTTP call to Serena Core.
- Default value: `30000` (30 seconds) — aligned with `AI_TIMEOUT_MS` default in core.
- Value MUST be a positive integer. Invalid values MUST fall back to the default with a warning logged.

#### Scenario: Default timeout of 30s is applied when env var not set

- GIVEN `GATEWAY_CORE_TIMEOUT_MS` is not set
- WHEN `callSerenaCore()` is invoked
- THEN the fetch uses a 30000ms timeout via `AbortSignal.timeout(30000)`

#### Scenario: Custom timeout from env var is applied

- GIVEN `GATEWAY_CORE_TIMEOUT_MS` is set to `"15000"`
- WHEN `callSerenaCore()` is invoked
- THEN the fetch uses a 15000ms timeout

#### Scenario: Invalid timeout value falls back to default

- GIVEN `GATEWAY_CORE_TIMEOUT_MS` is set to `"abc"` (non-numeric)
- WHEN `callSerenaCore()` is invoked
- THEN the fetch uses the default 30000ms timeout
- AND a warning is logged indicating the invalid value

#### Scenario: Zero or negative timeout falls back to default

- GIVEN `GATEWAY_CORE_TIMEOUT_MS` is set to `"0"` or `"-1000"`
- WHEN `callSerenaCore()` is invoked
- THEN the fetch uses the default 30000ms timeout
- AND a warning is logged

#### Scenario: Timeout error is propagated with descriptive message

- GIVEN Serena Core does not respond within the configured timeout
- WHEN the timeout expires
- THEN the fetch is aborted
- AND the error is propagated with a message indicating the request timed out

---

## Modified Capability: gateway-wa (strong JSON response validation from core)

### Requirement: Validate Core Response Structure

The system MUST validate that the HTTP response from Serena Core is valid JSON and conforms to the expected `PipelineResult` structure. Malformed or unexpected responses MUST be rejected with a clear error — NOT passed through silently.

#### Validation rules

- Response body MUST be valid JSON. If parsing fails → error with descriptive message.
- Response MUST contain a `type` field (string, non-empty). If missing → error.
- Response `type` MUST be one of the known `PipelineResult` discriminated union values: `discard`, `conversation_pending`, `risk_review_required`, `mediation_not_understood`, `recipient_not_found`, `mediation_started`, `mediation_reply_recorded`, `ambiguous_active_session`. If unknown → error.
- Required fields per `type` MUST be present (e.g., `mediation_started` requires `sessionId`, `requesterId`, `recipientId`, `recipientDisplayName`, `rewordedText`).

#### Scenario: Valid PipelineResult passes validation

- GIVEN Serena Core returns `{ "type": "discard", "reason": "Sender not authorized" }`
- WHEN the response is validated
- THEN validation passes and the result is used normally

#### Scenario: Non-JSON response returns error

- GIVEN Serena Core returns a plain text response (not JSON)
- WHEN the response body is parsed
- THEN an error is returned indicating the response was not valid JSON
- AND the raw response body (truncated to 500 chars) is included for debugging

#### Scenario: Missing type field returns error

- GIVEN Serena Core returns `{ "reason": "something" }` (no `type` field)
- WHEN the response is validated
- THEN an error is returned indicating the `type` field is missing

#### Scenario: Unknown type value returns error

- GIVEN Serena Core returns `{ "type": "unknown_action" }`
- WHEN the response is validated
- THEN an error is returned listing the valid PipelineResult types

#### Scenario: mediation_started missing required fields returns error

- GIVEN Serena Core returns `{ "type": "mediation_started", "sessionId": "s1" }` (missing requesterId, recipientId, etc.)
- WHEN the response is validated
- THEN an error is returned listing the missing required fields

---

## Modified Capability: gateway-wa (timestamp validation on mock events)

### Requirement: Mock Event Timestamp Must Be Valid ISO 8601 UTC

The system MUST validate that the `timestamp` field in a `MockWhatsAppEvent` is a non-empty, valid ISO 8601 UTC timestamp string with `Z` suffix. Empty, whitespace-only, or non-ISO-UTC timestamps MUST be rejected BEFORE any HTTP call to Serena Core.

#### Validation rules

- `timestamp` MUST be a non-empty string (trimmed).
- `timestamp` MUST pass strict ISO 8601 UTC validation (regex + Date round-trip, same rules as `receivedAt` above).
- Only `Z` suffix is accepted (no timezone offsets like `+03:00`).
- Validation MUST occur in `normalize-mock-event.ts` alongside existing `messageId`, `from`, `text` validation.
- Rejected events MUST return a clear error mentioning `timestamp`.

#### Scenario: Valid timestamp passes validation

- GIVEN a `MockWhatsAppEvent` with `timestamp: "2026-05-02T22:00:00.000Z"`
- WHEN the event is validated
- THEN validation passes for the timestamp field

#### Scenario: Empty timestamp is rejected

- GIVEN a `MockWhatsAppEvent` with `timestamp: ""`
- WHEN the event is validated
- THEN validation fails with an error indicating `timestamp` is required and non-empty
- AND no HTTP call is made

#### Scenario: Whitespace-only timestamp is rejected

- GIVEN a `MockWhatsAppEvent` with `timestamp: "   "`
- WHEN the event is validated
- THEN validation fails with an error indicating `timestamp` is required and non-empty
- AND no HTTP call is made

#### Scenario: Non-ISO timestamp is rejected

- GIVEN a `MockWhatsAppEvent` with `timestamp: "not-a-date"`
- WHEN the event is validated
- THEN validation fails with an error indicating `timestamp` must be a valid ISO 8601 UTC timestamp
- AND no HTTP call is made

#### Scenario: Multiple validation failures report all fields

- GIVEN a `MockWhatsAppEvent` with empty `messageId` AND invalid `timestamp`
- WHEN validation is performed
- THEN the error mentions BOTH `messageId` and `timestamp` as failing fields
- AND no HTTP call is made

---

## New Capability: local-dev-token-config

### Requirement: SERENA_INTERNAL_TOKEN Documented in .env.example

The `.env.example` file MUST include clear guidance for `SERENA_INTERNAL_TOKEN` with instructions on generating a local development token.

#### Documentation requirements

- `.env.example` MUST contain `SERENA_INTERNAL_TOKEN=<generate-a-random-string-for-local-dev>` with a comment explaining:
  - Purpose: shared secret for internal endpoint authentication
  - How to generate: e.g., `openssl rand -hex 16` or any random string
  - Security note: only for local development, not for production
  - Must match the same value in both `serena-core` and `gateway-wa`

#### Scenario: .env.example has token guidance

- GIVEN the `.env.example` file
- WHEN opened by a developer
- THEN it contains `SERENA_INTERNAL_TOKEN` with a descriptive placeholder and comment

---

### Requirement: SERENA_INTERNAL_TOKEN Mapped in docker-compose.yml

The `docker-compose.yml` MUST map `SERENA_INTERNAL_TOKEN` from the host environment to the `serena-core` service. The `gateway-wa` service does not yet exist in compose — its token mapping is deferred.

#### Configuration requirements

- `serena-core` service MUST include `SERENA_INTERNAL_TOKEN: ${SERENA_INTERNAL_TOKEN}` in its `environment` section.
- `gateway-wa` will use the same token in runtime when it exists; its compose mapping is out of scope until the service is added to `docker-compose.yml`.
- Both services MUST receive the SAME token value for auth to work when gateway-wa is added.

#### Scenario: docker-compose maps token to core

- GIVEN `docker-compose.yml` is inspected
- THEN the `serena-core` service environment includes `SERENA_INTERNAL_TOKEN`

#### Scenario: gateway-wa compose mapping is deferred

- GIVEN `docker-compose.yml` is inspected
- THEN there is NO `gateway-wa` service yet
- AND the token mapping for gateway-wa is documented as a future task

---

## Modified Capability: docs-spec-sync (post-T29 sync)

### Requirement: Specs for T29 Capabilities Must Exist in openspec/specs/

The `openspec/specs/` directory MUST contain spec files for the capabilities introduced by T29:

1. **openai-compatible-provider** — spec for the `OpenAICompatibleLlmProvider` type, constructor, HTTP call, timeout, error handling, and API key security.
2. **provider-selection-config** — spec for `AI_PROVIDER` env var, provider selection logic, env validation, and `AI_TIMEOUT_MS`.

These specs MUST be written as "current state" specs (not delta specs) that describe the system as it exists post-T29.

#### Scenario: openai-compatible-provider spec exists

- GIVEN `openspec/specs/` is listed
- THEN a spec file exists for the openai-compatible provider capability

#### Scenario: provider-selection-config spec exists

- GIVEN `openspec/specs/` is listed
- THEN a spec file exists for the provider selection configuration capability

---

### Requirement: docs/project-status.md Must Reflect Post-T29 State

The `docs/project-status.md` file MUST be updated to reflect the actual state after T29:

- The "Expected Next Task" section MUST reference T30A (this task) or the next planned task — NOT "T29 or subsequent task".
- T29 status MUST reflect its actual closure state (archived, with note about pending PR if applicable).
- Any stale references to T29 as "in progress" MUST be updated.

#### Scenario: Expected Next Task is updated

- GIVEN `docs/project-status.md` is opened
- THEN the "Expected Next Task" section does NOT say "T29 or subsequent task"
- AND it references the correct next task

---

## New Capability: t29-closure (documented archive without assuming merge/PR)

### Requirement: T29 Change Folder Must Be Archived

The `openspec/changes/t29-openai-compatible-llm-provider/` folder MUST be moved to `openspec/changes/archive/t29-openai-compatible-llm-provider/`.

#### Archive requirements

- The archive MUST include a `CLOSURE.md` file documenting:
  - T29 concluded with PASS WITH WARNINGS (83% compliant, 548 tests passing).
  - Task T29-17 (Commit & PR) is pending human action — NOT completed by this task.
  - The 7 warnings from the verify report are documented for reference.
  - This archive does NOT imply the PR was merged — it documents the change as functionally complete for spec purposes.

#### Scenario: T29 folder is moved to archive

- GIVEN `openspec/changes/t29-openai-compatible-llm-provider/` exists
- WHEN T30A is completed
- THEN the folder is at `openspec/changes/archive/t29-openai-compatible-llm-provider/`

#### Scenario: CLOSURE.md documents pending PR

- GIVEN the archive folder is inspected
- THEN `CLOSURE.md` exists and documents that T29-17 (PR) is pending human action

#### Scenario: Archive does not claim PR was merged

- GIVEN the `CLOSURE.md` is read
- THEN it does NOT state that the PR was merged or that T29-17 was completed
- AND it clearly distinguishes between functional completion and PR merge status
