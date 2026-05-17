# Tasks: T41 — Evolution API readiness

## Phase 1: Private staging templates

- [x] 1.1 Update `infra/vps/gateway-wa-staging/docker-compose.yml` to make the private Evolution topology explicit: `gateway-wa` bridges `serena-internal` + `evolution-private`, Evolution deps stay private, and no host ports/public routes are introduced.
- [x] 1.2 Refresh `infra/vps/gateway-wa-staging/.env.example` so every runtime value remains placeholder-only, including Evolution URL/keys, gateway keys, `SERENA_INTERNAL_TOKEN`, and private DB/Redis settings.
- [x] 1.3 Review `infra/vps/gateway-wa-staging/routing-table.example.json` and keep the example minimal, non-secret, and aligned to operator-only `instanceId -> consumer` routing.

## Phase 2: Operator docs and readiness handoff

- [x] 2.1 Update `docs/ops/t37-gateway-wa-staging-runbook.md` with the operator-only management path, explicit no-pairing/no-send/no-public-admin rules, and the private smoke boundaries.
- [x] 2.2 Update `docs/ops/t40-vps-core-readiness.md` to state the T41 handoff clearly: Core stays unchanged, no direct Evolution calls, and the webhook boundary remains internal.
- [x] 2.3 Update `README.md`, `docs/project-status.md`, and `docs/open-questions.md` to record the resolved private Evolution hosting decision and list remaining risks/open items without re-opening solved choices.

## Phase 3: Non-destructive validation

- [x] 3.1 Tighten `scripts/smoke/gateway-wa-staging-smoke.ts` (or add a T41-specific sibling) so it only checks health, auth rejection, unknown route handling, and malformed `/send` validation with no live pairing or delivery.
- [x] 3.2 Add `scripts/tests/t41-evolution-api-readiness.test.ts` to assert the staging templates/docs keep public exposure out, preserve placeholder secrets, and keep the smoke helper non-destructive.
- [x] 3.3 Wire the T41 validation into `package.json` scripts (and `npm run check` if needed) so repo-only readiness checks run with the existing bootstrap validation path.

## Phase 4: Final consistency pass

- [x] 4.1 Confirm all T41 artifacts still exclude live deploys, real WhatsApp pairing, real sending, public admin exposure, and any secret material.
- [x] 4.2 Keep the OpenSpec change set aligned with the final file edits so `sdd-apply` can implement without scope drift.
