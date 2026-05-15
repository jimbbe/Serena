# Delta for WhatsApp Gateway (`apps/gateway-wa`)

## ADDED Requirements

### Requirement: Staging Private Core Network Preparation

The gateway staging compose MUST attach `gateway-wa` to the external Docker network `serena-internal` so future staging can resolve `serena-core` privately. T38 MUST NOT deploy `gateway-wa`, start Evolution API, pair WhatsApp, modify Caddy, or open host ports.

#### Scenario: Gateway can resolve core privately in future staging

- GIVEN the T38 staging compose template is reviewed
- WHEN `gateway-wa` is inspected
- THEN it is attached to external network `serena-internal`
- AND it can use private core URL `http://serena-core:3000` in a later approved deploy

#### Scenario: T38 does not roll out gateway services

- GIVEN T38 is executed
- WHEN repository and runbook changes are applied
- THEN no `gateway-wa` or Evolution container is deployed or paired
- AND no Caddy route or host port is added

### Requirement: T38 Operational Isolation

T38 MUST NOT touch Hermes, `necrologia-bot`, unrelated services, Docker volumes, or committed secrets. The runbook MUST preserve `/docker/serena/.env` and volumes during update and rollback.

#### Scenario: Safe update path supports Git and non-Git VPS copies

- GIVEN `/docker/serena` may be a Git checkout or a copied source tree
- WHEN the operator follows the T38 runbook
- THEN it provides safe steps for both cases without deleting `.env` or volumes

#### Scenario: Rollback preserves runtime state

- GIVEN rollback is required after refresh
- WHEN the prior approved source is restored
- THEN `.env` and Docker volumes remain unchanged
- AND only Serena core source/compose changes are reverted
