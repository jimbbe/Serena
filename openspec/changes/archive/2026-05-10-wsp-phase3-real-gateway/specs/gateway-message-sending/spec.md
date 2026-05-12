# Gateway Message Sending Specification

## Purpose

Define the endpoint for sending text messages via the Evolution API.

## Requirements

### Requirement: Send Text Message

The system MUST expose `POST /send` to send a text message through a WhatsApp instance.

| Aspect | Detail |
|--------|--------|
| Auth | App key required (`X-Gateway-App-Key`) |
| Request body | `{ "instanceId": "<name>", "to": "<whatsapp-id>", "text": "<message>" }` |
| Success | `200` with message confirmation |
| Instance not found | `404` with error |
| Evolution API error | `502` with error detail |

| Request Field | Validation |
|---------------|------------|
| `instanceId` | Required, non-empty string |
| `to` | Required, non-empty, must be numeric WhatsApp ID |
| `text` | Required, non-empty after trimming |

| Response (200) | Field | Description |
|----------------|-------|-------------|
| `messageId` | Evolution API message ID (e.g. `"wamid.xxx"`) |
| `status` | `"sent"` |
| `timestamp` | ISO 8601 UTC when message was sent |

#### Scenario: Send text message succeeds

- GIVEN valid app key and instance `"serena-main"` exists and is connected
- WHEN `POST /send` with `{ "instanceId": "serena-main", "to": "5491111111111", "text": "Hola Maria" }`
- THEN Evolution API sends the message
- AND response is `200` with `{ "messageId": "wamid.xxx", "status": "sent", "timestamp": "2026-05-10T..." }`

#### Scenario: Send with missing instanceId

- WHEN `POST /send` with `{ "to": "5491111111111", "text": "Hola" }` (no `instanceId`)
- THEN response is `400` with `{ "error": "validation_error", "fields": ["instanceId"] }`

#### Scenario: Send with empty text

- WHEN `POST /send` with `{ "instanceId": "serena-main", "to": "5491111111111", "text": "   " }`
- THEN response is `400` with `{ "error": "validation_error", "fields": ["text"] }`

#### Scenario: Send to non-existent instance

- WHEN `POST /send` with `{ "instanceId": "nonexistent", "to": "5491111111111", "text": "Hola" }`
- THEN response is `404` with `{ "error": "instance_not_found", "name": "nonexistent" }`

#### Scenario: Send when Evolution API is unreachable

- GIVEN `EVOLUTION_API_URL` points to unreachable host
- WHEN `POST /send` is called with valid body
- THEN response is `502` with `{ "error": "evolution_unreachable", "message": "Evolution API is not reachable" }`

#### Scenario: Send with disconnected instance

- GIVEN instance `"serena-main"` exists but is in `"disconnected"` status
- WHEN `POST /send` is called
- THEN response is `400` with `{ "error": "instance_not_connected", "name": "serena-main", "status": "disconnected" }`
