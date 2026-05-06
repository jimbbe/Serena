# Delta for inbound-simulation-endpoint

## ADDED Requirements

### Requirement: Manual Inbound Simulation Readiness Guide

The project documentation MUST define one canonical local startup path for `POST /dev/simulate/inbound-message` manual testing, using the existing core server and either the `mock` or `openai-compatible` provider. The guide MUST include placeholder-only env values, copy/paste requests for conversation, mediation, ambiguity, risk, unknown user, and continuity via debug-only `conversationId`, and MUST state the response fields a developer should inspect. The guide MUST NOT require console tooling, batch runners, real WhatsApp/Evolution, PostgreSQL, dependency additions, prompt/policy changes, or unrelated business-logic changes.

#### Scenario: Mock path is manually testable

- GIVEN a developer follows the documented startup command and placeholder-only mock env example
- WHEN they POST a conversation or mediation example to `/dev/simulate/inbound-message`
- THEN the docs let them exercise the existing endpoint without extra tooling or real integrations

#### Scenario: Continuity remains debug-only

- GIVEN the docs show `conversationId` in a manual request example
- WHEN the developer uses it to continue a local simulation thread
- THEN the guide labels it as debug-only continuity support and not a production contract change
