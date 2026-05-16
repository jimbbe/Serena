# Delta for Mediation Flow

## MODIFIED Requirements

### Requirement: R7 — Confirmation Resolution

When status is `confirming` (pending action is `confirm_mediation`):
- **Positive confirmation**: keywords "sí", "mandalo", "confirmo", "dale", "ok", "dale que sí", "mandale" MUST transition the flow to `resolved`, mark the draft as confirmed, and MAY request delivery only through `RequestOutboundDelivery` when the resulting outbound draft is `confirmed_pending_delivery` with a resolved recipient.
- **Negative/cancel**: keywords "no", "mejor no", "esperá", "no lo mandes", "cancelá", "cancelar" MUST transition to `resolved` and mark the draft as cancelled.
- **Draft edit**: input containing "cambiá", "mejor", "decile", "poné", "modificá" plus message content MUST update the draft, increment version, and re-request confirmation.
- **Ambiguous**: unmatched input MUST re-prompt and keep status `confirming`.
(Previously: positive confirmation only prepared a confirmed draft and explicitly said no real message was sent.)

#### Scenario: Explicit confirmation can request delivery

- GIVEN an active confirming flow with a resolved recipient and message draft
- WHEN the user says "sí, mandalo"
- THEN the flow is resolved and the outbound draft is confirmed
- AND delivery is requested only through `RequestOutboundDelivery`

#### Scenario: Confirmation without resolved recipient does not send

- GIVEN an active confirming flow whose recipient is not resolved
- WHEN the user confirms delivery
- THEN no delivery port is called
- AND the result exposes the draft status requiring recipient resolution or disambiguation

### Requirement: R9 — Safe Explicit Delivery Boundary

The system MUST NOT call Evolution API, PostgreSQL, queues, workers, or any transport directly from mediation flow handling. Real outbound communication MAY occur only after explicit user confirmation, a resolved recipient, and orchestration through `RequestOutboundDelivery` plus `DeliveryPort`. The fake delivery adapter MUST remain the safe default.
(Previously: the system performed no real outbound communication at all.)

#### Scenario: No implicit delivery

- GIVEN a mediation request creates or edits a draft
- WHEN no explicit positive confirmation has occurred
- THEN no delivery is requested

#### Scenario: Transport boundary is preserved

- GIVEN a confirmed pending delivery draft
- WHEN delivery is requested
- THEN mediation flow delegates to `RequestOutboundDelivery`
- AND does not call gateway-wa or Evolution API directly
