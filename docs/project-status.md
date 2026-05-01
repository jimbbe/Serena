# Project Status

## Current Phase

Serena is in early bootstrap with local development infrastructure baseline (T02).

The current goal is to keep a clean base so later tasks can add behavior without mixing concerns.

## Decided

- The project starts with Node.js + TypeScript and Go as available stack choices.
- Node.js + TypeScript is the default fit for product services, APIs, tooling web, panels and SDK-heavy integrations.
- Go is available for small robust services, workers, gateways/adapters or bounded components where binary simplicity or concurrency matter.
- PostgreSQL is the planned database.
- Docker / Docker Compose is the planned container base.
- Architecture should stay modular and containerized.
- Business logic should not be coupled to WhatsApp, PostgreSQL, HTTP frameworks, LLM providers or other external APIs.

## Not Implemented Yet

- Serena business logic.
- WhatsApp integration.
- Contact allowlist behavior.
- PostgreSQL connection usage in application code.
- Panel UI.
- Deployment.

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

## Expected Next Task

T03 is not decided yet. It should stay narrow and should not add WhatsApp, production deployment or business logic unless the task explicitly scopes that work.
