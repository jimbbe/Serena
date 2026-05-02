# Serena Core

Application core for the Serena conversational accompaniment project.

## Architecture

Clean / Hexagonal DDD with strict separation:
- `domain/` — types, value objects, pure logic (no dependencies)
- `application/ports/` — interfaces (contracts) for infrastructure adapters
- `application/use-cases/` — business logic implementations depending only on ports
- `infrastructure/memory/` — in-memory adapters for testing and MVP
- `tests/` — module-local tests

Node.js native HTTP server (no frameworks), TypeScript 5.9+ with `--experimental-strip-types`.

## Modules

### Implemented (T06–T09)

| Module | Domain | Status |
|--------|--------|--------|
| `inbound-gate` | Classifies incoming messages as conversational, mediation request, or blocked. Evaluates sender policy, detects mediation/urgent signals, audits decisions, routes to LLM profiles. | ✅ 17 tests |
| `mediation-bridge` | Manages session lifecycle between two participants: start, record reply, generate outbound drafts with Serena introduction, close. One session per participant pair. | ✅ 19 tests |

### Contracts only (T10)

| Module | Contract | Purpose |
|--------|----------|---------|
| `contact-directory` | `ContactDirectory` port | Store and resolve contacts (allowed senders + name-to-ID lookup) |
| `session-manager` | `SessionResolver` port | Resolve active session for participant pair |
| `mediation-understanding` | `MediationUnderstanding` port | Extract recipient + message from natural language (rules first, LLM fallback) |
| `prudent-rewording` | `PrudentRewording` port | Reword in indirect style with attribution |
| `whatsapp-gateway` | `WhatsAppGateway` port | Send/receive via Evolution API REST + webhooks |
| `orchestrator` | Domain types `PipelineResult` / `PipelineInput` | End-to-end pipeline coordination |

## HTTP Endpoints

- `GET /health` — Health check returning service status and environment.
- All other routes return 404.

## Run

```sh
npm start          # from apps/core/
npm run test       # run module tests
npm run typecheck  # TypeScript compilation check
```

Or via Docker Compose from repo root:

```sh
docker compose up --build
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","service":"serena-core","environment":"local"}
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `local` | Environment label for health endpoint |
| `NODE_ENV` | `development` | Node.js environment |
| `HOST` | `0.0.0.0` | Listen host |
| `PORT` | `3000` | Listen port |
| `DATABASE_URL` | (optional) | PostgreSQL connection string (not yet used) |
