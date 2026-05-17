# Proposal: Gateway WA Unknown-Instance Hardening

## Intent

Prevent `POST /webhook/evolution` from returning `500` when a webhook references an unknown/unconfigured instance and the payload shape is incomplete before routing rejection. Keep valid routed flows and T43 smoke behavior unchanged.

## Scope

### In Scope
- Reorder webhook handling so routing-table mode checks `instance` and route presence before dedup/filter/normalization for unknown instances.
- Keep malformed payloads without a usable `instance` as client errors (`400 invalid_webhook_payload`).
- Add focused unit + HTTP integration regressions and sync the affected OpenSpec requirement.

### Out of Scope
- Durable instance/routing persistence or startup rehydration.
- Broad schema validation for every malformed configured-instance payload.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gateway-webhook-receiver`: unknown/unconfigured instances in routing-table mode MUST fail closed without `500`, while missing `instance` remains malformed input.

## Approach

Apply the narrow exploration recommendation: extract `instance` early, short-circuit `routing_not_configured` before payload-dependent processing when routing-table mode is active and no route exists, and preserve current processing order for known routes. Do not widen into full webhook schema redesign.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` | Modified | Early route rejection and malformed-instance guard |
| `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` | Modified | Regression for malformed unknown-instance payload |
| `apps/gateway-wa/src/tests/integration.test.ts` | Modified | HTTP non-500 regression on `/webhook/evolution` |
| `openspec/specs/gateway-webhook-receiver/spec.md` | Modified | Requirement + scenario sync |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reordering breaks valid webhook flow | Med | Preserve existing happy-path tests and add targeted regressions |
| Scope drifts into general schema hardening | Med | Limit spec/code changes to unknown-instance fail-safe behavior |

## Rollback Plan

Revert the receiver ordering change, revert the regression tests/spec delta, and rely on the pre-T44 behavior if unintended regressions appear.

## Dependencies

- Existing routing-table behavior from T37/T43.

## Success Criteria

- [ ] Unknown/unconfigured instance payloads with an `instance` field no longer produce `500` before routing rejection.
- [ ] Payloads missing `instance` still return controlled client-error behavior.
- [ ] Existing valid webhook flows and T43-safe `routing_not_configured` behavior remain intact.
