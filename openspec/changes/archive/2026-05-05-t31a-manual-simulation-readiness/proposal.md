# Proposal: T31A — Manual Simulation Readiness

## Intent

Make Serena manually testable through the Simulation API with a safe, truthful local setup for either `mock` or `openai-compatible`, without changing product behavior.

## Scope

### In Scope
- Add one canonical local startup path that reuses the current core server and safely loads local env values.
- Sync safe env examples and startup docs for Simulation API enablement and provider selection.
- Provide copy/paste request examples for single-step and scenario simulation flows.

### Out of Scope
- Console tooling, batch runners, formal OpenCode evaluation playbooks.
- Real WhatsApp/Evolution integration, PostgreSQL, dependency additions, prompt/policy changes, or risky runtime/business-logic changes.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `inbound-simulation-endpoint`: clarify and support the canonical manual startup/testing flow for `/dev/simulate/inbound-message`.
- `scenario-simulation`: clarify and support the canonical manual startup/testing flow for `/dev/simulate/scenario`.
- `provider-selection-config`: document the safe local provider setup needed for mock vs `openai-compatible` manual testing.

## Approach

Use the existing Simulation API, env contract, and provider factory as-is. Add only thin dev-readiness plumbing: one repo-level start command or equivalent wrapper, `.env.example` updates, optional compose env passthrough if kept as a supported path, and precise docs/examples that remove the broken `npm start` guidance.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | Modified | Canonical local Simulation API start entrypoint |
| `.env.example` | Modified | Safe simulation/provider examples |
| `docker-compose.yml` | Modified | Optional env passthrough for supported manual path |
| `docs/simulation-api.md` | Modified | Correct startup flow and copy/paste requests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Docs drift from actual startup path | Med | Make one canonical command and reuse it everywhere |
| Accidental scope creep into runtime logic | Low | Keep provider/pipeline behavior unchanged |

## Rollback Plan

Revert the proposal's script/doc/env/compose edits; no data migration or domain rollback is needed because runtime behavior stays unchanged.

## Dependencies

- Existing Node 22 runtime and current Simulation API/provider wiring.

## Success Criteria

- [ ] A developer can start Serena locally for Simulation API testing from one documented command.
- [ ] `.env.example` shows a safe mock path and a safe `openai-compatible` path without secrets.
- [ ] `docs/simulation-api.md` matches real startup behavior and includes copy/paste request examples.
