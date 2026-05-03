# Serena — Simulation API (`POST /dev/simulate/inbound-message`)

## Overview

The simulation endpoint lets developers test the full Serena inbound pipeline
(inbound gate → AI guide) **without** real WhatsApp, real LLM calls, or real
message sending. It accepts a channel-agnostic JSON payload and returns a
structured trace of every pipeline decision — who the sender is, whether they
are blocked, which AI profile was selected, and what the mock AI responded.

In Phase 1 the endpoint does **not** send real messages. Its simulated outbound
drafts are placeholders for future phases where mediation drafts will be
generated.

WhatsApp will be integrated as a separate **real adapter** — this endpoint is
purely for development and testing.

## Prerequisites

Set the environment variable before starting the server:

```bash
ENABLE_SIMULATION_ENDPOINTS=true npm start
```

Only the exact string `"true"` (case-insensitive) enables the endpoint. Any
other value (including `"false"`, `"0"`, or unset) keeps it disabled.

## Endpoint

```
POST /dev/simulate/inbound-message
Content-Type: application/json
```

No authentication token is required — this is a **development-only** route
guarded by the environment variable.

### Request

```jsonc
{
  // REQUIRED
  "channel":          "whatsapp",     // one of: whatsapp, voice, web_chat, telegram, system, simulation
  "externalSenderId": "+5492600000000", // sender identifier (phone, user ID, etc.)
  "text":             "Decile a Ana que me llame",

  // OPTIONAL
  "tenantId":         "demo",          // multi-tenant identifier (reserved)
  "personId":         "person-1",      // resolved person identifier
  "conversationId":   "conv-abc",      // active conversation identifier
  "occurredAt":       "2025-01-15T10:30:00Z", // ISO 8601 timestamp (defaults to now)
  "metadata":         {}               // channel-specific extras (must be object if present)
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | `string` | **Yes** | One of: `whatsapp`, `voice`, `web_chat`, `telegram`, `system`, `simulation` |
| `externalSenderId` | `string` | **Yes** | Sender identifier, non-empty after trimming |
| `text` | `string` | **Yes** | Message text, non-empty after trimming |
| `tenantId` | `string` | No | Multi-tenant identifier |
| `personId` | `string` | No | Resolved person identifier |
| `conversationId` | `string` | No | Active conversation identifier |
| `occurredAt` | `string` | No | ISO 8601 timestamp (defaults to server time) |
| `metadata` | `object` | No | Channel-specific extras (must be JSON object) |

### Response (200 OK)

```jsonc
{
  "traceId":          "a3f8b2c1-...", // UUID for correlating the full execution
  "channel":          "whatsapp",     // echo of input channel
  "inboundDecision": {                // decision from the inbound gate
    "status":  "needs_mediation",
    "reason":  "third_party_mediation_request",
    "metadata": { /* sender known, policy version, matched signals, etc. */ }
  },
  "profileId":        "mediation_understanding", // selected LLM profile (undefined if blocked)
  "useCaseId":        "serena.mediation.understand_request", // AI guide use case (undefined if blocked)
  "guideResult":      { /* AI guide response */ }, // AI output (undefined if blocked or error)
  "guideError":       null,           // structured error { message, code? } if AI failed
  "simulatedOutbound": null,          // simulated draft (Phase 1: always null)
  "warnings":         [],             // non-fatal issues (e.g. missing optional fields)
  "errors":           []              // fatal issues (empty = success)
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 405 | Wrong HTTP method (GET instead of POST) | `{ "error": "method_not_allowed" }` |
| 404 | `ENABLE_SIMULATION_ENDPOINTS` not set to `true` | `{ "error": "simulation_not_enabled" }` |
| 400 | Body is not valid JSON | `{ "error": "invalid_json" }` |
| 400 | Missing/invalid required fields | `{ "error": "invalid_payload", "fields": [...] }` |
| 500 | Unexpected pipeline failure | `{ "error": "pipeline_execution_failed" }` |

## Examples

### Conversation (known sender, casual text)

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "hola Serena, cómo estás?"
  }'
```

**Response**: 200 — `inboundDecision.status === "allowed"`, `profileId === "conversation"`, `guideResult.status === "success"`.

### Blocked sender (unknown)

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5499999999999",
    "text": "hola"
  }'
```

**Response**: 200 — `inboundDecision.status === "blocked"`, `profileId` is `undefined`, no `guideResult`.

### Mediation request

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "avisale a Carlos que voy a llegar 15 minutos tarde"
  }'
```

**Response**: 200 — `profileId === "mediation_understanding"`, `useCaseId === "serena.mediation.understand_request"`, `guideResult` present.

### Risk content

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "necesito ayuda urgente"
  }'
```

**Response**: 200 — `profileId === "risk_review"`, `useCaseId === "serena.risk.review"`.

### Clarification (not yet implemented — returns structured error, not 500)

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "qué querés decir con eso?"
  }'
```

Note: the real pipeline never routes to `clarification` with current inbound
policy. When it does in a future version, the response will be 200 with
`guideError.code === "not_implemented"` instead of a 500 crash.

### Using other channels

```bash
# Voice
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{"channel": "voice", "externalSenderId": "maria", "text": "hola"}'

# Telegram
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{"channel": "telegram", "externalSenderId": "maria", "text": "hola"}'
```

### Full payload with optional fields

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "tenantId": "tenant-demo",
    "externalSenderId": "+5492600000000",
    "text": "Decile a Ana que me llame",
    "personId": "person-1",
    "conversationId": "conv-abc",
    "occurredAt": "2025-01-15T10:30:00Z",
    "metadata": {}
  }'
```

## Limitations (Phase 1)

- **Mock LLM only** — responses are deterministic (hash-based). No real AI.
- **No real message sending** — the endpoint only EXECUTES the pipeline and returns the trace. Real WhatsApp/message sending is the responsibility of channel-specific adapters.
- **No auth guard** — the endpoint is disabled by default and has no token check when enabled. Only enable it in development.
- **Clarification not implemented** — the `clarification` LLM profile is mapped but `AiGuideService` throws a controlled error that appears as a structured `guideError` in the response (200, not 500).
- **Empty simulatedOutbound** — mediation drafts are not generated yet. The field is reserved for Phase 2.
