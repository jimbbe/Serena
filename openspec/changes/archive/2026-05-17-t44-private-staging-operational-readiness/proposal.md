# Proposal: T44 Private Staging Operational Readiness

## Intent

Turn the already-deployed private `gateway-wa` staging into a repo-only operational milestone: a reviewable go/no-go gate, explicit operator handoff, and clear boundaries for what private staging is ready for versus what remains blocked.

## Scope

### In Scope
- Define private-staging readiness criteria, go/no-go decision points, and operator handoff ownership.
- Add repo-side validation for consistency across topology, runbook, evidence, and guardrail artifacts.
- Make blocked next steps explicit: pairing, public/admin exposure, real sends, HMAC, and durable state remain follow-up milestones.

### Out of Scope
- Any VPS/Caddy/DNS/Docker/runtime mutation, pairing, real sends, public/admin exposure, or secrets handling changes.
- Durable state implementation, startup rehydration, HMAC implementation, or tiny code-only hardening presented as T44.

## Capabilities

### New Capabilities
- `gateway-private-staging-readiness`: repo-only readiness gate, operator handoff, go/no-go record, and machine-checkable artifact traceability for private staging.

### Modified Capabilities
- `gateway-private-staging-ops`: extend rollout-proof docs/spec alignment so T43 evidence becomes an input to T44 readiness decisions without broadening runtime behavior.

## Approach

Use the T43 private rollout evidence as baseline truth. Add a dedicated readiness capability plus targeted doc/spec/script updates that codify gates, non-actions, rollback ownership, and blocked follow-ups. Validation stays repo-only and MUST fail closed on drift or accidental scope expansion.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/gateway-private-staging-readiness/` | New | Readiness, handoff, go/no-go contract |
| `openspec/specs/gateway-private-staging-ops/spec.md` | Modified | T43 rollout evidence as readiness prerequisite |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modified | Handoff checklist, gate ownership, non-actions |
| `docs/ops/t42-gateway-wa-private-staging-evidence.md` | Modified | Readiness decision record inputs |
| `scripts/tests/` or `package.json` | Modified | Repo-side validation wiring |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope drifts into live ops or runtime changes | Med | Encode explicit exclusions and fail-closed validation |
| Milestone is reduced to a tiny script/doc tweak | Med | Require go/no-go + handoff + validation as one package |
| Readiness is confused with live onboarding readiness | High | State blocked follow-ups and non-actions in every artifact |

## Rollback Plan

Revert T44 artifact changes only: remove the readiness spec/deltas, restore prior docs/scripts, and keep staging runtime untouched.

## Dependencies

- Existing T43 rollout evidence and private-smoke artifacts remain available and trusted.
- Follow-up milestones for durable state/rehydration and HMAC stay deferred and explicitly tracked.

## Success Criteria

- [ ] T44 is clearly defined as a repo-only operational readiness milestone, not a hardening fix.
- [ ] Proposal/spec inputs explicitly forbid runtime mutation, pairing, real sends, public/admin exposure, secrets, durable state, and HMAC implementation.
- [ ] Repo artifacts define operator handoff, go/no-go gates, rollback ownership, and blocked next steps.
- [ ] Machine-checkable validation is planned for readiness artifact consistency.
