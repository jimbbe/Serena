# Delta for Gateway Private Staging Ops

## MODIFIED Requirements

### Requirement: Private Evolution Staging Topology

T42 MUST allow only a backup-first private VPS staging rollout for `gateway-wa` and Evolution API. It MUST NOT publish Evolution admin, gateway admin, Caddy routes, DNS records, or host ports unless a template-required host port is explicitly justified before use.
(Previously: T41 prepared repo-only templates/runbooks and performed no live operation.)

#### Scenario: Private rollout remains non-public

- GIVEN an operator prepares the T42 staging rollout
- WHEN staging services are deployed or inspected
- THEN `gateway-wa`, Evolution API, and dependencies remain private to approved Docker networks
- AND no Caddy route, DNS mutation, public admin surface, or unjustified host port is introduced

#### Scenario: Backup and rollback precede VPS mutation

- GIVEN any T42 step would mutate the VPS
- WHEN the operator proceeds
- THEN a restorable pre-mutation backup path and rollback steps MUST be documented first
- AND the rollout MUST abort if backup or rollback evidence is missing

### Requirement: Non-Destructive Readiness Validation

T42 MUST define smoke validation that proves private deployability without pairing WhatsApp, sending real messages, mutating production Core, exposing admin surfaces, deleting data, or printing secrets.
(Previously: T41 validation was repo-only and checked configuration shape/private reachability assumptions.)

#### Scenario: Smoke checks are safe and private

- GIVEN private staging is reachable by an approved operator-only path
- WHEN smoke validation runs
- THEN it checks health, auth rejection, unknown route, malformed `/send`, and private network reachability
- AND it does not pair WhatsApp, request QR onboarding, or send real messages

#### Scenario: Public exposure checks fail closed

- GIVEN the smoke or runbook inspects staging exposure
- WHEN public Caddy routes, DNS records, admin endpoints, or host ports are required
- THEN validation MUST fail and the rollout MUST stop

## ADDED Requirements

### Requirement: Operator Evidence

T42 MUST leave operator evidence covering what was deployed and verified, the backup path, rollback steps, and explicit non-actions.

#### Scenario: Evidence records actions and non-actions

- GIVEN T42 staging validation completes or aborts
- WHEN the operator updates the runbook or verification notes
- THEN the evidence states deployed services, checks performed, backup path, rollback command/steps, and result
- AND it explicitly states no Caddy/DNS change, public admin route, WhatsApp pairing, real send, or secret commit occurred
