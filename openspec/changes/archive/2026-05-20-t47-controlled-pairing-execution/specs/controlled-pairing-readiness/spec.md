# Delta for Controlled Pairing Readiness

## ADDED Requirements

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
