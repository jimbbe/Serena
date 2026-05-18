# Gateway Private Staging Readiness Specification

## Purpose

Define T44 as a repo-only operational readiness, go/no-go, and operator handoff milestone for already-private `gateway-wa` staging.

## Requirements

### Requirement: Readiness Package

The system MUST provide a private-staging readiness package that states checklist status, evidence links, blocked follow-ups, and explicit non-actions.

#### Scenario: Readiness package is complete

- GIVEN T43 private staging evidence exists
- WHEN T44 readiness is reviewed
- THEN the package MUST include checklist status, supporting evidence, blocked next steps, and rollback reference
- AND it MUST state no pairing, public/admin exposure, real sends, secrets, or runtime mutations are approved

#### Scenario: Missing evidence fails closed

- GIVEN required evidence or checklist fields are missing
- WHEN readiness is validated
- THEN the package MUST be treated as not ready

### Requirement: Go/No-Go Decision Ledger

The system MUST record a go/no-go ledger with decision, reviewer/operator identity fields, timestamp, rationale, and explicit gates.

#### Scenario: Go decision records boundaries

- GIVEN all readiness checks pass
- WHEN a GO is recorded
- THEN the ledger MUST limit approval to private operator-only staging review
- AND pairing, public/admin exposure, real sends, secrets changes, and runtime mutations MUST remain blocked

#### Scenario: No-go records remediation

- GIVEN any fail-closed gate is unmet
- WHEN a NO-GO is recorded
- THEN the ledger MUST identify the unmet gate and required repo-side remediation

### Requirement: Operator Handoff And Rollback Ownership

The system MUST define who owns operator handoff, evidence updates, go/no-go recording, and rollback execution without changing runtime.

#### Scenario: Handoff names accountable owners

- GIVEN T44 artifacts are prepared
- WHEN an operator receives handoff
- THEN ownership for readiness review, evidence maintenance, and rollback execution MUST be explicit

### Requirement: Machine-Checkable Readiness Validation

The system SHOULD provide repo-side validation for docs, templates, and evidence consistency.

#### Scenario: Validation detects forbidden expansion

- GIVEN readiness artifacts mention pairing, public/admin exposure, real sends, secrets, host ports, Caddy/DNS changes, or Docker/VPS mutation as approved
- WHEN validation runs
- THEN validation MUST fail closed

#### Scenario: Validation passes bounded artifacts

- GIVEN artifacts preserve private-only topology, redacted placeholders, blocked follow-ups, and required evidence links
- WHEN validation runs
- THEN validation SHOULD pass without contacting runtime services
