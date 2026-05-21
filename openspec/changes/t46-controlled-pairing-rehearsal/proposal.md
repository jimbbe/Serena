# Proposal: T46 Controlled Pairing Rehearsal

## Intent

Authorize T46 only as a conditionally safe, private, operator-led pairing rehearsal. The goal is to prove the existing pairing path can be exercised once without broadening T44/T45 boundaries or enabling real delivery.

## Scope

### In Scope
- Add a canonical T46 ops ledger with sanitized runtime evidence, GO/NO-GO wording, and abort logging.
- Define machine-checkable gates for activation, fail-closed aborts, and post-run closeout.
- Allow one bounded runtime pairing rehearsal only if all live gates pass and `OUTBOUND_DELIVERY_ADAPTER=fake` is reconfirmed before and after.

### Out of Scope
- Real outbound sends, sustained/repeated use, or production approval.
- Public/admin exposure, host ports, Caddy/DNS/runtime infra expansion, PostgreSQL, HMAC, or durable-state rollout.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `controlled-pairing-readiness`: extend T45 planning gates into T46 execution gates, evidence ledger rules, and closeout decision semantics.
- `gateway-instance-management`: constrain rehearsal pairing to one approved runtime-owned instance/number path, with restart invalidation and no committed real values.
- `outbound-delivery-adapter`: preserve `fake` as a mandatory safety invariant for T46.

## Approach

Use a bounded hybrid change: repo artifacts first, runtime second. T46 remains **NO-GO by default**. It becomes **GO** only when operator/reviewer presence, private path, route/allowlist revalidation, evidence template readiness, restart-free status, and fake-outbound confirmation are all recorded live. Any missed gate, restart, redaction failure, or scope expansion aborts immediately.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/ops/t46-controlled-pairing-rehearsal.md` | New | Canonical ledger, gates, evidence, non-actions |
| `scripts/tests/` | Modified | Validator for T46 guardrails/evidence fields |
| `openspec/specs/controlled-pairing-readiness/spec.md` | Modified | T46 execution semantics |
| `openspec/specs/gateway-instance-management/spec.md` | Modified | Runtime-owned pairing/restart rules |
| `openspec/specs/outbound-delivery-adapter/spec.md` | Modified | Fake-adapter invariant |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Restart invalidates local state | Med | Abort and revalidate |
| Runtime config drift | Med | Recheck route/allowlist immediately before run |
| Scope creep into real use | High | Explicit non-actions + validator + reviewer sign-off |

## Rollback Plan

Revert T46 repo artifacts and validator changes. If runtime rehearsal starts, stop at first failed gate, record sanitized abort evidence, and return to T45-ready private staging without enabling sends or exposure.

## Dependencies

- T45 ledger remains the upstream authorization baseline.
- Private operator-held runtime config and reviewer/operator availability.

## Success Criteria

- [ ] T46 artifacts define explicit GO/NO-GO gates, evidence fields, and abort triggers without secrets.
- [ ] Runtime execution is authorized only as one gated rehearsal and otherwise fails closed.
- [ ] `OUTBOUND_DELIVERY_ADAPTER=fake` remains mandatory and real sends stay unauthorized.
