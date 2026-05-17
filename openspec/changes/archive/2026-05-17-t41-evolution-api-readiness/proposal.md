# Proposal: T41 — Evolution API readiness

## Intent

Prepare Serena for **private VPS staging** of Evolution API without breaking boundaries: Evolution runs in its own container, `gateway-wa` is the only adapter allowed to talk to it, and Serena Core stays isolated from provider details.

## Scope

### In Scope
- Tighten repo-owned VPS staging templates for a private `gateway-wa` + Evolution stack.
- Define an **operator-only** management path for WhatsApp numbers and selected config.
- Update env examples, routing examples, smoke scripts, runbooks, and readiness docs.

### Out of Scope
- Real WhatsApp pairing or real outbound sending.
- Public admin exposure, public Caddy routes, or live deploy.
- Durable instance persistence / startup rehydration.

## Capabilities

### New Capabilities
- `gateway-private-staging-ops`: private staging topology, operator access path, smoke/rollback, and repo-safe runtime templates for VPS readiness.

### Modified Capabilities
- `gateway-wa`: clarify that Serena Core never calls Evolution directly; `gateway-wa` remains the only provider adapter.
- `gateway-instance-management`: constrain number/config management to operator-only private access in this phase.

## Approach

Keep the existing private topology and formalize it: `evolution-api`, `evo-postgres`, and `redis` stay on a private Docker network; `gateway-wa` bridges private Evolution traffic to Serena internal consumers; management uses existing `/instances*` endpoints only through operator-controlled access (for example SSH tunnel or internal Docker reachability), never a public admin surface.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/t41-evolution-api-readiness/proposal.md` | New | Proposal artifact for T41 |
| `infra/vps/gateway-wa-staging/` | Modified | Compose/env/routing templates for private staging |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modified | Operator-only staging flow, smoke, rollback |
| `docs/ops/t40-vps-core-readiness.md` | Modified | Handoff/readiness alignment for T41 |
| `scripts/smoke/` | Modified | Non-destructive private staging smoke helpers |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| In-memory instance tracking diverges after restart | Med | Document as explicit phase limit; defer rehydration |
| Operator access path is misused as public admin | Low | Runbook MUST forbid public exposure |
| Static env/JSON config becomes brittle | Med | Keep scope staging-only and document limits |

## Rollback Plan

Revert repo templates/docs only. If later used operationally, stop and remove only `gateway-wa`/Evolution staging containers, keep `serena-core` untouched, and remove any staging-only routing/config files.

## Dependencies

- T37 staging templates and smoke baseline
- T40 core webhook readiness on VPS

## Success Criteria

- [ ] Proposal defines private topology and adapter boundaries unambiguously.
- [ ] Proposal defines an operator-only management path with no public admin exposure.
- [ ] Proposal limits T41 to repo/docs/readiness artifacts only, with no secrets.
