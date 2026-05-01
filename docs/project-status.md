# Project Status

## Current Phase

Serena is in early bootstrap with local development infrastructure baseline (T02), a prepared VPS deployment path (T03), a real VPS preflight report (T03.1), and the T04 base VPS stack deployed.

The current goal is to keep a clean base so later tasks can add behavior without mixing concerns.

## Decided

- The project starts with Node.js + TypeScript and Go as available stack choices.
- Node.js + TypeScript is the default fit for product services, APIs, tooling web, panels and SDK-heavy integrations.
- Go is available for small robust services, workers, gateways/adapters or bounded components where binary simplicity or concurrency matter.
- PostgreSQL is the planned database.
- Docker / Docker Compose is the planned container base.
- Architecture should stay modular and containerized.
- Business logic should not be coupled to WhatsApp, PostgreSQL, HTTP frameworks, LLM providers or other external APIs.
- The active VPS path is `serena-core` behind the existing Caddy edge on external Docker network `proxy`, without host port publication from the app container.
- The VPS stack includes private PostgreSQL on `serena-internal`; `serena-postgres` is not exposed on host ports or the public proxy network.

## Not Implemented Yet

- Serena business logic.
- WhatsApp integration.
- Contact allowlist behavior.
- PostgreSQL connection usage in application code.
- Panel UI.
- Production behavior beyond the base healthcheck route.

## Repository Conventions

- Keep each task small and reviewable.
- Prefer documentation of uncertainty over premature decisions.
- Keep secrets out of Git.
- Add modules only when a task needs them.
- Use `npm run check` as the current bootstrap sanity check.

## Implemented In T02

- Root `docker-compose.yml` with:
  - `postgres` service (`postgres:16-alpine`) and named volume `serena-postgres-data`.
  - `serena-core` service built from `apps/core/Dockerfile`.
- Minimal Node.js/TypeScript HTTP service under `apps/core/src/server.ts`.
- `GET /health` endpoint returning HTTP 200 + simple JSON payload.
- Local environment variables expanded in `.env.example` for compose + future DB wiring.
- Documentation added in `README.md` and `apps/core/README.md` for start/verify/stop flow.

## Prepared In T03

- `docs/deployment-t03.md` documents the VPS deployment strategy, preflight checks, deploy commands, verification commands and rollback commands.
- `infra/vps/docker-compose.yml` templates the future `serena-core` VPS Compose project attached to external network `proxy` with no host ports.
- `infra/vps/Caddyfile.serena.example` templates the future Caddy route `serena.goingmerry01.tech -> serena-core:3000`.
- PostgreSQL was intentionally excluded from the T03 VPS template because the app did not use persistence yet; T04 incorporated private PostgreSQL into the VPS stack as base infrastructure.

## Verified In T03.1

- `docs/deployment-t03-1-preflight.md` records the real Hostinger VPS preflight before T04.
- VPS `1619520` is running at IPv4 `177.7.32.90` and IPv6 `2a02:4780:75:6109::1`.
- Hostinger Docker Manager shows `caddy-edge`, `necrologia-bot`, and `hermes-agent-m41v` running; no Serena project/container was observed.
- Caddy is located at `/docker/caddy-edge/docker-compose.yml` and generates `/config-src/Caddyfile` through `caddyfile-writer`.
- `serena.goingmerry01.tech` is not present in DNS and resolves as NXDOMAIN.
- SSH port `22` is reachable, but SSH authentication from the local operator environment failed; direct Docker/Compose/network inspection and real Caddy backup remain blocked.

## Deployed In T04

- `docs/deployment-t04.md` records the final operational state, access, deploy, verify, rollback and risks.
- SSH to `root@177.7.32.90` was confirmed.
- Docker/Compose, external network `proxy`, DNS for `serena.goingmerry01.tech`, `/docker/serena` write access and Caddy backups were confirmed.
- Serena stack is deployed at `/docker/serena`.
- `serena-core` is running/healthy on `proxy` + `serena-internal`.
- `serena-postgres` is running/healthy only on `serena-internal` with persistent volume `serena-postgres-data`.
- No Serena host ports are published.
- Caddy routes `serena.goingmerry01.tech` to `serena-core:3000`; validate and reload passed.
- Internal and public `/health` verification returned HTTP 200 with production health JSON.
- Restart verification for the Serena stack passed.

## Expected Next Task

The next task should add product behavior or application-level PostgreSQL usage only when explicitly scoped. Infrastructure T04 blockers are resolved.
