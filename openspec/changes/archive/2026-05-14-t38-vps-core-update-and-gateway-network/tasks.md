# Tasks: T38 — VPS Core Update and Gateway Network

## Phase 1: VPS core + staging network templates

- [x] 1.1 Update `infra/vps/docker-compose.yml` so `serena-core` requires `SERENA_INTERNAL_TOKEN` from VPS runtime env and fails fast if missing.
- [x] 1.2 Update `infra/vps/gateway-wa-staging/docker-compose.yml` so `gateway-wa` joins external `serena-internal` without exposing ports or adding Caddy changes.

## Phase 2: Operator runbooks

- [x] 2.1 Update `docs/ops/t37-gateway-wa-staging-runbook.md` with the T38 precondition: core refresh and authenticated webhook verification must be done first.
- [x] 2.2 Add `docs/ops/t38-vps-core-update-runbook.md` with operator steps for token check/add, `/docker/serena` update, core-only rebuild/start, `GET /health` and authenticated webhook verification, and rollback.

## Phase 3: Validation + release readiness

- [x] 3.1 Validate compose/static config paths for the changed templates and runbook commands; confirm secrets stay out of Git/logs.
- [x] 3.2 Run repository validation (`npm run check`) and any repo-safe documentation checks needed for the updated runbooks.
- [x] 3.3 Prepare the task branch PR with a concise summary, validation results, rollback note, and explicit out-of-scope reminder for gateway/Evolution/Caddy.
