# Delta for Gateway Private Staging Readiness

## ADDED Requirements

### Requirement: T45 Controlled Pairing Readiness Gate

After T44, the system MUST treat T45 as a repo-only GO/NO-GO gate for T46 controlled pairing planning, not as approval to mutate runtime or pair WhatsApp.

#### Scenario: T45 preserves T44 guardrails

- GIVEN T44 closed as GO for T45 planning only
- WHEN T45 readiness is reviewed
- THEN pairing, real sends, public/admin exposure, host ports, Caddy/DNS/VPS/Docker mutation, secret changes, HMAC rollout, PostgreSQL rollout, and durable state rollout MUST remain blocked

#### Scenario: T45 validation is fail-closed

- GIVEN T45 docs/specs broaden scope or omit mandatory readiness fields
- WHEN repo validation runs
- THEN validation MUST fail without contacting runtime services

### Requirement: T45 Machine-Checkable Artifact Validation

The system MUST provide a repo-side script/test that validates the canonical T45 artifact includes the GO/NO-GO ledger, mandatory evidence fields, pairing deferral, risk acceptances, non-actions, and 4-task roadmap constraint.

#### Scenario: Required fields are enforced

- GIVEN the canonical T45 artifact omits any required ledger, evidence, deferral, risk, non-action, or roadmap field
- WHEN validation runs
- THEN validation MUST fail closed

#### Scenario: Bounded artifact passes

- GIVEN the canonical T45 artifact keeps scope repo-only and all mandatory fields present
- WHEN validation runs
- THEN validation SHOULD pass without runtime, VPS, Docker, DNS, or Caddy access
