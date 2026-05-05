# Delta for scenario-simulation

## ADDED Requirements

### Requirement: Manual Scenario Simulation Readiness Guide

The project documentation MUST define a copy/paste manual flow for `POST /dev/simulate/scenario` using the same canonical local startup path as inbound simulation. The flow MUST cover ambiguity, risk, unknown user, and continuity cases with explicit multi-step examples, and MUST document which response fields and summary counters to inspect. The guide MUST NOT introduce a runner, console workflow, real WhatsApp/Evolution, PostgreSQL, dependency additions, prompt/policy changes, or unrelated business-logic changes.

#### Scenario: Multi-step ambiguity and risk are documented

- GIVEN a developer needs to validate ambiguous or risky behavior manually
- WHEN they read the scenario simulation guide
- THEN they find copy/paste multi-step examples and the expected fields to inspect in `steps[]` and `summary`
