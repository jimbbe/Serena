# Delta for gateway-instance-management

## ADDED Requirements

### Requirement: Operator-Only Instance and Number Management

T41 MUST constrain WhatsApp instance, number, and selected config management to operator-only private access. Public admin exposure and end-user/self-service management are out of scope.

#### Scenario: Management uses private operator path

- GIVEN an operator manages instances or routing config
- WHEN `/instances*` or config artifacts are used
- THEN access is limited to an operator-controlled private path
- AND no public Caddy/admin route is introduced

#### Scenario: No real pairing in T41

- GIVEN instance management readiness is validated
- WHEN QR/pairing behavior is documented or smoke-checked
- THEN no real WhatsApp account is paired
- AND no real number is onboarded

### Requirement: Phase-Limited Management State

T41 MUST document that instance tracking and routing/config management remain staging-limited: in-memory instance state, file/env configuration, and no startup rehydration or durable admin store.

#### Scenario: Restart limitation is explicit

- GIVEN `gateway-wa` restarts during staging
- WHEN an operator inspects managed instances
- THEN local tracking may be empty despite Evolution source-of-truth state
- AND rehydration/persistence remains future work
