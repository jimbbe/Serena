# Project Status

## Current Phase

Serena completed bootstrap (T01–T04) with VPS deployment active. Two core modules are implemented (T06–T09): `inbound-gate` classifies and routes incoming messages, and `mediation-bridge` manages session lifecycle between two participants. T10 defined the full MVP architecture, module contracts, and task roadmap (T11–T17).

The current goal is to implement the remaining MVP modules following the T10 roadmap, starting with WhatsApp Gateway (T11).

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

## Implemented (T05–T10)

- T05: Complete TypeScript migration. `npm run check` validates structure + typechecks.
- T06: `inbound-gate` module — message classification (allowed/blocked/needs_mediation), sender validation, signal-based policy evaluation.
- T07: `inbound-gate` traceability — auditable decisions, policy versioning, metadata.
- T08: `inbound-gate` processing router — routes to LLM profiles (conversation, mediation_understanding, risk_review, clarification).
- T09: `mediation-bridge` module — session lifecycle (start, record reply, close), turns, outbound drafts with Serena introduction.
- T10: MVP architecture design (`docs/t10-mvp-architecture.md`) + 6 new module contracts — contact-directory, session-manager, mediation-understanding, prudent-rewording, whatsapp-gateway, orchestrator.

## Business Logic Use Cases (T06–T09)

- `inbound-gate`:
  - `EvaluateInboundMessage` — clasifica mensajes entrantes (allowed/blocked/needs_mediation) evaluando politicas, validacion de sender y deteccion de senales
  - `ProcessInboundMessage` — rutea decisiones a perfiles LLM (conversation, mediation_understanding, risk_review) o descarte
  - stores en memoria: `InMemoryContactDirectory`, `InMemoryDecisionAudit`
- `mediation-bridge`:
  - `StartMediationBridgeSession` — inicia sesion entre requester y recipient, genera borrador saliente con introduccion de Serena
  - `RecordMediationBridgeReply` — registra turno de respuesta del participante esperado
  - `CloseMediationBridgeSession` — cierra sesion con motivo
  - store en memoria: `InMemoryMediationBridgeSessionStore`
- tests: 36 tests de caso de uso pasando (evaluacion, ruteo y mediacion, sin mock de infraestructura externa)

## Not Implemented Yet

- HTTP API interna — los modulos core no estan expuestos por HTTP (solo `/health`).
- WhatsApp Gateway adapter con Evolution API real (T11) — hoy solo existe el contrato de puerto.
- Contact Directory implementation (T12).
- Session Manager + Orchestrator pipeline (T13).
- Mediation Understanding (rule-based Spanish extraction) (T14).
- Prudent Rewording implementation (T15).
- End-to-end integration tests (T16).
- Evolution API VPS deployment (T17).
- Uso real de PostgreSQL desde la aplicacion — las stores actuales son en memoria.
- Panel UI.
- Politica final de allowlist/contactos.
- Proveedor externo de mensajes (WhatsApp) integrado en produccion.

## Repository Conventions

- Keep each task small and reviewable.
- Prefer documentation of uncertainty over premature decisions.
- Keep secrets out of Git.
- Add modules only when a task needs them.
- Use `npm run check` as the current bootstrap sanity check.
- Mergeable changes must go through a PR reviewed and approved by Marco before merge; no direct merges to `main`.

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

Per the T10 roadmap (`docs/t10-mvp-architecture.md` §11), the current phase is **business logic implementation with in-memory adapters**:

- **T11**: Contact Directory (in-memory adapter + JSON seed)
- **T12**: Mediation Understanding (rule-based Spanish extraction)
- **T13**: Prudent Rewording (template-based indirect rewording)
- **T14**: Session Manager (resolve active session per pair)
- **T15**: Orchestrator (wire end-to-end pipeline)
- **T16**: End-to-end integration tests

T11, T12 and T13 are independent and can be implemented in parallel.

After T16, integrations follow (T17–T20): WhatsApp Gateway as a **separate repo**, Serena WhatsApp adapter, PostgreSQL adapters, VPS deployment update.
