# Proposal: T45 Controlled Pairing Readiness

## Intent

T44 approved **planning only**. T45 exists to decide **GO/NO-GO for a future T46 controlled pairing rehearsal** without authorizing any runtime mutation, pairing, or real delivery now.

## Scope

### In Scope
- Define the repo-only readiness gate, approvers, abort/rollback ownership, and evidence expectations for T46.
- Document the private runtime-config contract for the first allowlisted WhatsApp numbers/instance mapping.
- Record bounded risk acceptance for deferred HMAC and in-memory instance state.

### Out of Scope
- Pairing, QR execution, real sends, public/admin exposure, host ports.
- Caddy/DNS/VPS/Docker mutation, secret changes, durable state rollout, or HMAC implementation.

## Capabilities

### New Capabilities
- `controlled-pairing-readiness`: repo-only readiness gate that decides whether T46 may run a controlled private pairing rehearsal.

### Modified Capabilities
- `gateway-private-staging-readiness`: clarify that post-T44 planning becomes a T45 GO/NO-GO gate only, still with no runtime mutation.
- `gateway-instance-management`: document private allowlist ownership and restart abort/revalidate rules for controlled rehearsal.

## Approach

Add a small artifact set that closes operational decisions before live rehearsal: private allowlist in runtime config only, QR pairing deferred to T46, required evidence/logging fields, and explicit non-actions. Accept deferred HMAC only for personal-use/private-staging assumptions. Accept in-memory instance state only for controlled rehearsal, with abort/revalidate after restart.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/ops/` | Modified | Add T45 readiness gate / operator handoff docs |
| `docs/project-status.md` | Modified | Sync T45 meaning and remaining blocks |
| `docs/open-questions.md` | Modified | Close or narrow T45 planning questions |
| `openspec/specs/gateway-private-staging-readiness/spec.md` | Modified | Add T45 gate behavior |
| `openspec/specs/gateway-instance-management/spec.md` | Modified | Add allowlist/restart acceptance rules |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| T45 is misread as pairing approval | Med | State T46 is the first execution task |
| Deferred HMAC weakens trust posture | Med | Keep gateway private, auto-send blocked, risk acceptance explicit |
| Restart loses local state | High | Treat restart as abort/revalidate condition |

## Rollback Plan

Revert T45 documents/spec deltas and restore the prior T44-only boundary; no runtime rollback is needed because T45 performs no runtime mutation.

## Dependencies

- T44 readiness artifacts and guardrails remain the baseline.
- User constraint: reach first real-world tests in no more than 4 tasks (T45-T48 runway).

## Success Criteria

- [ ] Proposal preserves **no runtime mutation** in T45.
- [ ] GO/NO-GO criteria for T46 controlled pairing are explicit and reviewable.
- [ ] Private allowlist, evidence fields, HMAC deferral, and restart risk acceptance are documented.
- [ ] Non-goals stay explicit: no pairing, no real sends, no public/admin exposure, no VPS/Docker/Caddy/DNS mutation.
