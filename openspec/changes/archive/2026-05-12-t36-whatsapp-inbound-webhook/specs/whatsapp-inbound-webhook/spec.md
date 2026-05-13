# Delta for whatsapp-inbound-webhook

## ADDED Requirements

### Requirement: Internal WhatsApp Webhook Route

Serena Core MUST expose `POST /internal/webhook/whatsapp` as an internal endpoint. The endpoint MUST NOT be gated by `ENABLE_SIMULATION_ENDPOINTS` and MUST NOT call Evolution API, send outbound messages, create workers, connect PostgreSQL, add dependencies, or introduce Italian-language behavior.

#### Scenario: Route exists outside simulation mode

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is unset or false
- WHEN a valid authenticated POST is sent to `/internal/webhook/whatsapp`
- THEN the request is accepted and routed to Serena Core

#### Scenario: No direct provider integration

- GIVEN the webhook receives a valid gateway-normalized payload
- WHEN the request is processed
- THEN Serena Core does not call Evolution API or any `DeliveryPort`

### Requirement: WhatsApp Webhook Payload Validation

The endpoint MUST require a JSON object with non-empty string fields `instanceId`, `messageId`, `senderWhatsAppId`, `text`, and valid ISO 8601 `receivedAt`. If present, `channel` MUST equal `whatsapp`, `senderName` MUST be a non-empty string, and `raw` MUST be `Record<string, unknown>`. `provider` MAY be present, including `evolution`.

#### Scenario: Invalid payload reports fields

- GIVEN a valid internal token
- WHEN the body is not an object or has invalid required/optional fields
- THEN the response is 400 with `{ error: "invalid_payload", fields: [...] }`

#### Scenario: Valid provider metadata is accepted

- GIVEN a valid payload with `provider: "evolution"`, `senderName`, and object `raw`
- WHEN the webhook receives it
- THEN validation succeeds and those fields remain available as metadata

### Requirement: WhatsApp Webhook Pipeline Mapping

The endpoint MUST map the payload to the `ProcessChannelInboundMessage` equivalent: `channel: "whatsapp"`, `externalSenderId: senderWhatsAppId`, `text`, `occurredAt: receivedAt`, and `metadata` containing `provider`, `instanceId`, `messageId`, `senderName`, and `raw`. On success it MUST return `{ received: true, routedTo: "serena-core", result: ... }`.

#### Scenario: Happy path uses normal pipeline

- GIVEN a known sender sends a conversational WhatsApp payload
- WHEN the webhook processes the request
- THEN identity resolution, classification/fusion policy, mediation flow, and AI guide run through the normal channel-inbound pipeline

#### Scenario: Unknown sender follows pipeline policy

- GIVEN an unknown `senderWhatsAppId`
- WHEN the webhook processes the request
- THEN the result reflects the normal unknown-sender pipeline decision

#### Scenario: Mediation request can prepare outbound only

- GIVEN a known sender asks Serena to message an allowed contact
- WHEN the webhook processes the request
- THEN the result MAY include current pipeline `preparedOutbound`/OutboundDraft data
- AND no outbound delivery is requested automatically

#### Scenario: Risk request does not auto-send

- GIVEN a payload whose text contains risk or urgency signals
- WHEN the webhook processes the request
- THEN the normal risk-review result is returned and no outbound delivery is requested

#### Scenario: Metadata is preserved

- GIVEN a valid payload with provider, instanceId, messageId, senderName, and raw
- WHEN the webhook maps it to the inbound command
- THEN all those values are preserved under command metadata

### Requirement: Webhook Idempotency Future

The endpoint SHOULD document durable idempotency as future work if no idempotency cache is added in T36.

#### Scenario: No new idempotency cache in T36

- GIVEN T36 implements only the webhook adapter
- WHEN idempotency is reviewed
- THEN durable de-duplication remains documented as future work, not hidden behavior
