# Proposal: T38 Fix Webhook Probe Contract

## Intent

Fix T38 repo artifact drift so the VPS core refresh runbook and `validate:t38` verify the REAL Serena Core webhook contract already implemented in code and main specs.

## Scope

### In Scope
- Update `docs/ops/t38-vps-core-update-runbook.md` to probe `/internal/webhook/whatsapp` with `senderWhatsAppId` and `receivedAt`.
- Update the same runbook to expect `routedTo: "serena-core"` on authenticated success.
- Strengthen `scripts/tests/t38-readiness-validation.test.ts` so it fails if those exact payload/response markers drift again.

### Out of Scope
- Runtime handler behavior changes in `apps/core` unless new evidence contradicts current code/tests/specs.
- VPS execution, deploys, Caddy, host ports, WhatsApp pairing, secrets, or archived-history rewrites.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None — main specs already match the current webhook contract; this change aligns repo artifacts and validation with that source of truth.

## Approach

Treat `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` and `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` as contract authority. Update only the stale T38 runbook and make `validate:t38` assert the concrete probe body fields plus the `routedTo: "serena-core"` success marker, not just auth presence.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/ops/t38-vps-core-update-runbook.md` | Modified | Replace legacy probe fields/expected response with the real webhook contract |
| `scripts/tests/t38-readiness-validation.test.ts` | Modified | Add exact contract assertions so drift fails repo validation |
| `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` | Inspected | Source of truth; no change planned |
| `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` | Inspected | Executable contract evidence; no change planned |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Validation still misses a drift variant | Low | Assert exact field names and expected routedTo wording |
| Proposal scope expands into runtime compatibility work | Low | Keep runtime unchanged unless hard evidence appears |

## Rollback Plan

Revert the runbook and validation test changes in one commit. No data migration, infra rollback, or runtime restore should be needed.

## Dependencies

- Existing webhook contract evidence in core handler, HTTP tests, and main OpenSpec specs.

## Success Criteria

- [ ] T38 runbook authenticated probe uses `senderWhatsAppId` and `receivedAt` and expects `routedTo: "serena-core"`.
- [ ] `npm run validate:t38` fails if the runbook reintroduces `from`, `timestamp`, or `routedTo: "channel-inbound"`.
- [ ] No runtime behavior changes are introduced without new contradictory evidence.
