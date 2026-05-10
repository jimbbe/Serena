# Mock WhatsApp Gateway / Dry-Run Adapter Specification

## Purpose

Define a self-contained mock WhatsApp Gateway (`apps/gateway-wa/`) that simulates how a future real gateway would call Serena Core. Enables end-to-end dry-run testing of the full pipeline (normalize → call core → map result → log action) without connecting to real WhatsApp, Evolution API, or sending real messages.

## Requirements

### Requirement: MockWhatsAppEvent Domain Type

The system MUST define a `MockWhatsAppEvent` type that represents a simulated inbound WhatsApp message from a test user.

```typescript
type MockWhatsAppEvent = {
  provider: "mock";
  instanceId: string;
  messageId: string;
  from: string;
  text: string;
  timestamp: string;
  raw?: Record<string, unknown>;
};
```

#### Field semantics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `"mock"` | si | Fixed literal — identifies this as a mock event |
| `instanceId` | string | si | Simulated Evolution API instance name (e.g. `"serena-main"`) |
| `messageId` | string | si | Stable message identifier for idempotency (non-empty) |
| `from` | string | si | Simulated WhatsApp sender ID (e.g. `"5491111111111"`) |
| `text` | string | si | Message text content (non-empty) |
| `timestamp` | string | si | ISO 8601 timestamp of simulated reception |
| `raw` | object | no | Optional raw payload for debugging |

#### Scenario: Valid mock event

- GIVEN a `MockWhatsAppEvent` with all required fields populated with non-empty strings
- WHEN the event is validated
- THEN validation passes

#### Scenario: Mock event with empty messageId is rejected

- GIVEN a `MockWhatsAppEvent` where `messageId` is `""` or whitespace-only
- WHEN the event is validated
- THEN validation fails with error indicating `messageId` is required and non-empty

#### Scenario: Mock event with empty from is rejected

- GIVEN a `MockWhatsAppEvent` where `from` is `""` or whitespace-only
- WHEN the event is validated
- THEN validation fails with error indicating `from` is required and non-empty

#### Scenario: Mock event with empty text is rejected

- GIVEN a `MockWhatsAppEvent` where `text` is `""` or whitespace-only
- WHEN the event is validated
- THEN validation fails with error indicating `text` is required and non-empty

---

### Requirement: DryRunResult Domain Type

The system MUST define a `DryRunResult` type that represents the outcome of a dry-run gateway execution.

```typescript
type DryRunResult = {
  mode: "dry_run";
  sent: false;
  gatewayAction: WhatsAppGatewayAction;
  wouldSend?: {
    to: string;
    text: string;
  };
  inputEvent: MockWhatsAppEvent;
  normalizedPayload: {
    senderWhatsAppId: string;
    messageText: string;
    receivedAt: string;
  };
  pipelineResult: PipelineResult;
};
```

#### Field semantics

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"dry_run"` | Fixed literal — always dry-run mode |
| `sent` | `false` | Always `false` — no real messages are ever sent |
| `gatewayAction` | `WhatsAppGatewayAction` | The action the gateway would have taken |
| `wouldSend` | object (optional) | Populated only for `draft_ready` actions; contains `to` and `text` |
| `inputEvent` | `MockWhatsAppEvent` | Reference to the original mock event |
| `normalizedPayload` | object | The `PipelineInput` that was sent to core |
| `pipelineResult` | `PipelineResult` | The result returned by Serena Core |

#### Scenario: Dry-run result always has sent: false

- GIVEN any valid `MockWhatsAppEvent` and any `PipelineResult`
- WHEN a `DryRunResult` is constructed
- THEN `sent` is always `false`

#### Scenario: Dry-run result for draft_ready populates wouldSend

- GIVEN a `PipelineResult` of type `mediation_started` or `mediation_reply_recorded`
- WHEN the `DryRunResult` is constructed
- THEN `wouldSend` is populated with `{ to: <recipient WhatsApp ID>, text: <reworded text> }`

#### Scenario: Dry-run result for non-draft actions has no wouldSend

- GIVEN a `PipelineResult` of type `discard`, `conversation_pending`, `risk_review_required`, `mediation_not_understood`, `recipient_not_found`, or `ambiguous_active_session`
- WHEN the `DryRunResult` is constructed
- THEN `wouldSend` is `undefined`

---

### Requirement: Event Normalization

The system MUST provide a pure function that normalizes a `MockWhatsAppEvent` into a `PipelineInput` shape suitable for sending to Serena Core.

#### Normalization mapping

| MockWhatsAppEvent field | PipelineInput field | Note |
|------------------------|---------------------|------|
| `from` | `senderWhatsAppId` | Direct map |
| `text` | `messageText` | Direct map |
| `timestamp` | `receivedAt` | Direct map |
| `provider` | — | NOT sent to core |
| `instanceId` | — | NOT sent to core |
| `messageId` | — | NOT in PipelineInput (sent separately in HTTP body for idempotency) |
| `raw` | — | NOT sent to core |

#### Validation rules

- `messageId` MUST be a non-empty string (trimmed). Empty or whitespace-only → reject.
- `from` MUST be a non-empty string (trimmed). Empty or whitespace-only → reject.
- `text` MUST be a non-empty string (trimmed). Empty or whitespace-only → reject.
- Validation MUST occur BEFORE any HTTP call.
- Rejected events MUST return a clear error indicating which field(s) failed.

#### Scenario: Normalization of valid event

- GIVEN `MockWhatsAppEvent` with `from: "5491111111111"`, `text: "hola"`, `timestamp: "2026-05-02T22:00:00.000Z"`
- WHEN the event is normalized
- THEN the output is `{ senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" }`

#### Scenario: Normalization trims whitespace from fields

- GIVEN `MockWhatsAppEvent` with `from: "  5491111111111  "`, `text: "  hola  "`
- WHEN the event is normalized
- THEN `senderWhatsAppId` is `"5491111111111"` and `messageText` is `"hola"`

#### Scenario: Missing messageId rejects before normalization

- GIVEN `MockWhatsAppEvent` with `messageId: ""`
- WHEN validation is performed
- THEN the event is rejected with an error mentioning `messageId`
- AND no HTTP call is made

#### Scenario: Missing from rejects before normalization

- GIVEN `MockWhatsAppEvent` with `from: "   "`
- WHEN validation is performed
- THEN the event is rejected with an error mentioning `from`
- AND no HTTP call is made

#### Scenario: Missing text rejects before normalization

- GIVEN `MockWhatsAppEvent` with `text: ""`
- WHEN validation is performed
- THEN the event is rejected with an error mentioning `text`
- AND no HTTP call is made

---

### Requirement: HTTP Client to Serena Core

The system MUST provide an HTTP client that calls Serena Core's internal pipeline endpoint.

#### Endpoint contract

- **Method**: `POST`
- **URL**: `{SERENA_CORE_URL}/internal/pipeline/process`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Serena-Internal-Token: <token>`
- **Body**: JSON with the following fields:
  - `messageId` (string, from `MockWhatsAppEvent.messageId`)
  - `senderWhatsAppId` (string, from normalized event)
  - `messageText` (string, from normalized event)
  - `receivedAt` (string, from normalized event)

#### Configuration

- `SERENA_CORE_URL`: Base URL of Serena Core (e.g. `http://localhost:3000`)
- `SERENA_INTERNAL_TOKEN`: Shared secret token for internal authentication

#### Error handling

- If `SERENA_CORE_URL` is not configured → return configuration error before attempting HTTP call
- If `SERENA_INTERNAL_TOKEN` is not configured → return configuration error before attempting HTTP call
- HTTP errors (4xx, 5xx) → propagate with status code and response body for debugging
- Network errors (timeout, connection refused) → propagate with descriptive error message

#### Scenario: HTTP client sends correct request

- GIVEN `SERENA_CORE_URL = "http://localhost:3000"` and `SERENA_INTERNAL_TOKEN = "test-token"`
- AND a normalized payload `{ senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" }`
- AND `messageId = "mock-001"`
- WHEN the HTTP client is called
- THEN it sends `POST http://localhost:3000/internal/pipeline/process`
- AND headers include `Content-Type: application/json` and `X-Serena-Internal-Token: test-token`
- AND body is `{ "messageId": "mock-001", "senderWhatsAppId": "5491111111111", "messageText": "hola", "receivedAt": "2026-05-02T22:00:00.000Z" }`

#### Scenario: Missing SERENA_CORE_URL returns configuration error

- GIVEN `SERENA_CORE_URL` is undefined or empty
- WHEN the HTTP client is called
- THEN it returns a configuration error without making any HTTP request
- AND the error message mentions `SERENA_CORE_URL`

#### Scenario: Missing SERENA_INTERNAL_TOKEN returns configuration error

- GIVEN `SERENA_CORE_URL` is set but `SERENA_INTERNAL_TOKEN` is undefined or empty
- WHEN the HTTP client is called
- THEN it returns a configuration error without making any HTTP request
- AND the error message mentions `SERENA_INTERNAL_TOKEN`

#### Scenario: HTTP 401 from core is propagated

- GIVEN Serena Core returns `401 Unauthorized` with `{ error: "missing_token" }`
- WHEN the HTTP client receives the response
- THEN it propagates the error with status 401 and the response body

#### Scenario: HTTP 403 from core is propagated

- GIVEN Serena Core returns `403 Forbidden` with `{ error: "invalid_token" }`
- WHEN the HTTP client receives the response
- THEN it propagates the error with status 403 and the response body

#### Scenario: HTTP 500 from core is propagated

- GIVEN Serena Core returns `500 Internal Server Error`
- WHEN the HTTP client receives the response
- THEN it propagates the error with status 500 and the response body

---

### Requirement: Dry-Run Execution

The system MUST provide a `runDryGatewayEvent()` function that orchestrates the full dry-run pipeline.

#### Execution flow

1. Validate `MockWhatsAppEvent` (messageId, from, text must be non-empty)
2. Normalize event → `PipelineInput`
3. Validate configuration (`SERENA_CORE_URL`, `SERENA_INTERNAL_TOKEN`)
4. Call HTTP client with normalized payload + messageId
5. Receive `PipelineResult` from core
6. Map `PipelineResult` → `WhatsAppGatewayAction` using `mapPipelineResultToGatewayAction`
7. Build `DryRunResult` with all fields
8. Return `DryRunResult`

#### Invariants

- `sent` is ALWAYS `false` — no real messages are sent
- `mode` is ALWAYS `"dry_run"`
- The function is deterministic given the same inputs and core response
- All gateway metadata fields (`provider`, `instanceId`, `raw`) are preserved in `inputEvent` but NOT sent to core

#### Scenario: Full dry-run with mediation_started result

- GIVEN a valid `MockWhatsAppEvent` from Maria requesting to send a message to Carlos
- AND Serena Core returns `{ type: "mediation_started", sessionId: "s1", requesterId: "maria-id", requesterDisplayName: "Maria", recipientId: "carlos-id", recipientDisplayName: "Carlos", rewordedText: "Carlos, Maria informa que llegara tarde." }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "draft_ready", resultType: "mediation_started", toWhatsAppId: "carlos-id", text: "Carlos, Maria informa que llegara tarde.", sessionId: "s1", fromDisplayName: "Maria", toDisplayName: "Carlos" }`
- AND `wouldSend` is `{ to: "carlos-id", text: "Carlos, Maria informa que llegara tarde." }`
- AND `sent` is `false`
- AND `mode` is `"dry_run"`

#### Scenario: Full dry-run with mediation_reply_recorded result

- GIVEN a valid `MockWhatsAppEvent` from Carlos replying to Maria's mediation
- AND Serena Core returns `{ type: "mediation_reply_recorded", sessionId: "s1", fromParticipantId: "carlos-id", fromDisplayName: "Carlos", toParticipantId: "maria-id", toDisplayName: "Maria", rewordedText: "Maria, Carlos dice que no hay problema." }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "draft_ready", resultType: "mediation_reply_recorded", toWhatsAppId: "maria-id", text: "Maria, Carlos dice que no hay problema.", sessionId: "s1", fromDisplayName: "Carlos", toDisplayName: "Maria" }`
- AND `wouldSend` is `{ to: "maria-id", text: "Maria, Carlos dice que no hay problema." }`
- AND `sent` is `false`

#### Scenario: Full dry-run with discard result

- GIVEN a valid `MockWhatsAppEvent` from an unauthorized sender
- AND Serena Core returns `{ type: "discard", reason: "Sender not in authorized list" }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "ignore", resultType: "discard", reason: "Sender not in authorized list" }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

#### Scenario: Full dry-run with conversation_pending result

- GIVEN a valid `MockWhatsAppEvent` with a normal conversation message
- AND Serena Core returns `{ type: "conversation_pending", senderId: "5491111111111" }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "no_auto_send", resultType: "conversation_pending", reason: "No conversational module available" }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

#### Scenario: Full dry-run with risk_review_required result

- GIVEN a valid `MockWhatsAppEvent` with risky content
- AND Serena Core returns `{ type: "risk_review_required", senderId: "5491111111111", matchedSignals: ["urgent", "health_emergency"] }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "manual_review_required", resultType: "risk_review_required", reason: "Risk or urgent content requires human review", matchedSignals: ["urgent", "health_emergency"] }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

#### Scenario: Full dry-run with mediation_not_understood result

- GIVEN a valid `MockWhatsAppEvent` with unparseable mediation signal
- AND Serena Core returns `{ type: "mediation_not_understood", senderId: "5491111111111" }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "no_auto_send", resultType: "mediation_not_understood", reason: "Could not parse mediation request" }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

#### Scenario: Full dry-run with recipient_not_found result

- GIVEN a valid `MockWhatsAppEvent` requesting to send to unknown contact
- AND Serena Core returns `{ type: "recipient_not_found", senderId: "5491111111111", recipientName: "Unknown Person" }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "no_auto_send", resultType: "recipient_not_found", reason: "Recipient not in contact directory: Unknown Person" }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

#### Scenario: Full dry-run with ambiguous_active_session result

- GIVEN a valid `MockWhatsAppEvent` in an ambiguous session context
- AND Serena Core returns `{ type: "ambiguous_active_session", senderId: "5491111111111", activeSessionIds: ["s1", "s2"] }`
- WHEN `runDryGatewayEvent()` is called
- THEN `gatewayAction` is `{ action: "manual_review_required", resultType: "ambiguous_active_session", reason: "Multiple active sessions for the same participant pair", activeSessionIds: ["s1", "s2"] }`
- AND `wouldSend` is `undefined`
- AND `sent` is `false`

---

### Requirement: PipelineResult-to-GatewayAction Mapping

The system MUST use the `mapPipelineResultToGatewayAction` function (copied from `@serena/core` T17A-frozen contract) to translate `PipelineResult` to `WhatsAppGatewayAction`.

#### Mapping table

| PipelineResult.type | WhatsAppGatewayAction.action | Notes |
|---------------------|------------------------------|-------|
| `discard` | `ignore` | Reason from PipelineResult |
| `conversation_pending` | `no_auto_send` | Fixed reason |
| `risk_review_required` | `manual_review_required` | Includes matchedSignals |
| `mediation_not_understood` | `no_auto_send` | Fixed reason |
| `recipient_not_found` | `no_auto_send` | Reason includes recipient name |
| `mediation_started` | `draft_ready` | Populates toWhatsAppId, text, sessionId, display names |
| `mediation_reply_recorded` | `draft_ready` | Populates toWhatsAppId, text, sessionId, display names |
| `ambiguous_active_session` | `manual_review_required` | Includes activeSessionIds |

#### Scenario: Unknown PipelineResult type produces error action

- GIVEN a PipelineResult with an unrecognized type (should never happen with TypeScript exhaustiveness)
- WHEN `mapPipelineResultToGatewayAction` is called
- THEN the result is `{ action: "error", message: "Unknown PipelineResult type: <type>" }`

---

### Requirement: Domain Types Are Copied From Core

The system MUST copy domain types from `@serena/core` into `apps/gateway-wa/src/domain/` without importing from core. Each copied file MUST include a source-version comment indicating the origin.

#### Types to copy

| Type | Source file | Destination |
|------|-------------|-------------|
| `PipelineResult` | `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | `apps/gateway-wa/src/domain/pipeline-result.ts` |
| `PipelineInput` | `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | `apps/gateway-wa/src/domain/pipeline-result.ts` |
| `WhatsAppGatewayAction` | `apps/core/src/modules/whatsapp-gateway/domain/gateway-action.ts` | `apps/gateway-wa/src/domain/gateway-action.ts` |
| `NormalizedWhatsAppInboundMessage` | `apps/core/src/modules/whatsapp-gateway/domain/normalized-inbound-message.ts` | `apps/gateway-wa/src/domain/normalized-inbound-message.ts` |

#### Function to copy

| Function | Source file | Destination |
|----------|-------------|-------------|
| `mapPipelineResultToGatewayAction` | `apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts` | `apps/gateway-wa/src/application/map-pipeline-result-to-gateway-action.ts` |

#### Scenario: Copied types match source types exactly

- GIVEN the source types in `@serena/core`
- WHEN the copied types in `apps/gateway-wa/src/domain/` are compared
- THEN they are structurally identical (same fields, same types, same discriminated unions)

---

### Requirement: Workspace Setup

The system MUST set up `apps/gateway-wa/` as a valid npm workspace.

#### Required files

- `apps/gateway-wa/package.json` — package name `@serena/gateway-wa`, with `test` script
- `apps/gateway-wa/tsconfig.json` — extends `../../tsconfig.base.json`
- Root `package.json` — must include `typecheck:gateway-wa` in the check script

#### Scenario: Workspace is recognized by npm

- GIVEN the root `package.json` includes `apps/gateway-wa` in workspaces
- WHEN `npm ls -w @serena/gateway-wa` is run
- THEN the workspace is listed without errors

#### Scenario: TypeScript compilation succeeds

- GIVEN all source files are in place
- WHEN `npx tsc --noEmit` is run in `apps/gateway-wa/`
- THEN compilation succeeds with no errors

---

### Requirement: Error Cases

The system MUST handle all error cases gracefully with clear error messages.

#### Validation errors (before HTTP call)

| Condition | Error behavior |
|-----------|----------------|
| `messageId` missing or empty | Reject with error mentioning `messageId` |
| `from` missing or empty | Reject with error mentioning `from` |
| `text` missing or empty | Reject with error mentioning `text` |

#### Configuration errors (before HTTP call)

| Condition | Error behavior |
|-----------|----------------|
| `SERENA_CORE_URL` not set | Configuration error mentioning `SERENA_CORE_URL` |
| `SERENA_INTERNAL_TOKEN` not set | Configuration error mentioning `SERENA_INTERNAL_TOKEN` |

#### Scenario: Multiple validation failures report all fields

- GIVEN `MockWhatsAppEvent` with empty `messageId` AND empty `from`
- WHEN validation is performed
- THEN the error mentions BOTH `messageId` and `from` as failing fields

#### Scenario: Configuration error for missing core URL

- GIVEN `SERENA_CORE_URL` is undefined
- WHEN `runDryGatewayEvent()` is called with a valid event
- THEN it returns a configuration error without attempting HTTP
- AND the error mentions `SERENA_CORE_URL`

#### Scenario: Configuration error for missing internal token

- GIVEN `SERENA_CORE_URL` is set but `SERENA_INTERNAL_TOKEN` is undefined
- WHEN `runDryGatewayEvent()` is called with a valid event
- THEN it returns a configuration error without attempting HTTP
- AND the error mentions `SERENA_INTERNAL_TOKEN`

---

### Requirement: Real API Contract Supersedes Mock Endpoint Assumptions

The mock gateway's assumed endpoint shapes are superseded by the real `whatsapp-gateway-api` contract defined in Phase 1. The mock adapter remains valid for dry-run testing but MUST NOT be used as the source of truth for endpoint shapes, auth model, or webhook payload format.

#### Scenario: Real contract takes precedence over mock assumptions

- GIVEN the real `whatsapp-gateway-api` spec defines 7 endpoints with specific request/response shapes
- WHEN endpoint shapes are needed for integration planning
- THEN the real contract is the source of truth, not the mock adapter

---

### Requirement: Webhook Normalization Differs from Mock Normalization

The real webhook normalization from Evolution API format to `NormalizedInboundMessage` uses different field mappings than the mock's `MockWhatsAppEvent` → `PipelineInput` normalization.

| Source | Evolution API webhook field | MockWhatsAppEvent field | Normalized field |
|--------|---------------------------|------------------------|------------------|
| Sender | `data.key.remoteJid` (strip `@s.whatsapp.net`) | `from` | `senderWhatsAppId` |
| Text | `data.message.conversation` or `data.message.extendedTextMessage.text` | `text` | `messageText` |
| Timestamp | `data.messageTimestamp` (epoch → ISO 8601) | `timestamp` | `receivedAt` |
| Message ID | `data.key.id` | `messageId` | `messageId` |

#### Scenario: Evolution API sender ID requires domain stripping

- GIVEN Evolution API webhook with `data.key.remoteJid: "5491111111111@s.whatsapp.net"`
- WHEN normalizing to `NormalizedInboundMessage`
- THEN `senderWhatsAppId` is `"5491111111111"` (domain stripped)

#### Scenario: Mock normalization uses direct field mapping

- GIVEN `MockWhatsAppEvent` with `from: "5491111111111"`
- WHEN normalizing via mock adapter
- THEN `senderWhatsAppId` is `"5491111111111"` (no stripping needed)
