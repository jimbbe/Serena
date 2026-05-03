# Inbound Simulation Command Specification

## Purpose

Define the `InboundMessageCommand` type as the channel-agnostic input contract for any inbound message entering the Serena pipeline. This type replaces WhatsApp-specific field names (`senderWhatsAppId`, `messageText`) with a normalized, channel-independent shape that any future channel adapter (voice, web_chat, telegram) can produce.

## Requirements

### Requirement: InboundMessageCommand Type

The system SHALL define `InboundMessageCommand` in `inbound-gate/domain/inbound-message-command.ts` with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | `InboundChannel` | Yes | Source channel identifier |
| `externalSenderId` | `string` | Yes | Sender identifier as provided by the channel |
| `text` | `string` | Yes | Message text content |
| `tenantId` | `string` | No | Multi-tenant identifier (reserved for future) |
| `personId` | `string` | No | Resolved person identifier (set after contact directory lookup) |
| `conversationId` | `string` | No | Active conversation/session identifier |
| `occurredAt` | `string` | No | ISO 8601 timestamp of message receipt |
| `metadata` | `Record<string, unknown>` | No | Channel-specific extras (e.g., media URLs, reaction info) |

#### Scenario: Minimal valid command

- GIVEN a command with only `channel`, `externalSenderId`, and `text`
- WHEN the command is constructed
- THEN it is a valid `InboundMessageCommand`

#### Scenario: Full command with all optional fields

- GIVEN a command with all fields populated
- WHEN the command is constructed
- THEN it is a valid `InboundMessageCommand` with complete context

#### Scenario: Blank text is allowed at type level

- GIVEN a command with `text` set to an empty string or whitespace
- WHEN the command is constructed
- THEN the type system accepts it (validation happens at use-case level, not type level)

### Requirement: InboundChannel Values

The system SHALL define `InboundChannel` as a string union type with exactly these values: `"whatsapp"`, `"voice"`, `"web_chat"`, `"telegram"`, `"system"`, `"simulation"`. No other values SHALL be accepted.

#### Scenario: All channel values are valid

- GIVEN a channel value
- WHEN the value is one of: `whatsapp`, `voice`, `web_chat`, `telegram`, `system`, `simulation`
- THEN the type system accepts it

#### Scenario: Unknown channel value is rejected

- GIVEN an arbitrary string like `"email"` or `"sms"`
- WHEN used as an `InboundChannel`
- THEN the type system rejects it at compile time

#### Scenario: Simulation channel is reserved for dev use

- GIVEN the `simulation` channel value
- WHEN used in a command
- THEN it is treated identically to other channels by the pipeline (no special behavior at the type level)

### Requirement: Command Validation at HTTP Boundary

The simulation endpoint SHALL validate incoming JSON payloads against the `InboundMessageCommand` shape before passing them to the use case. Validation rules:

1. `channel` — required, must be one of the six valid channel strings
2. `externalSenderId` — required, must be a non-empty string after trimming
3. `text` — required, must be a non-empty string after trimming
4. `tenantId` — optional, if present must be a non-empty string
5. `personId` — optional, if present must be a non-empty string
6. `conversationId` — optional, if present must be a non-empty string
7. `occurredAt` — optional, if present must be a valid ISO 8601 string
8. `metadata` — optional, if present must be a JSON object (not array, not primitive)

#### Scenario: Missing required field produces field-level error

- GIVEN a payload missing `channel`
- WHEN validation runs
- THEN the response includes a field error for `channel` with message "Required"

#### Scenario: Invalid channel value produces field-level error

- GIVEN a payload with `channel: "email"`
- WHEN validation runs
- THEN the response includes a field error for `channel` with message "Must be one of: whatsapp, voice, web_chat, telegram, system, simulation"

#### Scenario: Blank externalSenderId produces field-level error

- GIVEN a payload with `externalSenderId: "   "`
- WHEN validation runs
- THEN the response includes a field error for `externalSenderId` with message "Required non-empty string"

#### Scenario: Invalid occurredAt produces field-level error

- GIVEN a payload with `occurredAt: "not-a-date"`
- WHEN validation runs
- THEN the response includes a field error for `occurredAt` with message "Must be a valid ISO 8601 string"

#### Scenario: Valid payload with only required fields passes

- GIVEN `{"channel": "simulation", "externalSenderId": "maria", "text": "hola"}`
- WHEN validation runs
- THEN validation passes with no errors

### Requirement: Backward Compatibility with Existing PipelineInput

The `InboundMessageCommand` SHALL NOT replace or modify the existing `PipelineInput` type used by `POST /internal/pipeline/process`. The existing WhatsApp-specific endpoint continues to work unchanged. `InboundMessageCommand` is a parallel input contract for the simulation endpoint and future channel adapters.

#### Scenario: Existing pipeline endpoint unaffected

- GIVEN the existing `POST /internal/pipeline/process` endpoint
- WHEN a request with `senderWhatsAppId` and `messageText` is sent
- THEN it continues to work as before, using `PipelineInput`
