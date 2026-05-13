# Gateway Webhook Receiver Specification

## Purpose

Define the webhook endpoint that receives Evolution API webhooks, normalizes inbound messages, filters self-messages, updates connection state, and routes inbound text messages to Serena Core.

## Requirements

### Requirement: Webhook Endpoint

The system MUST expose `POST /webhook/evolution` that receives Evolution API webhook payloads.

| Aspect | Detail |
|--------|--------|
| Auth | `X-Gateway-Evo-Key` header required |
| Content-Type | `application/json` |
| Success | `200 { "received": true, "routedTo": "serena-core" }` |
| Idempotency | Duplicate `messageId` within 5 minutes MUST return `200 { "received": true, "duplicate": true }` without re-routing |

#### Scenario: Valid webhook is received and routed

- GIVEN valid Evolution API key
- WHEN `POST /webhook/evolution` receives a `MESSAGES_UPSERT` event
- THEN response is `200` with `{ "received": true, "routedTo": "serena-core" }`

#### Scenario: Duplicate webhook is detected

- GIVEN a webhook with `messageId: "wamid-001"` was processed 2 minutes ago
- WHEN the same `messageId` arrives again
- THEN response is `200` with `{ "received": true, "duplicate": true }`
- AND the message is NOT re-routed to Serena Core

### Requirement: Self-Message Loop Prevention

The system MUST discard messages where `fromMe` is `true` to prevent infinite loops.

| Field | Evolution API Path | Action |
|-------|-------------------|--------|
| `fromMe` | `data.key.fromMe` | If `true`, discard immediately |

#### Scenario: Self-message is silently discarded

- GIVEN webhook payload with `data.key.fromMe: true`
- WHEN the webhook is received
- THEN response is `200` with `{ "ignored": true, "reason": "self_message" }`
- AND the message is NOT routed to Serena Core
- AND no error is logged (this is expected behavior)

### Requirement: Non-Text Message Filtering

The system MUST discard non-text messages (images, audio, video, documents, reactions, etc.).

| Check | Condition | Action |
|-------|-----------|--------|
| Text present | `data.message.conversation` exists and is non-empty | Process normally |
| Extended text | `data.message.extendedTextMessage` exists | Process (extract text) |
| No text | Neither field exists or both are empty | Discard with reason `non-text` |

#### Scenario: Text message is processed

- GIVEN webhook with `data.message.conversation: "hola"`
- WHEN the webhook is received
- THEN the message proceeds to normalization

#### Scenario: Image message is discarded

- GIVEN webhook with `data.message.imageMessage` but no `conversation` field
- WHEN the webhook is received
- THEN response is `200` with `{ "ignored": true, "reason": "non-text" }`

#### Scenario: Empty text is discarded

- GIVEN webhook with `data.message.conversation: ""`
- WHEN the webhook is received
- THEN response is `200` with `{ "ignored": true, "reason": "non-text" }`

### Requirement: Inbound Message Normalization

The system MUST normalize Evolution API webhook payloads into `NormalizedInboundMessage` format.

| Evolution API field | Normalized field | Transformation |
|---------------------|-----------------|----------------|
| `data.key.remoteJid` | `from` | Strip `@s.whatsapp.net` suffix |
| `data.key.id` | `messageId` | Direct copy |
| `data.message.conversation` | `text` | Direct copy |
| `data.message.extendedTextMessage.text` | `text` | Used if `conversation` absent |
| `data.pushName` | `senderName` | Optional, direct copy |
| `data.messageTimestamp` | `timestamp` | Unix seconds → ISO 8601 UTC |
| Instance name (from URL) | `instanceId` | Direct copy |
| — | `channel` | Fixed: `"whatsapp"` |

| NormalizedInboundMessage |
|-------------------------|
| `instanceId: string` |
| `messageId: string` |
| `from: string` |
| `text: string` |
| `timestamp: string` (ISO 8601 UTC) |
| `channel: "whatsapp"` |
| `senderName?: string` |

#### Scenario: Normalization strips WhatsApp suffix

- GIVEN `data.key.remoteJid: "5491111111111@s.whatsapp.net"`
- WHEN normalized
- THEN `from` is `"5491111111111"`

#### Scenario: Normalization converts timestamp

- GIVEN `data.messageTimestamp: 1715000000`
- WHEN normalized
- THEN `timestamp` is the ISO 8601 UTC equivalent (e.g. `"2024-05-06T12:53:20.000Z"`)

#### Scenario: Normalization uses extendedTextMessage fallback

- GIVEN no `data.message.conversation` but `data.message.extendedTextMessage.text: "reply text"`
- WHEN normalized
- THEN `text` is `"reply text"`

### Requirement: Routing to Serena Core

The system MUST route normalized messages to Serena Core's webhook endpoint.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{SERENA_CORE_URL}/internal/webhook/whatsapp` |
| Headers | `Content-Type: application/json`, `X-Serena-Internal-Token: <token>` |
| Body | The `NormalizedInboundMessage` JSON |

> Phase 3 note: Serena Core exposes `POST /internal/webhook/whatsapp`; the gateway can route inbound webhooks end-to-end through the internal core adapter.

| Configuration | Env Var |
|---------------|---------|
| Core URL | `SERENA_CORE_URL` |
| Internal token | `SERENA_INTERNAL_TOKEN` |

#### Scenario: Normalized message is routed to core

- GIVEN `SERENA_CORE_URL=http://core:3000` and `SERENA_INTERNAL_TOKEN=secret`
- AND a normalized message `{ instanceId: "serena-main", from: "5491111111111", text: "hola", ... }`
- WHEN routing occurs
- THEN `POST http://core:3000/internal/webhook/whatsapp` is called
- AND headers include `X-Serena-Internal-Token: secret`
- AND body is the normalized message

#### Scenario: Missing SERENA_CORE_URL logs error

- GIVEN `SERENA_CORE_URL` is not set
- WHEN a webhook is received and normalized
- THEN the message is NOT routed
- AND an error is logged mentioning `SERENA_CORE_URL`

### Requirement: Connection Update Handling

The system MUST process Evolution API `connection.update` events to keep the in-memory instance status synchronized with Evolution API.

| Evolution state | Gateway status |
|----------------|----------------|
| `open` | `open` |
| `connected` | `connected` |
| `connecting` | `connecting` |
| `close`, `closed`, `disconnected`, `loggedOut` | `disconnected` |
| Unknown state | `connecting` |

#### Scenario: Open connection update changes instance status

- GIVEN instance `"serena-main"` is tracked by `InstanceManager`
- WHEN `POST /webhook/evolution` receives `{ "event": "connection.update", "instance": "serena-main", "data": { "state": "open" } }`
- THEN response is `200` with `{ "received": true, "instance": "serena-main", "status": "open" }`
- AND `InstanceManager` stores status `"open"`

#### Scenario: Disconnected connection update changes instance status

- GIVEN instance `"serena-main"` is tracked by `InstanceManager`
- WHEN a `connection.update` event arrives with state `"close"`, `"closed"`, or `"disconnected"`
- THEN `InstanceManager` stores status `"disconnected"`

#### Scenario: Connection update for untracked instance is accepted

- GIVEN no local instance exists for `"unknown-instance"`
- WHEN a `connection.update` event arrives for that instance
- THEN the gateway returns `200`
- AND does not crash
- AND does not create local instance tracking implicitly
