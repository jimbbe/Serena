# Delta for Gateway Instance Management

## ADDED Requirements

### Requirement: Single Private Pairing Attempt

T47 MUST execute at most one private pairing attempt, only after operator and reviewer confirmation, approved redacted `instanceId`, runtime route and allowlist existence proof without values, private-only `/instances` access or equivalent, and proof that no public/Caddy/DNS route exists.

#### Scenario: Pairing gates authorize one attempt

- GIVEN all local and private runtime gates pass
- WHEN operator and reviewer confirm the approved instance
- THEN exactly one private pairing attempt MAY run
- AND the approved `instanceId`, route, and allowlist evidence MUST be redacted

#### Scenario: Public access blocks pairing

- GIVEN `/instances` or pairing requires a public route, Caddy route, DNS route, host port, or leaked secret URL
- WHEN the attempt is evaluated
- THEN T47 MUST close NO-GO before requesting pairing material

### Requirement: QR And Pairing Evidence Handling

T47 MUST NOT persist or print a full QR/pairing value. If scanning is required, execution MUST stop and record exact sanitized state. If pairing completes, final state MUST be recorded with sanitized metadata only.

#### Scenario: Scan-required stop

- GIVEN the private attempt reaches a QR/scan-required state
- WHEN operator scan is needed
- THEN execution MUST stop
- AND evidence MUST omit the full QR, phone number, token, route, allowlist, and credentials

#### Scenario: Completed pairing records safe state

- GIVEN pairing completes during the single approved attempt
- WHEN closeout is recorded
- THEN final status MUST be sanitized
- AND no real messages MUST be sent
