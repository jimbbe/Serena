# Delta for Gateway Private Staging Ops

## ADDED Requirements

### Requirement: T47 Private Runtime Gates

Before any T47 pairing attempt, the operator MUST verify `/docker/serena`, running containers, expected private network membership, no host ports for `gateway-wa`, no `proxy`/public route attachment, Core outbound set to `fake`, private health, `/send` returning `401` without key, malformed `/send` returning `400` with the private key, and unknown path returning `404`.

#### Scenario: Runtime topology is private

- GIVEN the VPS runtime is inspected privately
- WHEN topology gates are recorded
- THEN `/docker/serena`, container status, private networks, no host ports, and no proxy/public attachment MUST be proven with redacted evidence
- AND no Caddy or DNS route MUST be required

#### Scenario: Private smoke is non-destructive

- GIVEN private access to `gateway-wa` exists
- WHEN health/auth/malformed-send/unknown-path checks run
- THEN expected private health, `401`, `400`, and `404` outcomes MUST be recorded
- AND no real message body or secret key value MUST be printed

### Requirement: T47 Non-Destructive Runtime Boundary

T47 MUST NOT expose public/admin routes, mutate Caddy/DNS, publish host ports, delete volumes, switch Core outbound away from `fake`, or touch unrelated projects.

#### Scenario: Boundary violation aborts

- GIVEN any T47 step requires public exposure, host ports, Caddy/DNS mutation, volume deletion, real sends, or unrelated project mutation
- WHEN the requirement is detected
- THEN execution MUST stop as NO-GO with sanitized blocker evidence
