# Tasks: T42 Gateway WA Private Staging

## Phase 1: RED tests

- [x] 1.1 Update `apps/gateway-wa/src/infrastructure/instances/handlers.test.ts` to assert `POST /instances` returns only `{ name, status, qr }` and that `apiKey`, `appKey`, `adminKey`, `internalToken`, and other credential-like fields are absent.
- [x] 1.2 Update `apps/gateway-wa/src/tests/integration.test.ts` to verify the live HTTP `POST /instances` response omits credential fields under the fake Evolution flow.
- [x] 1.3 Refresh `docs/architecture/wsp-gateway-api-contract.md` examples so the create-instance contract matches the safe response shape before code changes land.

## Phase 2: Minimal gateway-wa code change

- [x] 2.1 Remove `apiKey` serialization from `createInstanceHandler` in `apps/gateway-wa/src/infrastructure/instances/handlers.ts`; keep `InstanceManager.createInstance()` and the `appKey` parameter untouched for now.
- [x] 2.2 If needed, adjust any local response typings/helpers so `POST /instances` is explicit about the safe metadata-only body.

## Phase 3: Docs, runbook, and rollout guardrails

- [x] 3.1 Update `docs/ops/t37-gateway-wa-staging-runbook.md` with a T42 section: backup-first, private-only access path, rollback steps, operator evidence, and explicit bans on pairing, sends, Caddy/DNS, and public admin exposure.
- [x] 3.2 Update `docs/project-status.md` to record T42 readiness/implementation state and the new safe instance-creation contract.
- [x] 3.3 Tighten `scripts/smoke/gateway-wa-staging-smoke.ts` and `infra/vps/gateway-wa-staging/docker-compose.yml` comments/guards so smoke stays non-destructive, private-network only, and never prints secrets.
- [x] 3.4 If live VPS execution is approved, use only the private operator path, capture pre-mutation backup + rollback evidence, and record deployment/smoke results in `docs/ops/t42-gateway-wa-private-staging-evidence.md`; stop immediately on any need for pairing, send, Caddy, DNS, or public admin.

## Phase 4: Validation

- [x] 4.1 Run `npm run -w @serena/gateway-wa test` and `npm run check`; confirm the new absence assertions pass.
- [ ] 4.2 If the private VPS rollout runs, validate backup, deploy, smoke, and rollback on the staging containers only, with no Serena Core mutation.

Notes:
- 3.4 completed as documented deferral with explicit safety reason and non-actions evidence (no live VPS mutation in this apply execution).
