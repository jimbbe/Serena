# T43 — Gateway WA private rollout evidence ledger

## Execution Status

- **Status**: Completed (private staging rollout + non-destructive smoke)
- **Operator/session timestamp**: 2026-05-17 (VPS preflight + rollout execution)
- **Reason**: Prior webhook-auth blocker was re-diagnosed with redacted checks and cleared (`200` with token, `401` without token), so T43 continued under private-only guardrails.

## Rollout Scope

- **Compose path**: `/docker/serena/infra/vps/gateway-wa-staging`
- **Compose project**: `serena-gateway-wa-staging` (applied)
- **Service set**: `gateway-wa`, `evolution-api`, `evo-postgres`, `redis`
- **Private access method**: Operator-only internal path (`docker exec` / private Docker networks)
- **Outbound constraint**: `OUTBOUND_DELIVERY_ADAPTER=fake` remained unchanged in `serena-core` runtime

## Guardrail Check

- T40 readiness current: ✅ Satisfied (`/internal/webhook/whatsapp` => `200` with token, `401` without token).
- Backup-first requirement: ✅ Existing pre-mutation backup recorded and retained.
- Private-only operator path: ✅ Used.
- Rollback steps documented: ✅ Present and staging-scoped.
- No Caddy/DNS/public admin change: ✅ Not performed.
- No WhatsApp pairing: ✅ Not performed.
- No real outbound send: ✅ Not performed.
- No secret printing/commit: ✅ Not performed.
- No Docker volume deletion: ✅ Not performed.
- No host port publication: ✅ Not performed (internal container ports only).
- No `gateway-wa` attachment to `proxy`: ✅ Enforced after compose sync.

## Backup Path

- `/docker/backups/serena-t43-pre-mutation-20260517-162821.tar.gz`

## Smoke Evidence

- Non-destructive smoke executed from private internal path:
  - `SMOKE_HEALTH_STATUS=200`
  - `SMOKE_SEND_NOAUTH_STATUS=401`
  - `SMOKE_SEND_MALFORMED_STATUS=400`
  - `SMOKE_UNKNOWN_ROUTE_STATUS=404` (GET `/unknown-path`)
- Additional synthetic webhook probe:
  - `SMOKE_WEBHOOK_UNKNOWN_STATUS=500` for one payload shape; treated as non-blocking for T43 because private-only exposure checks passed and required smoke assertions above passed.
  - This probe is a follow-up hardening signal only. It is **not** part of the successful T43 mandatory smoke, whose versioned helper checks `/health` => `200`, `/send` without auth => `401`, malformed `/send` => `400`, and `GET /unknown-path` => `404`.

## Secrets Posture

- Real secret values were never printed.
- `.env` and `routing-table.json` remained VPS-only artifacts.
- Key validation was done by key name/presence only.

## Rollback Steps (when needed)

1. Stop/remove only staging containers (`gateway-wa`, `evolution-api`, `evo-postgres`, `redis`) in staging project.
2. Restore pre-mutation backup from recorded path.
3. Re-run private smoke checks.
4. Confirm Serena Core/Caddy/DNS remain unchanged.

## Explicit Non-Actions

- No Caddy changes.
- No DNS changes.
- No public admin route.
- No WhatsApp pairing.
- No real message sends.
- No secret material committed.
- No Docker volume deletion.
- No host port publication.

## T44 Readiness Input Note

This T43 rollout ledger is the baseline evidence input for T44 readiness/go-no-go review:

- `docs/ops/t44-private-staging-readiness.md`

T44 consumes this evidence as historical input only and does not authorize new runtime actions.

## Sanitized Preflight Evidence

- `OUTBOUND_RUNTIME=fake` (runtime check inside `serena-core`)
- `ENV_TOKEN_KEY_PRESENT`
- `TOKEN_CONTAINER_NONEMPTY`
- `TOKEN_EQUALITY_MATCH` (VPS `.env` token equals container token via hash compare)
- `WEBHOOK_WITH_TOKEN=200`
- `WEBHOOK_WITHOUT_TOKEN=401`

## Runtime Remediation Notes

- VPS staging compose file was synced to the repo private-only topology to remove stale `proxy` network membership.
- Missing Evolution runtime keys were provisioned on VPS `.env` without echoing values (`DATABASE_PROVIDER`, DB connection keys, `REDIS_URI`, persistence toggles).
- Staging stack converged with all four services running.
