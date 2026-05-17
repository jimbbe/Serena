# Tasks: T43 Gateway WA Private Rollout

## Phase 1: Repo + evidence prep

- [x] 1.1 Preflight branch/state: confirm `feat/t43-gateway-wa-private-rollout`, clean worktree, and read T40/T41/T42 evidence before any VPS step.
- [x] 1.2 Review `infra/vps/gateway-wa-staging/docker-compose.yml` and `.env.example`; keep `proxy` out unless justified, keep no host `ports:`, and preserve private-only networking.
- [x] 1.3 Update `docs/ops/t37-gateway-wa-staging-runbook.md` and `docs/ops/t42-gateway-wa-private-staging-evidence.md` with T43 backup-first rollout, private smoke, rollback, and redaction rules.
- [x] 1.4 Update `docs/project-status.md` (and `docs/open-questions.md` only if T43 leaves a new blocker) with the rollout status / deferred items.

## Phase 2: VPS preflight + backup

- [x] 2.1 On the VPS, verify T40 core readiness evidence is current: `/internal/webhook/whatsapp` works with `SERENA_INTERNAL_TOKEN`, and stop if stale.
- [x] 2.2 Record the staging scope on the VPS: compose path, project name, service list, private access method, and confirm `OUTBOUND_DELIVERY_ADAPTER=fake` stays unchanged.
- [x] 2.3 Create a restorable pre-mutation backup of the staging directory/config and note the absolute backup path in the evidence doc.

## Phase 3: Private rollout on VPS

- [x] 3.1 Provision/update `.env` and `routing-table.json` on the VPS only, using redacted commands and no secret echo; verify key presence with placeholders only.
- [x] 3.2 Apply the private compose stack with `docker compose config`, then `up -d`/recreate/start for `gateway-wa`, `evolution-api`, `evo-postgres`, and `redis` on private networks only.
- [x] 3.3 Verify `docker compose ps`, networks, and that nothing publishes host ports or requires Caddy/DNS/public exposure.

## Phase 4: Non-destructive smoke + rollback proof

- [x] 4.1 Run the private smoke from an approved internal path: `/health`, auth rejection, unknown route, and malformed `/send`; capture sanitized output only.
- [x] 4.2 If smoke fails, execute the staging-scoped rollback only: stop/remove T43 containers, keep volumes by default, and confirm Core/Caddy/DNS remain untouched.
- [x] 4.3 Finalize `docs/ops/t42-gateway-wa-private-staging-evidence.md` with backup path, rollout scope, smoke results, rollback commands, and explicit non-actions.

## Phase 5: Validation + PR readiness

- [x] 5.1 Run `npm run check` after repo-side edits and before PR handoff.
- [x] 5.2 Review the diff, confirm no secret leakage or public exposure changes, and prepare the PR/report with files inspected, touched, commands, validation, risks, and next step.
