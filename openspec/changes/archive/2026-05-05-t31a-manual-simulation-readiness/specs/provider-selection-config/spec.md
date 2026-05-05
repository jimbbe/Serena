# Delta for provider-selection-config

## ADDED Requirements

### Requirement: Safe Local Provider Setup Examples

The project MUST provide a safe local env example for Simulation API manual readiness that includes placeholder-only values for both `mock` and `openai-compatible` provider selection. The example MUST enable simulation endpoints explicitly, MUST avoid real secrets, and MUST explain that provider setup changes only local configuration, not runtime business behavior. The documented manual flow MUST stay limited to Simulation API readiness.

#### Scenario: OpenAI-compatible setup stays safe

- GIVEN a developer wants to test with an OpenAI-compatible provider
- WHEN they copy the documented env example
- THEN every secret-bearing field is still a placeholder and the guide does not imply real provider credentials are committed

#### Scenario: Scope stays limited to manual readiness

- GIVEN the provider-selection documentation is updated
- WHEN a developer reviews the manual setup notes
- THEN the notes exclude real WhatsApp, PostgreSQL, dependency additions, prompt/policy edits, and nonessential business-logic work
