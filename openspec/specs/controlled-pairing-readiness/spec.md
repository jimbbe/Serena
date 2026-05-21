# Controlled Pairing Readiness Specification

## Purpose

Define T45 as a repo-only GO/NO-GO readiness gate for a future T46 private WhatsApp pairing rehearsal.

## Requirements

### Requirement: Canonical Readiness Artifact

T45 MUST provide one canonical repo artifact with a GO/NO-GO ledger for T46.

| Required field | Meaning |
|---|---|
| decision | GO, NO-GO, or PENDING |
| reviewer/operator | accountable humans or explicit TBD blocker |
| timestamp | ISO timestamp or explicit pending marker |
| rationale | why the decision is safe |
| gates | allowlist, pairing plan, evidence, risks, non-actions |

#### Scenario: Gate records GO boundaries

- GIVEN every mandatory gate is complete
- WHEN T45 records GO
- THEN approval MUST be limited to planning T46 controlled pairing
- AND T45 MUST NOT authorize QR execution, runtime mutation, or real sends

#### Scenario: Missing gate fails closed

- GIVEN any mandatory gate is absent or broadened
- WHEN validation runs
- THEN T45 MUST be NO-GO or PENDING

### Requirement: T46 Pairing Activation Plan

T45 MUST defer QR/pairing to T46 and require operator/reviewer, abort criteria, and evidence before activation.

#### Scenario: Pairing remains deferred

- GIVEN T45 artifacts are complete
- WHEN an operator reads the plan
- THEN QR/pairing execution MUST be marked T46-only
- AND evidence expectations and abort criteria MUST be explicit

### Requirement: Operational Evidence Fields

Future real-test evidence MUST require `timestamp`, `instanceId`, `sender/personId`, `messageId`, pipeline decision, selected action, sent/not sent, error, and operator notes. It MUST NOT require secrets or unnecessary sensitive content.

#### Scenario: Evidence is minimally sufficient

- GIVEN a future controlled test occurs
- WHEN evidence is recorded
- THEN every required field MUST be present
- AND message content, tokens, QR values, and credentials MUST be omitted or redacted

### Requirement: Bounded Risk Acceptance

T45 MAY accept deferred HMAC and in-memory instance state only for personal-use, private, controlled rehearsal planning. Sustained/public use MUST require future hardening. Gateway restart MUST abort and trigger revalidation.

#### Scenario: Restart invalidates readiness

- GIVEN a controlled rehearsal is planned
- WHEN `gateway-wa` or Evolution state restarts unexpectedly
- THEN rehearsal MUST abort until instance state and routing are revalidated

### Requirement: Non-Actions And Roadmap Constraint

T45 MUST forbid pairing, real sends, public/admin exposure, host ports, Caddy/DNS/VPS/Docker mutation, secret changes, PostgreSQL rollout, HMAC implementation, and durable state rollout. T45 MUST preserve a path to first real tests within no more than 4 tasks.

#### Scenario: Validation rejects scope expansion

- GIVEN T45 artifacts approve any forbidden non-action or remove the 4-task runway
- WHEN the machine-checkable T45 validation script/test runs
- THEN validation MUST fail closed

### Requirement: T47 Execute-Or-No-Go Closeout

T47 MUST close as exactly one of: sanitized private pairing attempt evidence, scan-required stop state, completed-pairing sanitized state, or concrete operational NO-GO. T47 MUST first verify local repo state: branch from updated `main`, PR #76 merged, `npm run check` passing, and `npm test` passing.

#### Scenario: Local gates pass before runtime work

- GIVEN T47 execution is requested
- WHEN local gates are evaluated
- THEN updated `main`, merged PR #76, `npm run check`, and `npm test` MUST be recorded
- AND runtime execution MUST NOT start if any gate fails

#### Scenario: NO-GO is concrete

- GIVEN any mandatory gate cannot be proven
- WHEN T47 closes NO-GO
- THEN evidence MUST include the failed command/check, missing precondition, sanitized output, and next operator action

### Requirement: Sanitized Evidence And Validation

T47 MUST update the sanitized evidence doc, project status, and only real open questions. It MUST add or update machine-checkable validation/check wiring when needed. Evidence MUST be guarded against QR values, phone numbers, tokens, API keys, real routing, real allowlists, message bodies, credentials, and secret public URLs.

#### Scenario: Prohibited evidence fails validation

- GIVEN T47 artifacts contain prohibited evidence
- WHEN validation runs
- THEN validation MUST fail closed
- AND the artifact MUST be corrected before PR review

#### Scenario: Documentation changes are factual

- GIVEN T47 reaches attempt, scan-required, completed, or NO-GO state
- WHEN docs are updated
- THEN status/evidence MUST reflect only observed facts
- AND open questions MUST change only for real unresolved decisions
