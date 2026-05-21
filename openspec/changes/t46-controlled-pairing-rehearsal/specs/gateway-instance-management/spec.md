# Delta for Gateway Instance Management

## ADDED Requirements

### Requirement: Private Operator Pairing Path

T46 QR/pairing MUST use only an operator-controlled private path for one approved runtime-owned instance/number pair. Real numbers, QR values, route secrets, allowlist contents, tokens, and credentials MUST NOT be committed, printed, or exposed publicly. `/instances*` and pairing state MUST NOT require Caddy/DNS/public admin access or host port publication.

#### Scenario: Operator-only QR access

- GIVEN the operator has private access and reviewer approval
- WHEN QR/pairing is requested for T46
- THEN access MUST remain private/operator-only
- AND evidence MUST use placeholders or redacted identifiers only

#### Scenario: Public path is rejected

- GIVEN QR/pairing requires Caddy, DNS, host ports, or public/admin exposure
- WHEN T46 gates are evaluated
- THEN the rehearsal MUST be NO-GO

### Requirement: Runtime State Revalidation

T46 MUST treat gateway/Evolution/Redis/dependent-path restart, unknown route, route mismatch, or allowlist mismatch as readiness invalidation. Continuation MAY occur only after operator revalidates instance, route, allowlist, private path, and evidence baseline.

#### Scenario: Restart invalidates pairing readiness

- GIVEN a T46 instance is pairing-ready or paired
- WHEN gateway-wa, Evolution, Redis, or dependent routing restarts
- THEN the attempt MUST abort
- AND readiness MUST be revalidated before any continuation
