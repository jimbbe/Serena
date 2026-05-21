# Proposal: T47 Controlled Pairing Execution

## Intent

Redefine T47 as one guarded, private WhatsApp pairing execution on VPS. The change must either produce a real pairing attempt with sanitized evidence or a concrete operational NO-GO with sanitized blocker evidence.

## Scope

### In Scope
- Add the canonical T47 execution ledger, gates, evidence rules, and closeout path.
- Authorize one operator-only VPS pairing attempt only after private-access, topology, routing, allowlist/ownership, restart-free, and fake-outbound gates pass.
- Keep `OUTBOUND_DELIVERY_ADAPTER=fake` before, during, and after the attempt.

### Out of Scope
- Real outbound sends, public/admin exposure, host ports, Caddy/DNS changes, PostgreSQL, HMAC, durable state, or Hermes/necrologia-bot changes.
- Secret printing/commits, full QR output, real phone numbers, routing details, allowlist contents, tokens, or message bodies.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `controlled-pairing-readiness`: extend T46 deferred rehearsal into T47 execute-or-no-go semantics with sanitized evidence.
- `gateway-instance-management`: constrain pairing to one private operator path with restart invalidation and redacted runtime proof.
- `outbound-delivery-adapter`: preserve `fake` as a hard runtime invariant.
- `gateway-private-staging-ops`: preserve private-only VPS execution boundaries and non-destructive rollback.

## Approach

Prepare repo artifacts first, then execute privately on VPS only if every live gate passes. If any gate fails, access is unavailable, or evidence cannot be safely redacted, stop immediately and record **NO-GO**. Valid end states are: **A)** pairing attempted/partially executed with sanitized evidence, or **B)** concrete operational **NO-GO** with sanitized evidence.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/ops/t47-controlled-pairing-execution-evidence.md` | New | Canonical T47 ledger and evidence |
| `scripts/tests/` | Modified | Guardrail validator for T47 |
| `openspec/specs/controlled-pairing-readiness/spec.md` | Modified | T47 execution outcomes |
| `openspec/specs/gateway-instance-management/spec.md` | Modified | Private pairing/runtime rules |
| `openspec/specs/outbound-delivery-adapter/spec.md` | Modified | Fake-outbound invariant |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong task boundary | Med | T47 branch/folder only |
| Restart/state drift | Med | Abort and revalidate |
| Sensitive evidence leak | High | Redaction-first evidence rules |

## Rollback Plan

Revert T47 repo artifacts. If runtime starts, abort on first failed gate, preserve volumes, keep outbound fake, and return staging to pre-attempt private state without public exposure.

## Dependencies

- T45/T46 evidence baseline
- Private VPS operator access and reviewer approval

## Success Criteria

- [ ] T47 defines explicit safety gates, validation, and branch/PR boundary for one task / one PR.
- [ ] Apply can end only as sanitized execution evidence or sanitized operational NO-GO.
- [ ] No secrets, full QR, real sends, public exposure, volume deletion, or fake-outbound drift occur.
