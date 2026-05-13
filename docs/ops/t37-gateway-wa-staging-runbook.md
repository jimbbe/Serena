# T37 — Gateway WA staging runbook (repository-only)

## Scope

This runbook defines **future operator-approved** staging steps.
T37 does **not** deploy, mutate VPS, change Caddy, or pair real WhatsApp instances.

## Files

- `infra/vps/gateway-wa-staging/docker-compose.yml`
- `infra/vps/gateway-wa-staging/.env.example`
- `infra/vps/gateway-wa-staging/routing-table.example.json`
- `scripts/smoke/gateway-wa-staging-smoke.ts`

## Safety constraints

- Caddy remains the single edge on 80/443.
- No direct public route to `evolution-api`.
- Placeholder secrets only in repo.
- Rollback must not touch `serena-core`.

## Suggested smoke checks (when explicitly approved)

1. `GET /health` returns 200.
2. Missing API key on protected route returns 401/403.
3. Unknown `instanceId` returns `routing_not_configured`.
4. `/send` auth + payload-validation path is non-destructively exercised (no real delivery).
5. Known `instanceId` routes to Serena internal webhook (**manual/optional** in staging unless an internal stub receiver is available).
6. Logs contain no secrets.

### Smoke helper coverage and explicit boundaries

- Automated by `scripts/smoke/gateway-wa-staging-smoke.ts`: checks 1, 2, 3, and 4.
- Manual/optional: check 5 requires an operator-approved internal receiver/stub and remains outside default smoke.
- First-consumer routing reference is explicitly covered in tests: `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` validates `serena-main` routing + `X-Serena-Internal-Token` header forwarding.

## Rollback (approved operations only)

- Stop/remove only staging gateway/evolution containers.
- Keep Serena core/postgres untouched.
- Revert only staging route additions (if any future task adds them).
