# Gateway Private Staging Ops Specification

## Purpose

Define T43 private VPS rollout for `gateway-wa` and Evolution API where the staging stack stays private, backup-first, and non-destructive.

## Requirements

### Requirement: Private Evolution Staging Topology

T43 MUST allow private VPS rollout for `gateway-wa`, Evolution API, `evo-postgres`, Redis, and supporting private services only after T40 Core webhook readiness is confirmed. The rollout MUST fail closed: no host `ports:`, Caddy route, DNS mutation, public admin surface, WhatsApp pairing, real send, or `OUTBOUND_DELIVERY_ADAPTER` change away from `fake` is permitted.

#### Scenario: Private rollout remains non-public

- GIVEN an operator prepares the T43 staging rollout
- WHEN staging services are deployed or inspected
- THEN `gateway-wa`, Evolution API, and dependencies remain private to approved Docker networks
- AND no Caddy route, DNS mutation, public admin surface, host port, pairing, or real send is introduced

#### Scenario: Core webhook readiness is a precondition

- GIVEN T40 Core webhook readiness evidence is unavailable or stale
- WHEN the operator attempts T43 rollout
- THEN the rollout MUST stop before mutating staging services

#### Scenario: Backup and rollback precede VPS mutation

- GIVEN any T43 step would mutate the VPS
- WHEN the operator proceeds
- THEN a restorable pre-mutation backup path and rollback steps MUST be documented first
- AND the rollout MUST abort if backup, rollback, or scope evidence is missing

### Requirement: Non-Destructive Readiness Validation

T43 MUST validate private deployability with operator-only, synthetic smoke checks. Smoke MUST NOT pair WhatsApp, request QR onboarding, send real messages, mutate production Core, expose admin surfaces, delete data/volumes, print secrets, or expand product outbound behavior.

#### Scenario: Smoke checks are safe and private

- GIVEN private staging is reachable by an approved operator-only path
- WHEN smoke validation runs
- THEN it checks health, auth rejection, unknown path (`GET /unknown-path` returns 404), malformed `/send`, and private reachability
- AND it does not pair WhatsApp, request QR onboarding, or send real messages

#### Scenario: Outbound remains fake

- GIVEN T43 smoke reaches Serena Core or gateway boundaries
- WHEN outbound behavior is inspected
- THEN `OUTBOUND_DELIVERY_ADAPTER=fake` remains in effect
- AND no new product auto-send behavior is exercised or enabled

#### Scenario: Public exposure checks fail closed

- GIVEN the smoke or runbook inspects staging exposure
- WHEN public Caddy routes, DNS records, admin endpoints, host ports, or SSH tunnel misuse are required
- THEN validation MUST fail and the rollout MUST stop

### Requirement: Operator Evidence

T43 MUST leave sanitized operator evidence covering backup, exact rollout scope, private-only proof, smoke results, rollback, secrets posture, and explicit non-actions.

#### Scenario: Evidence records actions and non-actions

- GIVEN T43 validation completes or aborts
- WHEN the operator updates the runbook or verification notes
- THEN it states deployed services, backup path, private access proof, checks, rollback steps, and result
- AND it explicitly states no Caddy/DNS change, public admin route, host port, pairing, real send, secret commit/print, or volume deletion occurred

#### Scenario: Secrets stay private

- GIVEN real environment values are needed for T43
- WHEN configuration or evidence is prepared
- THEN real secrets exist only on the VPS runtime environment
- AND repository artifacts and logs contain placeholders or redacted values only

#### Scenario: Rollback is staging-scoped

- GIVEN rollback is needed
- WHEN rollback instructions are followed
- THEN they stop or remove only T43 staging containers while preserving volumes by default
- AND Core, Caddy, DNS, and unrelated projects remain untouched

### Requirement: T43 Evidence Feeds T44 Readiness

T44 MUST consume T43 private rollout evidence as readiness input only. It MUST NOT broaden T43 runtime behavior, mutate VPS/Caddy/DNS/Docker, approve pairing, expose public/admin routes, enable real sends, print or commit secrets, implement HMAC, or implement durable state.

#### Scenario: Evidence becomes readiness input

- GIVEN T43 evidence records private rollout, smoke results, rollback notes, and non-actions
- WHEN T44 readiness is prepared
- THEN those records MUST be cited as baseline evidence for the go/no-go package
- AND no new runtime action is implied by the citation

#### Scenario: Runtime mutation fails closed

- GIVEN a T44 artifact or validation path requires VPS, Caddy, DNS, Docker runtime mutation, pairing, public/admin exposure, real sends, or secret handling changes
- WHEN the T44 package is reviewed or validated
- THEN the change MUST be rejected as out of scope

#### Scenario: Follow-ups remain blocked

- GIVEN HMAC authenticity, durable state, startup rehydration, pairing, real sends, or public/admin exposure are needed for future milestones
- WHEN T44 readiness is marked GO for private staging
- THEN those items MUST remain documented as blocked follow-ups, not approved work

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
