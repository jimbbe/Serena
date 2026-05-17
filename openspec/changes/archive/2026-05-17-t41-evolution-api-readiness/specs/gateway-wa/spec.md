# Delta for gateway-wa

## ADDED Requirements

### Requirement: Private Evolution Adapter Boundary

In production staging, `gateway-wa` MUST be the only Serena component that talks to Evolution API. Serena Core MUST NOT call Evolution API directly for inbound, outbound, instance, number, or config operations.

#### Scenario: gateway-wa connects to Evolution privately

- GIVEN staging runtime configuration exists
- WHEN `gateway-wa` is configured for Evolution
- THEN `EVOLUTION_API_URL` targets private Docker DNS/URL
- AND no public Evolution URL is required

#### Scenario: Core never calls Evolution directly

- GIVEN inbound or outbound WhatsApp traffic is processed
- WHEN Serena Core participates
- THEN Core only uses its internal webhook/outbound gateway boundary
- AND Evolution-specific calls remain inside `gateway-wa`

#### Scenario: T41 forbids real delivery

- GIVEN T41 readiness artifacts are used
- WHEN validation runs
- THEN no real WhatsApp message is sent
- AND no provider-specific send path is exercised against a real number
