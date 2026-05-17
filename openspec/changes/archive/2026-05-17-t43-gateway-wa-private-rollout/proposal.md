# Proposal: T43 Gateway WA Private Rollout

## Intent

Deploy `gateway-wa` + Evolution API on the VPS as a private, operator-only staging stack so we can prove real runtime wiring without expanding Serena product behavior or exposing new public surfaces.

## Scope

### In Scope
- Private VPS rollout from `infra/vps/gateway-wa-staging/` with `gateway-wa`, `evolution-api`, `evo-postgres`, and `redis`.
- Operator-only smoke over private Docker access, with SSH tunnel allowed only as a documented fallback.
- Evidence-first execution: backup path, rollout scope, private reachability proof, sanitized smoke results, rollback commands, and explicit non-actions.

### Out of Scope
- Caddy or DNS changes, public/admin exposure, host `ports:` publication.
- WhatsApp pairing, QR onboarding, real outbound sends, or any product-flow expansion.
- Secret printing/committing, Core feature changes, webhook contract changes, or Docker volume deletion.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gateway-private-staging-ops`: evolve from repo-only readiness into approved private VPS rollout + non-destructive validation.

## Approach

Use the existing private staging topology and keep `OUTBOUND_DELIVERY_ADAPTER=fake` throughout T43. Treat T40 Core webhook readiness as a hard precondition. Prefer smoke from inside Docker/private networks; fail closed if any check would require public exposure, pairing, or destructive cleanup.

## Constraints

- No Caddy, DNS, public admin route, host port, pairing, real sends, secret disclosure, or volume deletion.
- Smoke MUST stay private, synthetic, and operator-only.
- `gateway-wa` may call only private Evolution/Core paths; Serena Core behavior stays unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `infra/vps/gateway-wa-staging/` | Modified | Canonical rollout topology, env shape, routing contract |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modified | T43 rollout, smoke, fallback, rollback steps |
| `docs/ops/t42-gateway-wa-private-staging-evidence.md` | Modified | Live evidence ledger and explicit non-actions |
| `openspec/specs/gateway-private-staging-ops/spec.md` | Modified | Delta requirements for private rollout execution |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Operator drifts into public exposure | Med | Fail closed; private path is default |
| Restart loses instance visibility | Med | Record in evidence; avoid destructive restart loops |
| Outbound accidentally becomes live | Low | Keep adapter `fake`; forbid real send smoke |

## Rollback & Evidence Posture

Rollback targets only the staging stack: stop/remove staging containers, preserve volumes, keep Core/Caddy/DNS untouched, and restore from the recorded pre-mutation backup if needed. Evidence MUST capture backup path, `docker compose ps`, smoke timestamps, private-only access proof, sanitized outputs, rollback commands, and explicit non-actions.

## Dependencies

- T40 webhook readiness already verified on real VPS.
- Existing T37/T41/T42 templates, guardrails, and safe response contract.

## Success Criteria

- [ ] Private staging stack runs on VPS with no Caddy/DNS/host-port exposure.
- [ ] Smoke proves health, auth rejection, malformed send handling, unknown-route safety, and private-only reachability.
- [ ] Evidence and rollback materials are complete, sanitized, and staging-scoped only.
- [ ] `OUTBOUND_DELIVERY_ADAPTER` remains `fake`; no pairing or real delivery occurs.
