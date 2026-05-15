# Delta for WhatsApp Inbound Webhook

## MODIFIED Requirements

### Requirement: Internal WhatsApp Webhook Route

Serena Core MUST expose `POST /internal/webhook/whatsapp` as an internal endpoint. The endpoint MUST NOT be gated by `ENABLE_SIMULATION_ENDPOINTS` and MUST NOT call Evolution API, create workers, connect PostgreSQL, add dependencies, or introduce Italian-language behavior. A valid inbound confirmation MAY indirectly cause delivery only by running the normal channel-inbound pipeline and its configured `DeliveryPort` boundary.
(Previously: the webhook route could not call any `DeliveryPort`.)

#### Scenario: Route exists outside simulation mode

- GIVEN `ENABLE_SIMULATION_ENDPOINTS` is unset or false
- WHEN a valid authenticated POST is sent to `/internal/webhook/whatsapp`
- THEN the request is accepted and routed to Serena Core

#### Scenario: No direct provider integration

- GIVEN the webhook receives a valid gateway-normalized payload
- WHEN the request is processed
- THEN Serena Core does not call Evolution API directly
- AND any outbound delivery goes only through the configured delivery port

### Requirement: WhatsApp Webhook Pipeline Mapping

The endpoint MUST map the payload to the `ProcessChannelInboundMessage` equivalent: `channel: "whatsapp"`, `externalSenderId: senderWhatsAppId`, `text`, `occurredAt: receivedAt`, and `metadata` containing `provider`, `instanceId`, `messageId`, `senderName`, and `raw`. On success it MUST return `{ received: true, routedTo: "serena-core", result: ... }`. It MUST preserve the normal pipeline state machine; inbound webhooks MUST NOT bypass confirmation, draft creation, or `RequestOutboundDelivery`.
(Previously: mediation requests could prepare outbound data but no outbound delivery was requested automatically.)

#### Scenario: Mediation request prepares only

- GIVEN a known sender asks Serena to message an allowed contact
- WHEN the webhook processes the initial request
- THEN the result MAY include prepared outbound draft data
- AND no outbound delivery is requested automatically

#### Scenario: Confirmed mediation can deliver indirectly

- GIVEN a known sender has a confirming mediation flow with a resolved recipient
- WHEN the webhook receives an explicit positive confirmation
- THEN the normal pipeline may request delivery through `RequestOutboundDelivery`
- AND the webhook itself does not perform transport-specific sending
