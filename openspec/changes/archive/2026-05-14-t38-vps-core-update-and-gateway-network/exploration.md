# Exploration: T38 — VPS core update and gateway network

## Current State

The repository already contains the Serena Core internal WhatsApp webhook contract and shared internal-token auth requirements, but the live VPS stack is still effectively on the older T04 core image. The orchestrator-provided diagnosis confirms `/docker/serena` is not a Git checkout, `serena-core` and `serena-postgres` are healthy, public `/health` returns 200, `SERENA_INTERNAL_TOKEN` is missing from the VPS `.env`, and public `POST /internal/webhook/whatsapp` without token returns 404. That combination means the repo is ready for the next core image, but the VPS runtime is NOT yet ready for `gateway-wa` to forward inbound traffic.

T38 is therefore an operations-preparation change, not a product-feature change: wire the required core env in the repo template, document the safe VPS update path, and ensure the staging gateway template joins `serena-internal` so a future approved deployment can reach `http://serena-core:3000/internal/webhook/whatsapp` privately.

## Affected Areas

- `infra/vps/docker-compose.yml` — Serena Core must require `SERENA_INTERNAL_TOKEN` so internal routes stay aligned with `internal-auth` and webhook specs.
- `infra/vps/gateway-wa-staging/docker-compose.yml` — `gateway-wa` must join external `serena-internal` to reach `serena-core` privately.
- `docs/ops/t38-vps-core-update-runbook.md` — operator runbook for safe source replacement, token setup, rebuild, verification, and rollback.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — staging runbook must block gateway deploy until T38 preconditions are satisfied.
- `openspec/specs/internal-auth/spec.md` — auth expectations constrain the runtime to have `SERENA_INTERNAL_TOKEN` configured and never logged.
- `openspec/specs/whatsapp-inbound-webhook/spec.md` — webhook existence and happy-path verification define the acceptance target after core rebuild.
- `apps/gateway-wa/README.md` — documents current gateway assumption that Serena Core exposes `/internal/webhook/whatsapp` and forwards the internal token.

## Approaches

1. **Repo-only preparation with operator runbook** — version the compose/template/runbook changes and leave production mutation for an explicit operator execution after review.
   - Pros: respects Serena safety rules, preserves `.env` and volumes, keeps secrets off Git, avoids accidental gateway/Caddy/Evolution changes.
   - Cons: runtime readiness is documented, not completed, until the operator executes the runbook on the VPS.
   - Effort: Low

2. **Automated remote update from this task** — SSH into the VPS, inject token, replace source, rebuild Core, and verify live.
   - Pros: faster path to a fully ready environment.
   - Cons: VIOLATES current scope and safety constraints; risky because `/docker/serena` is not a Git checkout and the update path must preserve `.env` and volumes.
   - Effort: Medium

3. **Deploy gateway-wa together with the core update** — combine core refresh, private network wiring, and staging gateway bring-up.
   - Pros: end-to-end staging readiness in one pass.
   - Cons: wrong boundary for T38, expands blast radius, mixes concerns, and breaks the explicit “do not deploy gateway / do not modify edge / do not pair WhatsApp” constraints.
   - Effort: High

## Recommendation

Use **Approach 1**.

T38 should stay narrowly focused on repo-backed operational readiness: require `SERENA_INTERNAL_TOKEN` in the VPS Core compose, connect future `gateway-wa` staging to `serena-internal`, and document the exact operator sequence to update `/docker/serena` without touching `.env`, volumes, Caddy, or unrelated services. This is the correct boundary because the live VPS path is a non-git working copy, so the safe update procedure is as important as the config delta itself.

The proposal phase should treat T38 acceptance as: the repo accurately documents the safe update path, the gateway template is network-ready, and the operator can later verify `POST /internal/webhook/whatsapp` returns 200 with token authentication after rebuilding only `serena-core`.

## Risks

- `/docker/serena` is not a Git checkout, so a careless source replacement could overwrite local runtime material unless `.env` and volumes are explicitly preserved.
- `SERENA_INTERNAL_TOKEN` is currently absent on the VPS; if forgotten, internal routes will fail with 500 after the new image is deployed.
- Public 404 on `/internal/webhook/whatsapp` is a useful stale-image signal today, but after the update the route must be verified from inside the container with token auth, not via public edge assumptions.
- `gateway-wa` attaching to `serena-internal` is necessary but NOT sufficient; future staging still needs approved secrets, routing table material, and smoke execution from a network-reachable context.
- T38 must not drift into infra rollout work, otherwise rollback scope expands beyond `serena-core`.

## Ready for Proposal

Yes — the scope, constraints, and acceptance target are clear. The next phase should propose a repo-only readiness change with explicit operator handoff and rollback boundaries.
