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

In Phase 1/T27, AI Guide receives `recentMessages` from `ConversationStore` via
`ProcessChannelInboundMessage`, enabling conversation history in prompt context.

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
  "identity":         { /* resolved identity */ }, // external → internal identity resolution
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
  "conversation":    {                 // conversation tracking (when identity is resolved)
    "id":            "a1b2c3d4-...",   // auto-generated conversation UUID
    "status":        "open",           // conversation status (always "open" in Phase 1)
    "messageCount":  1                 // number of messages currently in ConversationStore (Phase 1/T27: inbound only)
  },
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

### Clarification profile

The `clarification` LLM profile is supported by AI Guide (`serena.mediation.clarify.v1`), but
the real inbound policy may not route to clarification in normal flows yet.
When it does, the response will be 200 with a standard `guideResult`.

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

## Identity Resolution

The simulation endpoint runs identity resolution BEFORE gate evaluation. The `identity` field in the response maps the external channel sender to an internal domain identity.

### `externalSenderId` vs `personId`

| Field | Source | Purpose |
|-------|--------|---------|
| `externalSenderId` | Channel adapter (e.g., WhatsApp JID, phone number, device ID) | Uniquely identifies the sender on the external channel |
| `personId` | Identity resolver | Internal domain identifier — the same person can have multiple `externalSenderId` values across channels |

The future `WhatsAppAdapter` will convert WhatsApp JIDs/numbers to `externalSenderId`. Multiple channels (whatsapp, voice, web_chat) can map to the same `personId`.

### `identity` Response Field

```typescript
type IdentityStatus = "resolved" | "unknown" | "blocked";
type IdentityRole = "elder" | "contact" | "system";

type ResolvedInboundActor = {
  status: IdentityStatus;    // resolution outcome
  tenantId: string;           // multi-tenant identifier
  channel: string;            // channel the message arrived on
  externalSenderId: string;   // sender identifier from the channel
  personId?: string;          // internal domain ID (set when resolved)
  actorId?: string;           // actor identifier within the system
  role?: IdentityRole;        // role in Serena ecosystem
  displayName?: string;       // human-readable name
  authorized: boolean;        // whether sender is authorized
  reason?: string;            // reason for status
};
```

### Demo Identities

The in-memory resolver is seeded with demo identities covering Marta (the elder) across three channels:

| Channel | externalSenderId | personId | role | displayName | Status |
|---------|-----------------|----------|------|-------------|--------|
| `whatsapp` | `+5492600000000` | `elder_001` | `elder` | Marta | resolved |
| `voice` | `device_marta_livingroom` | `elder_001` | `elder` | Marta | resolved |
| `web_chat` | `session_abc` | `elder_001` | `elder` | Marta | resolved |
| `whatsapp` | `+5499999999999` | — | — | — | blocked |

Additionally, contacts from the seed data (María, Carlos, Juan, José, José María) are registered as `role: "contact"` on the `whatsapp` channel.

### Response Examples

**Resolved identity (known sender):**

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "+5492600000000",
    "text": "hola Serena"
  }'
```

```jsonc
{
  "traceId": "a3f8b2c1-...",
  "channel": "whatsapp",
  "identity": {
    "status": "resolved",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "+5492600000000",
    "personId": "elder_001",
    "actorId": "elder_001",
    "role": "elder",
    "displayName": "Marta",
    "authorized": true
  },
  "inboundDecision": { /* ... */ }
}
```

**Unknown identity (not in registry or seed):**

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "+5400000000000",
    "text": "hola"
  }'
```

```jsonc
{
  "traceId": "a3f8b2c1-...",
  "channel": "whatsapp",
  "identity": {
    "status": "unknown",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "+5400000000000",
    "authorized": false,
    "reason": "unknown_sender"
  },
  "inboundDecision": {
    "status": "blocked",
    "reason": "unknown_sender"
  }
}
```

## Limitations (Phase 1)

- **Mock LLM only** — responses are deterministic (hash-based). No real AI.
- **No real message sending** — the endpoint only EXECUTES the pipeline and returns the trace. Real WhatsApp/message sending is the responsibility of channel-specific adapters.
- **No auth guard** — the endpoint is disabled by default and has no token check when enabled. Only enable it in development.
- **Clarification profile** — supported by AI Guide (`serena.mediation.clarify.v1`); real inbound policy may not route to it in normal flows yet.
- **Empty simulatedOutbound** — mediation drafts are not generated yet. The field is reserved for Phase 2.
- **Identity resolution runs first** — the `ExternalIdentityResolver` translates external channel IDs to internal `personId` BEFORE gate evaluation. Blocked identities short-circuit the entire pipeline. Unknown identities continue to the gate (which will likely block them as unknown senders).

## Conversation Tracking (NEW)

Every resolved identity automatically gets conversation tracking. When the identity resolver returns `status: "resolved"`, the pipeline:

1. **Finds or creates** a conversation scoped to the tenant + person pair
2. **Appends** the inbound message to the conversation
3. **Returns** conversation info in the response

**Note**: AI guide output is not recorded as an outbound conversation message yet.
Outbound will be recorded only when an explicit `OutboundDraft`/`DecisionPolicy`
sends or decides to send. In Phase 1/T27, `messageCount` reflects inbound messages only.

### Auto-created conversationId

If no `conversationId` is provided in the request, the store auto-generates a UUID:

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "hola"
  }'
```

```jsonc
{
  "conversation": {
    "id": "d4e5f6a7-b8c9-...",  // auto-generated UUID
    "status": "open",
    "messageCount": 1             // inbound "hola" only (AI output not recorded as outbound yet)
  }
}
```

### Manual conversationId

Pass `conversationId` in the request to continue an existing conversation:

```bash
curl -X POST http://localhost:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "y cómo estás vos?",
    "conversationId": "d4e5f6a7-b8c9-..."
  }'
```

If the `conversationId` exists and belongs to the same tenant + person pair, it is reused.
If it doesn't exist (or belongs to a different tenant/person), a new conversation is created.

### Scenario continuity

In multi-step scenarios (`POST /dev/simulate/scenario`), the `conversationId` is automatically
propagated from one step to the next. All steps by the same sender share the same conversation
unless a step explicitly overrides `conversationId`.

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "chat-flow",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "steps": [
      { "text": "hola" },
      { "text": "cómo estás?" },
      { "text": "chau" }
    ]
  }'
```

All three steps share the same auto-generated conversation ID.

### Store lifetime

The conversation store is **in-memory only** (not persistent). All conversations and
messages are lost on server restart. PostgreSQL persistence will be added in a future phase.

### Identity constraints

- Only `resolved` identities get conversations — `unknown` and `blocked` identities do not
- Conversations are scoped by `tenantId + personId`, not by channel or `externalSenderId`
- Different senders (Marta vs María) get different conversations
- The same person across different channels (whatsapp vs voice) gets the same conversation
  (when identity resolver maps both to the same `personId`)

---

# Scenario Simulation (`POST /dev/simulate/scenario`)

## Overview

The scenario endpoint runs **multi-step conversations** through the full Serena
inbound pipeline sequentially. Each step builds an `InboundMessageCommand` from
scenario-level defaults plus optional per-step overrides and executes it through
the same `ProcessChannelInboundMessage` use case. The response includes per-step
results and an aggregated summary.

The runner lives in the bootstrap layer — it orchestrates existing use cases
without duplicating any domain logic. All steps share the same in-memory
pipeline state, allowing sessions to persist across steps (e.g., María starts
a mediation → bridge session is active for Carlos to reply).

## Prerequisites

Same as single-step simulation:

```bash
ENABLE_SIMULATION_ENDPOINTS=true npm start
```

## Endpoint

```
POST /dev/simulate/scenario
Content-Type: application/json
```

No authentication token is required — this is a **development-only** route
guarded by the environment variable.

### Request

```jsonc
{
  // REQUIRED
  "scenarioId":       "greeting-001",    // unique scenario identifier
  "tenantId":         "demo",            // multi-tenant identifier
  "channel":          "whatsapp",        // default channel for all steps
  "externalSenderId": "+5492600000000",  // default sender for all steps (or provide per-step)
  "steps": [                             // ordered list of steps
    {
      "text": "hola Serena, cómo estás?" // required per step — message text
    },
    {
      "text": "avisale a Carlos que voy a llegar tarde" // mediation step
    }
  ],

  // OPTIONAL
  "conversationId":   "conv-abc",        // default conversation identifier
  "stopOnError":      false,             // break on first failure (default false)
  "metadata":         {}                 // scenario-level extras (must be object if present)
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | `string` | **Yes** | Unique scenario identifier, non-empty |
| `tenantId` | `string` | **Yes** | Multi-tenant identifier, non-empty |
| `channel` | `string` | **Yes** | One of: `whatsapp`, `voice`, `web_chat`, `telegram`, `system`, `simulation` |
| `externalSenderId` | `string` | **Conditional** | Default sender identifier, non-empty. Required unless every step provides its own `externalSenderId`. |
| `steps` | `array` | **Yes** | Non-empty array of step objects |
| `steps[].text` | `string` | **Yes** | Message text per step, non-empty |
| `steps[].channel` | `string` | No | Override channel for this step |
| `steps[].externalSenderId` | `string` | No | Override sender for this step |
| `steps[].personId` | `string` | No | Resolved person identifier |
| `steps[].conversationId` | `string` | No | Override conversation identifier |
| `steps[].occurredAt` | `string` | No | ISO 8601 timestamp (step-level) |
| `steps[].metadata` | `object` | No | Step-level extras |
| `conversationId` | `string` | No | Default conversation identifier |
| `stopOnError` | `boolean` | No | Break on first step failure (default `false`) |
| `metadata` | `object` | No | Scenario-level extras merged into every step (step-level keys override scenario-level) |

### Response (200 OK)

```jsonc
{
  "scenarioId": "greeting-001",
  "traceId":    "a3f8b2c1-...",   // UUID for the entire scenario run
  "steps": [
    {
      "index": 0,
      "input": {
        "channel": "whatsapp",
        "externalSenderId": "+5492600000000",
        "text": "hola Serena, cómo estás?"
      },
      "result": { /* full ChannelInboundResult */ },
      "error": null
    }
  ],
  "summary": {
    "totalSteps": 2,
    "successfulSteps": 2,
    "failedSteps": 0,
    "riskEvents": 0,
    "mediationEvents": 1,
    "unknownSenders": 0,
    "blockedSenders": 0
  }
}
```

### Summary Fields

| Field | Description |
|-------|-------------|
| `totalSteps` | Number of steps in the request |
| `successfulSteps` | Steps without errors, AI failures, or guide errors |
| `failedSteps` | Steps with thrown error, `errors[]` non-empty, AI failure, or guide error |
| `riskEvents` | Steps where `inboundDecision.reason === "urgent_or_risk_content"` |
| `mediationEvents` | Steps where reason is `"third_party_mediation_request"` or status is `"needs_mediation"` |
| `unknownSenders` | Steps where `identity.status === "unknown"` |
| `blockedSenders` | Steps where identity is `"blocked"` or decision is `"blocked"` |

**Invariant**: `successfulSteps + failedSteps === totalSteps`.

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 405 | Wrong HTTP method | `{ "error": "method_not_allowed" }` |
| 404 | `ENABLE_SIMULATION_ENDPOINTS` not set to `true` | `{ "error": "simulation_not_enabled" }` |
| 400 | Body is not valid JSON | `{ "error": "invalid_json" }` |
| 400 | Missing/invalid fields | `{ "error": "invalid_payload", "fields": [...] }` |
| 500 | Unexpected runner failure | `{ "error": "scenario_execution_failed" }` |

## Examples

### Simple conversational scenario (3 steps)

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "casual-chat",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "steps": [
      { "text": "hola Serena, cómo estás?" },
      { "text": "qué lindo día hace" },
      { "text": "bueno, me voy, chau" }
    ]
  }'
```

**Response**: 200 — all 3 steps succeed, `summary.totalSteps === 3`, `summary.successfulSteps === 3`, all decisions are `"known_sender_conversational"`.

### Mediation scenario with risk step

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "mixed-flow",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "steps": [
      { "text": "hola Serena" },
      { "text": "avisale a Carlos que voy a llegar 15 minutos tarde" },
      { "text": "necesito ayuda urgente" },
      { "text": "gracias" }
    ]
  }'
```

**Response**: 200 — `summary.mediationEvents === 1`, `summary.riskEvents === 1`, `summary.successfulSteps === 4`.

### Multi-actor scenario (step overrides)

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "multi-actor",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "+5492600000000",
    "steps": [
      { "text": "hola Serena, soy Marta",
        "externalSenderId": "+5492600000000" },
      { "text": "Hola Marta, soy María",
        "externalSenderId": "5491111111111" },
      { "text": "avisale a Juan",
        "externalSenderId": "5491111111111" }
    ]
  }'
```

Each step uses its own `externalSenderId`, allowing different actors
in the same scenario. Marta connects via WhatsApp (+5492600000000), María uses
a different phone (5491111111111). A global `externalSenderId` is optional when
every step provides its own.

### Multi-actor without global sender (per-step senders only)

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "per-step-senders",
    "tenantId": "demo",
    "channel": "whatsapp",
    "steps": [
      { "text": "hola Serena, soy Marta",
        "externalSenderId": "+5492600000000" },
      { "text": "Hola Marta, soy María",
        "externalSenderId": "5491111111111" },
      { "text": "avisale a Juan",
        "externalSenderId": "5491111111111" }
    ]
  }'
```

The `externalSenderId` at scenario level is omitted entirely — each step must
provide its own. Validation rejects the request with a clear per-step error
message if any step is missing its sender.

### Scenario-level metadata merge

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "metadata-merge",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "metadata": { "env": "staging", "source": "scenario" },
    "steps": [
      { "text": "uses scenario metadata only" },
      { "text": "overrides source key",
        "metadata": { "source": "step-override" } }
    ]
  }'
```

Scenario-level `metadata` is merged into every step. Step-level keys override
scenario-level keys. In the example above, step 0 receives
`{ env: "staging", source: "scenario" }` and step 1 receives
`{ env: "staging", source: "step-override" }`.

### stopOnError=true (breaks on first failure)

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "stop-on-error",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "stopOnError": true,
    "steps": [
      { "text": "hola" },
      { "text": "avisale a Carlos" },
      { "text": "gracias" }
    ]
  }'
```

With `stopOnError: true`, if step 2 throws an error, step 3 is **never executed**.
The response only includes results for steps 0 and 1.

### stopOnError=false (default — continues past errors)

```bash
curl -X POST http://localhost:3000/dev/simulate/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "continue-on-error",
    "tenantId": "demo",
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "stopOnError": false,
    "steps": [
      { "text": "hola" },
      { "text": "avisale a Carlos" },
      { "text": "gracias" }
    ]
  }'
```

All 3 steps are executed regardless of individual failures.

## Limitations (Phase 1)

- **Mock LLM only** — AI responses are deterministic (hash-based). No real AI.
- **No real message sending** — the runner executes the pipeline and returns traces. Real WhatsApp/message sending is the responsibility of channel adapters.
- **No auth guard** — the endpoint is disabled by default. Only enable in development.
- **Shared in-memory state** — sessions persist across steps within the same HTTP request but are lost on server restart.
- **Sequential execution only** — steps run one at a time in order. No parallel execution.
- **No inter-step waiting** — there is no simulated delay between steps. Real mediation flows involve waiting for replies, which must be handled by separate requests in a real integration.
