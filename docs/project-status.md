# Project Status

## Current Phase

Serena is in initial repository bootstrap.

The current goal is to prepare a clean base so later tasks can add infrastructure and code without mixing concerns.

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
- PostgreSQL connection.
- Docker Compose.
- Panel UI.
- Deployment.

## Repository Conventions

- Keep each task small and reviewable.
- Prefer documentation of uncertainty over premature decisions.
- Keep secrets out of Git.
- Add modules only when a task needs them.
- Use `npm run check` as the current bootstrap sanity check.

## Expected Next Task

T02 should add local infrastructure for development:

- Docker Compose.
- PostgreSQL local service.
- a minimal service healthcheck.
- clear start/stop/verification instructions.
