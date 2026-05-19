# Delta for Gateway Instance Management

## ADDED Requirements

### Requirement: Private Allowlist Runtime-Config Decision

For T46 controlled rehearsal planning, allowed WhatsApp numbers and instance mappings MUST be configured outside committed code and outside repo secrets. They MUST NOT be hardcoded in application code and MUST NOT require PostgreSQL yet.

#### Scenario: Allowlist is runtime-owned

- GIVEN T45 readiness defines allowed numbers
- WHEN implementation is planned
- THEN the allowlist MUST be a private runtime/operator config concern
- AND committed examples MUST use placeholders only

#### Scenario: Hardcoded or PostgreSQL dependency is rejected

- GIVEN code, specs, or docs require committed real numbers or PostgreSQL for T45/T46 allowlist
- WHEN validation runs
- THEN readiness MUST fail closed

### Requirement: Controlled Rehearsal Instance-State Limits

The system MAY accept in-memory instance tracking only for a controlled private rehearsal. Any gateway or Evolution restart MUST abort the rehearsal and require operator revalidation before continuing.

#### Scenario: Restart requires revalidation

- GIVEN a paired or pairing-ready instance exists for controlled rehearsal
- WHEN gateway-wa or Evolution restarts
- THEN local readiness MUST be considered invalid
- AND the operator MUST revalidate instance, routing, allowlist, and evidence baseline before proceeding

#### Scenario: Sustained use needs hardening

- GIVEN the system is considered for sustained, shared, or public use
- WHEN readiness is assessed
- THEN deferred HMAC and in-memory state MUST NOT be accepted as sufficient
