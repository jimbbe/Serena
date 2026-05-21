# Delta for Controlled Pairing Readiness

## ADDED Requirements

### Requirement: T46 Execution Gates And Evidence Ledger

T46 MUST remain NO-GO unless operator, reviewer, private access path, approved instance/number placeholders, route/allowlist revalidation, evidence template, abort criteria, and `OUTBOUND_DELIVERY_ADAPTER=fake` are recorded immediately before runtime. Evidence MUST be sanitized: timestamps, redacted instance/sender/message IDs, phase/state, pipeline decision/action, sent/not sent, error/abort reason, and notes are allowed; QR values, phone numbers, tokens, credentials, message bodies, and secrets MUST be omitted or redacted.

#### Scenario: Gates permit one rehearsal

- GIVEN every T46 gate is recorded and fake outbound is confirmed
- WHEN the operator starts the controlled pairing rehearsal
- THEN runtime may proceed for one approved private attempt only
- AND the ledger MUST record sanitized GO evidence

#### Scenario: Missing or unsafe evidence fails closed

- GIVEN any required gate or evidence field is missing, unredacted, or contradictory
- WHEN T46 is assessed
- THEN the decision MUST be NO-GO or deferred
- AND no runtime pairing may proceed

### Requirement: Abort Revalidate And Scope Boundaries

T46 MUST abort and require revalidation on restart, route mismatch, allowlist mismatch, missing evidence, redaction failure, or any forbidden scope expansion. T46 MUST NOT approve public/admin exposure, host ports, Caddy/DNS changes, PostgreSQL, HMAC, durable-state rollout, real sends, sustained use, or productive use.

#### Scenario: Abort trigger records deferred evidence

- GIVEN a rehearsal is pending or running
- WHEN a restart, mismatch, missing evidence, or forbidden expansion is detected
- THEN T46 MUST stop immediately
- AND the ledger MUST record sanitized NO-GO/deferred evidence
