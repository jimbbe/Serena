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

### Implemented modules

| Module | Domain | Status |
|--------|--------|--------|
| `inbound-gate` | Evalua mensajes entrantes, aplica politicas de acceso, rutea a perfiles LLM. | ✅ 34 tests |
| `mediation-bridge` | Gestiona ciclo de vida de sesiones de mediacion entre dos participantes. | ✅ 8 tests |
| `contact-directory` | Dominio de contactos, adapter in-memory con datos semilla, busqueda case-insensitive. | ✅ 17 tests |
| `mediation-understanding` | Extraccion basada en reglas de pedidos de mediacion en espanol. | ✅ 18 tests |
| `prudent-rewording` | Reescritura en tercera persona con templates. | ✅ 15 tests |
| `session-manager` | Resolucion de sesiones activas con discriminacion explicita. | ✅ 16 tests |
| `orchestrator` | Pipeline end-to-end conectando los modulos de negocio. | ✅ 11 tests |
| `internal-pipeline-http` | Endpoint `POST /internal/pipeline/process` con hardening (auth + idempotencia) y validacion estricta de `receivedAt`. | ✅ tests HTTP |
| `whatsapp-gateway` | Contrato y tipos de dominio (T17A); mock gateway en `apps/gateway-wa/` (T18). | Sin WhatsApp real |
| `conversation-store` | Store in-memory de conversaciones y mensajes. | ✅ 13 tests |
| `ai-guide` | Pipeline agnostico de LLM con PromptRegistry, ContextPolicy, OutputContract, runtime validation, historial conversacional y provider OpenAI-compatible configurable. | Mock por defecto |

## HTTP Endpoints

- `GET /health` — Health check returning service status and environment.
- `POST /internal/pipeline/process` — Pipeline completo (gate → AI guide) con `X-Serena-Internal-Token`.
- `POST /dev/simulate/inbound-message` — Single-step simulation (solo con `ENABLE_SIMULATION_ENDPOINTS=true`).
- `POST /dev/simulate/scenario` — Multi-step scenario runner (solo con `ENABLE_SIMULATION_ENDPOINTS=true`).

Sin frameworks externos, sin WhatsApp real, sin PostgreSQL en app. Stores in-memory. El provider OpenAI-compatible existe, pero el default sigue siendo mock y no hay llamadas reales salvo configuracion explicita por env.

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
| `AI_PROVIDER` | `mock` | LLM provider: `mock` (deterministic) or `openai-compatible` |
| `AI_BASE_URL` | (optional) | Base URL for OpenAI-compatible API (required when `AI_PROVIDER=openai-compatible`) |
| `AI_API_KEY` | (optional) | API key for the LLM (never commit) |
| `AI_MODEL` | (optional) | Model name (e.g. `gpt-4o`) |
| `AI_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
