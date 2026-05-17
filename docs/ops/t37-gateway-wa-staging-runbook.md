# T37/T41 — Gateway WA private staging runbook (repository-only)

## Scope

This runbook defines **future operator-approved** staging steps.
T41 keeps this as **operator-only** private staging readiness: no live deploy from this task, no Caddy mutation, no public admin exposure, no real pairing, and no real send.

## Files

- `infra/vps/gateway-wa-staging/docker-compose.yml`
- `infra/vps/gateway-wa-staging/.env.example`
- `infra/vps/gateway-wa-staging/routing-table.example.json`
- `scripts/smoke/gateway-wa-staging-smoke.ts`

## Setup (before any approved staging run)

1. Copy env template: `cp .env.example .env`
2. Copy routing table template: `cp routing-table.example.json routing-table.json`

`routing-table.json` may contain non-secret staging routing data. However, if future updates add internal URLs or sensitive topology details, the real/generated file must not be committed. The repository ignores `infra/vps/gateway-wa-staging/routing-table.json` by default.

## Safety constraints

- Caddy remains the single edge on 80/443.
- No direct public route to `evolution-api`.
- No public admin route to `gateway-wa` (`/instances*`, `/send`, `/webhook/evolution`).
- Placeholder secrets only in repo.
- Rollback must not touch `serena-core`.
- `gateway-wa` must join the external `serena-internal` network before it can route to `http://serena-core:3000/internal/webhook/whatsapp`.
- Do not deploy `gateway-wa` until `serena-core` has been updated from `main`, has `SERENA_INTERNAL_TOKEN` configured only on the VPS, and `POST /internal/webhook/whatsapp` has been verified.

## Suggested smoke checks (when explicitly approved)

1. `GET /health` returns 200.
2. Missing API key on protected route returns 401/403.
3. Unknown `instanceId` returns `routing_not_configured`.
4. `/send` auth + payload-validation path is non-destructively exercised (no real delivery).
5. Known `instanceId` routes to Serena internal webhook (**manual/optional** in staging unless an internal stub receiver is available).
6. Logs contain no secrets.

Compose does not publish gateway port `3001` to the host by default. Do not assume `GATEWAY_BASE_URL=http://localhost:3001` is reachable unless an approved temporary exposure exists.
Preferred operator path is private reachability (for example SSH tunnel, a private Docker-network helper container, or another explicitly approved internal path).

### Smoke helper coverage and explicit boundaries

- Automated by `scripts/smoke/gateway-wa-staging-smoke.ts`: checks 1, 2, 3, and 4.
- Manual/optional: check 5 requires an operator-approved internal receiver/stub and remains outside default smoke.
- Smoke execution location must have network reachability to `gateway-wa` (for example: a container on the correct Docker network, a temporary approved exposure, or a future approved Caddy route).
- First-consumer routing reference is explicitly covered in tests: `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` validates `serena-main` routing + `X-Serena-Internal-Token` header forwarding.

## Rollback (approved operations only)

- Stop/remove only staging gateway/evolution containers.
- Keep Serena core/postgres untouched.
- Revert only staging route additions (if any future task adds them).
