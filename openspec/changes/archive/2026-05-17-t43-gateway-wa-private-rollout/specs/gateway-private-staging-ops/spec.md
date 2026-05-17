# Delta for Gateway Private Staging Ops

## MODIFIED Requirements

### Requirement: Private Evolution Staging Topology

T43 MUST allow private VPS rollout for `gateway-wa`, Evolution API, `evo-postgres`, Redis, and supporting private services only after T40 Core webhook readiness is confirmed. The rollout MUST fail closed: no host `ports:`, Caddy route, DNS mutation, public admin surface, WhatsApp pairing, real send, or `OUTBOUND_DELIVERY_ADAPTER` change away from `fake` is permitted.
(Previously: T42 defined repo-only/private readiness and allowed a justified template-required host port.)

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
(Previously: T42 defined safe private smoke for readiness, not approved live private rollout validation.)

#### Scenario: Smoke checks are safe and private

- GIVEN private staging is reachable by an approved operator-only path
- WHEN smoke validation runs
- THEN it checks health, auth rejection, unknown route, malformed `/send`, and private reachability
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
(Previously: T42 evidence covered readiness actions and non-actions without live rollout completion requirements.)

#### Scenario: Evidence records actions and non-actions

- GIVEN T43 validation completes or aborts
- WHEN the operator updates evidence
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
