# Proposal: T42 Gateway WA Private Staging

## Intent

Turn T41 readiness into a SAFE first private VPS staging rollout for `gateway-wa` + Evolution API, with repo hardening first. The goal is to prove private deployability and safe operator smoke coverage without exposing admin surfaces, changing DNS, pairing WhatsApp, sending real messages, or committing secrets.

## Scope

### In Scope
- Remove raw `apiKey` exposure from `POST /instances` responses and align docs/tests/specs.
- Tighten private staging artifacts/runbook for backup-first deploy, operator-only access, rollback evidence, and no public exposure.
- Keep smoke validation non-destructive: health, auth rejection, unknown route, malformed `/send`, and private network reachability checks.
- Allow VPS execution only as an approved private rollout step backed by backup + rollback and zero Caddy/DNS/public admin changes.

### Out of Scope
- Public Caddy/admin routes, DNS mutations, or host-port publication.
- WhatsApp pairing, QR onboarding, real outbound delivery, or live operator sends.
- Durable instance rehydration/persistence beyond current in-memory limitations.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gateway-private-staging-ops`: expand from repo-only readiness to backup-first private staging rollout rules and non-destructive smoke boundaries.
- `gateway-instance-management`: change `POST /instances` success contract so instance creation no longer returns raw `apiKey`.

## Approach

Apply exploration approach 2: harden the repo before touching VPS, then define the smallest private rollout path that keeps `gateway-wa`, Evolution API, and Serena Core on private Docker networking only. Operator access stays private (SSH tunnel/helper container or equivalent approved path). Rollback is limited to staging containers and restored backups; Serena Core/Caddy/DNS remain untouched.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/gateway-wa/src/infrastructure/instances/handlers.ts` | Modified | Remove `apiKey` from create-instance response |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modified | Add backup/rollback/private-access execution rules |
| `scripts/smoke/gateway-wa-staging-smoke.ts` | Modified | Keep smoke non-destructive and private-only |
| `infra/vps/gateway-wa-staging/*` | Modified | Preserve no-public topology and rollout contract |
| `openspec/specs/gateway-instance-management/spec.md` | Modified | Update response contract |
| `openspec/specs/gateway-private-staging-ops/spec.md` | Modified | Update rollout/smoke expectations |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Secret leakage from admin response | Med | Remove `apiKey` from API/docs/tests |
| Staging exposure drifts public | Med | Forbid Caddy/DNS/host ports in scope |
| Restart loses instance state | High | Document limit; exclude persistence from T42 |

## Rollback Plan

Revert repo changes, restore VPS staging backup taken before rollout, stop/remove only `gateway-wa`/Evolution staging containers, and verify Serena Core remains unchanged. If any step requires public exposure or weak rollback evidence, abort rollout.

## Dependencies

- T41 private readiness artifacts already present.
- Serena Core VPS webhook readiness from T40.
- Operator-approved backup location and private access path.

## Success Criteria

- [ ] `POST /instances` no longer returns raw `apiKey` anywhere in code/specs/tests.
- [ ] Private staging runbook requires backup, rollback, and zero public exposure.
- [ ] Smoke scope remains non-destructive and private-network only.
- [ ] T42 does not introduce DNS, Caddy admin routes, pairing, real sends, or committed secrets.
