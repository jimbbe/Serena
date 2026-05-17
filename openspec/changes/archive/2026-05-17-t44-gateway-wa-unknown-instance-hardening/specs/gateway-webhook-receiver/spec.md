# Delta for Gateway Webhook Receiver

## ADDED Requirements

### Requirement: Routing-Table Unknown Instance Hardening

When routing-table mode is active, the system MUST inspect a present string `instance` before payload-dependent duplicate detection, filtering, normalization, or core routing. If that instance has no configured route, the system MUST fail closed with a controlled non-500 `routing_not_configured` response. A missing or non-string `instance` MUST remain a malformed webhook client error, not an unknown-route result.

#### Scenario: Unknown routed instance is rejected before normalization

- GIVEN routing-table mode is active
- AND a webhook payload contains `instance: "unknown-instance"` but lacks fields required by message normalization
- WHEN `POST /webhook/evolution` receives the payload with valid Evolution auth
- THEN the response is non-500 with `{ "ignored": true, "reason": "routing_not_configured", "instanceId": "unknown-instance" }`
- AND the payload is NOT normalized or routed to Serena Core

#### Scenario: Missing instance remains malformed input

- GIVEN routing-table mode is active
- AND a webhook payload has no usable string `instance`
- WHEN `POST /webhook/evolution` receives the payload with valid Evolution auth
- THEN the response is `400` with reason `invalid_webhook_payload`
- AND the response is NOT `routing_not_configured`

#### Scenario: Known routed message behavior is preserved

- GIVEN routing-table mode maps `serena-main` to Serena Core
- AND a valid inbound text webhook contains `instance: "serena-main"`
- WHEN `POST /webhook/evolution` receives the payload
- THEN it follows the existing duplicate, self-message, non-text, normalization, and routing behavior
- AND valid routed inbound responses remain unchanged

#### Scenario: Duplicate behavior remains scoped to routable messages

- GIVEN routing-table mode maps `serena-main` to Serena Core
- AND a webhook with `messageId: "wamid-001"` was processed 2 minutes ago for `serena-main`
- WHEN the same routable webhook arrives again
- THEN the existing duplicate response is returned
- AND the message is NOT re-routed to Serena Core

#### Scenario: Connection update behavior is preserved

- GIVEN a `connection.update` webhook contains any instance name
- WHEN `POST /webhook/evolution` receives the payload
- THEN existing connection status handling remains unchanged
- AND unknown connection-update instances are still accepted without implicit local instance creation
