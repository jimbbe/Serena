# Delta for Gateway Private Staging Ops

## ADDED Requirements

### Requirement: T43 Evidence Feeds T44 Readiness

T44 MUST consume T43 private rollout evidence as readiness input only. It MUST NOT broaden T43 runtime behavior, mutate VPS/Caddy/DNS/Docker, approve pairing, expose public/admin routes, enable real sends, print or commit secrets, implement HMAC, or implement durable state.

#### Scenario: Evidence becomes readiness input

- GIVEN T43 evidence records private rollout, smoke results, rollback notes, and non-actions
- WHEN T44 readiness is prepared
- THEN those records MUST be cited as baseline evidence for the go/no-go package
- AND no new runtime action is implied by the citation

#### Scenario: Runtime mutation fails closed

- GIVEN a T44 artifact or validation path requires VPS, Caddy, DNS, Docker runtime mutation, pairing, public/admin exposure, real sends, or secret handling changes
- WHEN the T44 package is reviewed or validated
- THEN the change MUST be rejected as out of scope

#### Scenario: Follow-ups remain blocked

- GIVEN HMAC authenticity, durable state, startup rehydration, pairing, real sends, or public/admin exposure are needed for future milestones
- WHEN T44 readiness is marked GO for private staging
- THEN those items MUST remain documented as blocked follow-ups, not approved work
