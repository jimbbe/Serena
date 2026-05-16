# Project Status

## Current Phase

Serena has the base VPS stack deployed (T04), MVP architecture defined (T10), business logic modules implemented with testing (T06-T09, T11-T15), the orchestrator pipeline exposed via HTTP (T16), the WhatsApp Gateway contract specified (T17A), internal hardening completed (T17B), mock WhatsApp Gateway with dry-run adapter (T18), documentation reorganized (T18.1), AI guide module with deterministic mock provider (T19), channel-agnostic inbound with external identity resolution (T20), conversation store (T22), prompt registry with output contracts and runtime validation (T23), conversation history wired into AI guide context (T27), known contacts wired into AI guide mediation context (T28), configurable OpenAI-compatible LLM provider with env-based selection (T29), post-T29 local readiness/docs-spec sync completed (T30A), structural cleanup completed (T30B), **Phase 3 of the WhatsApp Gateway — real Evolution API integration** completed (wsp-phase3-real-gateway), `gateway-wa` staging prepared repo-only (T37), VPS core refreshed with internal WhatsApp webhook verified (T40), and configurable outbound delivery adapter toward `gateway-wa` merged while keeping `fake` as the default safe adapter (T39). The gateway now exposes a REST API with 7 endpoints, 3-tier API key auth, instance CRUD, message sending with stale-state fallback, webhook receiver with dedup and connection.update handling, and zero npm dependencies. **250 tests passing in gateway-wa** (was 59), 776 in core. Total: **1026 tests passing**.

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
- `apps/gateway-wa` is intentionally reused as the real WhatsApp Gateway workspace for Phase 3: `dry_run` preserves the T18 mock adapter behavior, while `production` enables the Evolution API HTTP gateway. No separate `apps/gateway-whatsapp` workspace is created in this phase.

## Implemented In T27: AI Guide Conversation History

- `AiGuideInput` type created in `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts` with typed fields for `recentMessages`, `knownContacts`, `safetyMemory`.
- `AiGuideService.execute()` and `ExecutionPipeline.execute()` updated to use `AiGuideInput` instead of `Record<string, string>`.
- `ExecutionPipeline.buildUserPrompt()` extracts string-only values for `renderTemplate()` and passes `recentMessages`, `knownContacts`, `safetyMemory` to `ContextBuilder.build()`.
- All 4 prompt definitions activated `includeConversationHistory: true` with `maxRecentMessages`: reply=6, risk_review=5, understand_request=4, clarify=3.
- `ProcessChannelInboundMessage` builds `recentMessages` from `ConversationStore.listMessages()`, excluding the current message, formatted as `[direction] personId via channel: text`.
- Tests updated: 5 new context-policy tests (guard updated from `false`→`true`), 5 new execution-pipeline tests for recentMessages flow, 6 new process-channel-inbound-message tests for history wiring.
- Documentation: `docs/ai-guide-prompts.md` updated to reflect active conversation history. `README.md` test count updated.

## Not Implemented Yet

- PostgreSQL connection usage in application code (current modules use in-memory stores).
- Real LLM runtime configuration in deployed/local environments; OpenAI-compatible provider exists (T29) but requires env configuration. Mock remains the default.
- Real outbound message sending (pipeline produces results but does not send messages — gateway has the `POST /send` endpoint ready but the orchestrator pipeline does not yet trigger it automatically).
- Docker deployment and VPS integration of the real gateway (`gateway-wa` service, Docker network wiring, env configuration for production `GATEWAY_MODE`) remains pending; core-side VPS readiness is complete.
- HTTP API beyond `/health` and `/internal/pipeline/process` (simulation endpoints are dev-only, gated by `ENABLE_SIMULATION_ENDPOINTS`).
- Public/admin exposure policy for gateway-wa staging (T37 keeps it private by default).
- HMAC webhook signature validation between Evolution API and gateway.
- Panel UI.
- **Instance state persistence** — InstanceManager is in-memory; gateway restart loses local tracking. Evolution API remains source of truth for sessions. Rehydration from Evolution API on startup planned for a future phase.

## Prepared In T37: Shared gateway-wa staging platform (repo-only)

- Added gateway routing table support (`instanceId -> consumer`) via file/JSON config in `apps/gateway-wa`.
- Added routing table loader with env-resolved auth token per consumer route.
- Updated webhook receiver to route by `instanceId`, return safe `routing_not_configured` on unknown routes, and keep legacy single-target fallback.
- Added staging template under `infra/vps/gateway-wa-staging/` with `gateway-wa`, `evolution-api`, `evo-postgres`, `redis`, private network boundaries, and no host ports.
- Added placeholder-only `.env.example` and routing table sample.
- Added non-destructive smoke helper script and T37 runbook.
- No live deploy, SSH mutation, Caddy mutation, or real WhatsApp pairing performed.

## Executed In T40: VPS Core Readiness For gateway-wa

- `/docker/serena` on the VPS was updated from `origin/main` after T39 using an operator-approved archive copy because the VPS directory is not a Git checkout.
- Existing `.env` was preserved; `SERENA_INTERNAL_TOKEN` was generated on the VPS without printing or committing the secret.
- Only `serena-core` was rebuilt and recreated; `serena-postgres` stayed running and Docker volumes were not deleted.
- Validation passed: public `/health` returns 200, internal `POST /internal/webhook/whatsapp` returns 200 with the token, and the same webhook returns 401 without the token.
- No `gateway-wa`, Evolution API, Redis, Caddy changes, port exposure, or WhatsApp pairing were performed.
- Backup before update: `/docker/backups/serena-t40-preupdate-20260516-230859.tar.gz` (excludes `.env`).

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

- `docs/ops/deployment-t03.md` documents the VPS deployment strategy, preflight checks, deploy commands, verification commands and rollback commands.
- `infra/vps/docker-compose.yml` templates the future `serena-core` VPS Compose project attached to external network `proxy` with no host ports.
- `infra/vps/Caddyfile.serena.example` templates the future Caddy route `serena.goingmerry01.tech -> serena-core:3000`.
- PostgreSQL was intentionally excluded from the T03 VPS template because the app did not use persistence yet; T04 incorporated private PostgreSQL into the VPS stack as base infrastructure.

## Verified In T03.1

- `docs/ops/deployment-t03-1-preflight.md` records the real Hostinger VPS preflight before T04.
- VPS `1619520` is running at IPv4 `177.7.32.90` and IPv6 `2a02:4780:75:6109::1`.
- Hostinger Docker Manager shows `caddy-edge`, `necrologia-bot`, and `hermes-agent-m41v` running; no Serena project/container was observed.
- Caddy is located at `/docker/caddy-edge/docker-compose.yml` and generates `/config-src/Caddyfile` through `caddyfile-writer`.
- `serena.goingmerry01.tech` is not present in DNS and resolves as NXDOMAIN.
- SSH port `22` is reachable, but SSH authentication from the local operator environment failed; direct Docker/Compose/network inspection and real Caddy backup remain blocked.

## Deployed In T04

- `docs/ops/deployment-t04.md` records the final operational state, access, deploy, verify, rollback and risks.
- SSH to `root@177.7.32.90` was confirmed.
- Docker/Compose, external network `proxy`, DNS for `serena.goingmerry01.tech`, `/docker/serena` write access and Caddy backups were confirmed.
- Serena stack is deployed at `/docker/serena`.
- `serena-core` is running/healthy on `proxy` + `serena-internal`.
- `serena-postgres` is running/healthy only on `serena-internal` with persistent volume `serena-postgres-data`.
- No Serena host ports are published.
- Caddy routes `serena.goingmerry01.tech` to `serena-core:3000`; validate and reload passed.
- Internal and public `/health` verification returned HTTP 200 with production health JSON.
- Restart verification for the Serena stack passed.

## Implemented In T06-T08: Inbound Gate

- `EvaluateInboundMessage` use case: valida sender, normaliza texto, decide si un mensaje entrante esta permitido, bloqueado o requiere mediacion, con metadatos de trazabilidad (policy version, matched signals, precedence).
- `ProcessInboundMessage` use case: consolida decision + ruteo a un perfil de procesamiento (`conversation`, `mediation_understanding`, `risk_review`, `discard`), preservando toda la trazabilidad en el contexto de ruta.
- Domain types: `InboundDecision`, `InboundDecisionStatus`, `InboundDecisionReason`, `InboundPolicy` (con reglas explicitas de prioridad: invalid sender > invalid text > unknown sender > urgent/risk over mediation > mediation over conversation > conversation default), `InboundProcessingRoute`, `LLMProfile`.
- Ports: `DecisionAudit` (con adapter `InMemoryDecisionAudit`), `ContactDirectory` (version inbound-gate, luego reemplazada por el modulo T11).
- Adapters: `InMemoryDecisionAudit`, `InMemoryContactDirectory` (inbound-gate local).
- Tests: 34 tests covering evaluate-inbound-message (9) y process-inbound-message (25 scenarios: routing, traceability, precedence, edge cases con mediacion + riesgo simultaneo).

## Implemented In T09: Mediation Bridge

- Domain: `MediationBridgeSession` (status, participant IDs, awaitingParticipantId, turns, recipientIntroduced flag), `MediationBridgeTurn` (from, draft, plainReply), `OutboundDraft`, `SessionLifecycle` type (status transitions: `awaiting_recipient_reply`, `awaiting_requester_reply`, `closed`).
- Port: `MediationBridgeSessionStore` con adapter `InMemoryMediationBridgeSessionStore`.
- Use cases:
  - `StartMediationBridgeSession`: inicia sesion entre remitente y destinatario, genera primer borrador con presentacion de Serena ("Hola, soy Serena. [nombre] te manda este recado: [texto]"), registra primer turno remitente -> destinatario.
  - `RecordMediationBridgeReply`: registra respuesta del participante esperado, alterna espera entre remitente y destinatario, rechaza respuestas de participante no esperado.
  - `CloseMediationBridgeSession`: cierra sesion con motivo explicito, rechaza sesiones ya cerradas o inexistentes.
- El primer turno siempre incluye presentacion de Serena; turnos posteriores no la repiten.
- Tests: 8 tests cubriendo ciclo completo (start, reply recipiente, reply remitente, close, rechazos, store in-memory).

## Defined In T10: MVP Architecture

- Documento `docs/architecture/t10-mvp-architecture.md` define la arquitectura Clean/Hexagonal de la Fase 1.
- Flujo completo de mediacion prudente: inbound-gate → session-manager → contact-directory → mediation-understanding → prudent-rewording → mediation-bridge → whatsapp-gateway.
- Separacion de capas: domain (tipos puros), application (puertos, use cases), infrastructure (adapters concretos).
- Modulos definidos como necesarios para MVP: inbound-gate, session-manager, contact-directory, mediation-understanding, prudent-rewording, mediation-bridge, orchestrator, whatsapp-gateway.
- Preguntas abiertas de arquitectura registradas en `docs/open-questions.md`.

## Implemented In T11: Contact Directory

- Domain: `Contact` (id, displayName, whatsappId). Allowed-sender behavior is managed by inbound-gate allowed IDs, not by a Contact field.
- Port: `ContactDirectory` con metodos `findByWhatsAppId`, `findById`, `findByDisplayName` (exact match, case-insensitive), `findAll`, `hasAllowedSender`.
- Adapter: `InMemoryContactDirectory` con seed data de contactos de ejemplo (Carlos, Maria, Juan, Pedro, etc.) y multiples metodos de busqueda.
- Use case: `ResolveContact` busca contacto por displayName (case-insensitive, exact match).
- Reemplaza el `ContactDirectory` local de inbound-gate con un modulo propio y completo.
- Tests: 17 tests cubriendo busquedas, case-insensitivity, accent handling, duplicates, edge cases con `hasAllowedSender`, `findByWhatsAppId`, y `ResolveContact`.

## Implemented In T12: Mediation Understanding

- Domain: `MediationRequest` (recipientName, messageToDeliver).
- Port: `MediationUnderstanding` con metodo `extractMediationRequest(text)` que devuelve `MediationRequest | null`.
- Adapter: `RuleBasedMediationUnderstanding` con patrones en espanol: verbos de mediacion (`avisale`, `decile`, `escribile`, `llama`, `llamá`, `contactá`, `pedile`) seguidos de "a [nombre]" y "que [mensaje]".
- Use case: `ExtractMediationRequest` delega al puerto y retorna null si no se detecta pedido de mediacion.
- Soporta: acentos, case-insensitivity, nombres compuestos (ej. "Maria Jose"), mensajes con caracteres especiales y emojis, forma no acentuada de verbos.
- Tests: 18 tests cubriendo patrones de extraccion, casos negativos, edge cases de nombres, mensajes largos, case-insensitivity.

## Implemented In T13: Prudent Rewording

- Domain: `RewordingContext` (senderDisplayName, recipientDisplayName, originalText, isIntroduction).
- Port: `PrudentRewording` con metodo `reword(context)` que devuelve texto reescrito en tercera persona.
- Adapter: `IndirectRewording` basado en templates: para introducciones usa "Hola, soy Serena. [sender] te manda este recado: [texto]" y para no-introducciones usa "[sender] dice: [texto]" o "[texto] (de parte de [sender])".
- Use case: `RewordMessage` pasa el contexto al puerto y retorna el texto reescrito.
- Propiedades preservadas: puntuacion, acentos, emojis, saltos de linea, caracteres especiales del texto original.
- Tests: 15 tests cubriendo ambos templates, preservacion de texto literal, manejo de nombres con acentos y dos palabras, edge cases con caracteres especiales.

## Implemented In T14: Session Manager

- Domain: `SessionResolution` discriminated union with variants: `existing_session`, `new_session_possible`, `no_active_session`, `ambiguous_active_sessions`.
- Port: `SessionResolver` (resolve active session for a participant pair), `ActiveSessionQuery` (find active sessions by participant).
- Adapter: `InMemorySessionQuery` with add/remove/find operations for testing.
- Use case: `ResolveSession` resolves whether an incoming message belongs to an active mediation session or can start a new one. Lookup is order-independent (A→B and B→A find the same session). Closed sessions are ignored. Multiple active sessions for the same pair produce `ambiguous_active_sessions` instead of silently resolving.
- Port `ActiveSessionQuery` decouples session-manager from mediation-bridge internals — the production adapter will bridge to `MediationBridgeSessionStore`.
- Tests: 16 tests covering new session, existing session (both orders), closed session ignored, ambiguous sessions, adapter operations.

## Implemented In T15: Orchestrator Pipeline

- Pipeline use case `ProcessIncomingWhatsAppMessage` conecta los seis modulos existentes sin duplicar logica.
- Dominio `PipelineResult` con variantes explicitas y testeables: `discard`, `conversation_pending`, `risk_review_required`, `mediation_not_understood`, `recipient_not_found`, `mediation_started`, `mediation_reply_recorded`, `ambiguous_active_session`.
- Dominio `PipelineInput` normalizado (sin `instanceId` de WhatsApp, que es del gateway).
- Tests end-to-end in-memory (11 escenarios): sender invalid/desconocido → discard, mensaje conversacional → conversation_pending, riesgo → risk_review_required, mediacion no entendible → mediation_not_understood, destinatario inexistente → recipient_not_found, mediacion nueva → mediation_started, respuesta en sesion activa → mediation_reply_recorded, sesion cerrada permite nueva, sesiones ambiguas → ambiguous_active_session, flujo bridge-backed real sin registro manual de sesion.
- Adapter `MediationBridgeActiveSessionQuery` que lee sesiones directamente de `MediationBridgeSessionStore`, eliminando la necesidad de sincronizacion manual entre stores.
- El orchestrator coordina: no reimplementa validacion, extraccion, resolucion, turnos ni reescritura.
- Ninguna conexion a infraestructura externa, HTTP endpoints, WhatsApp, Evolution API ni PostgreSQL.
- Tests: 11 orchestrator + 14 HTTP pipeline = 25 nuevos tests en T15-T16. Total: 140 tests (115 previos + 25).

## Implemented In T16: Internal Pipeline HTTP

- Endpoint `POST /internal/pipeline/process` valida JSON entrante, ejecuta `ProcessIncomingWhatsAppMessage` y devuelve `PipelineResult` serializado.
- Factory `createInMemoryPipeline()` en `apps/core/src/bootstrap/create-in-memory-pipeline.ts` crea el orchestrator con dependencias compartidas. `MediationBridgeActiveSessionQuery` lee sesiones directamente de `MediationBridgeSessionStore` — sin registro manual. Las sesiones sobreviven entre requests HTTP.
- Handler `internal-pipeline-handler.ts` valida campos requeridos (`senderWhatsAppId`, `messageText` o alias `text`), `receivedAt` opcional, rechaza con 400/405/404 segun corresponda.
- Server `bootstrap/server.ts` rutea `POST /internal/pipeline/process` y `GET /health`; cualquier otro metodo o ruta devuelve 404 o 405.
- Tests: 14 tests HTTP integrados cubriendo validacion JSON, ruteo, sesion continua (Maria inicia → Carlos responde → sesion encontrada en un solo test autocontenido), edge cases (404, 405, body invalido, array, campo alias, mensaje de riesgo).
- Ninguna conexion a infraestructura externa. Documento de contrato: `docs/architecture/t16-internal-pipeline-http.md`.

## Defined In T17A: WhatsApp Gateway Contract

- Documento `docs/architecture/t17a-whatsapp-gateway-contract.md` define el contrato completo entre Serena Core y el futuro WhatsApp Gateway (servicio independiente, repo `whatsapp-gateway`).
- Principio: el Gateway no contiene logica de negocio de Serena. Solo normaliza payloads, llama a `POST /internal/pipeline/process`, interpreta `PipelineResult` via `mapPipelineResultToGatewayAction`, y eventualmente envia mensajes.
- Tipos agregados: `NormalizedWhatsAppInboundMessage` (contrato de entrada normalizado desde el Gateway), `WhatsAppGatewayAction` (accion resultante del pipeline: `ignore`, `no_auto_send`, `draft_ready`, `manual_review_required`, `error`).
- Funcion pura `mapPipelineResultToGatewayAction` en `apps/core/src/modules/whatsapp-gateway/application/` mapea cada variante de `PipelineResult` a una accion concreta. Sin side effects, sin HTTP, sin WhatsApp.
- Tests: 15 tests cubriendo todas las variantes de `PipelineResult` → `GatewayAction`, incluyendo edge cases (texto largo, texto vacio, signals vacios, single session ambiguous).
- Politica de envio futuro documentada: `mediation_started` y `mediation_reply_recorded` producen `draft_ready` (no se envia en fase actual), `risk_review_required` y `ambiguous_active_session` → `manual_review_required`, el resto → `no_auto_send` o `ignore`.
- Idempotencia documentada en T17A (por `messageId` en body). T17B la implemento in-memory: duplicados devuelven `duplicate: true` con resultado cacheado. Pendiente: persistencia durable y key compuesta para multi-provider/multi-instance.
- Seguridad interna documentada en T17A (header `X-Serena-Internal-Token`). T17B la implemento: token validado antes del body parsing en routing layer.
- Errores HTTP esperados documentados (200, 400, 401/403 futuro, 409 futuro, 500, timeouts).
- Preguntas abiertas registradas en `docs/open-questions.md`.
- No se conecto Evolution API, WhatsApp, ni PostgreSQL.
- `npm run check` y `npm test` pasan (155 tests, 0 fallas).

## Implemented In T17B: Internal Hardening

- Internal token authentication: `X-Serena-Internal-Token` header required on `POST /internal/pipeline/process`. Token from `SERENA_INTERNAL_TOKEN` env var. 401 missing, 403 invalid, 500 misconfigured. Checks BEFORE body parsing (fail fast). Health endpoint stays public (no token).
- Idempotency: `messageId` required non-empty string in payload body. `ProcessedMessageStore` port (domain) + `InMemoryProcessedMessageStore` adapter (infrastructure) tracks processed messageIds. Duplicate request returns cached `PipelineResult` with `duplicate: true` flag — zero changes to `PipelineResult` type. First request executes normally.
- CI: `.github/workflows/ci.yml` with triggers `pull_request: [main]` + `push: [main]`. Single job on `ubuntu-latest`, Node 22. Steps: checkout → setup-node → npm ci → npm run check → npm test.
- All in-memory — no PostgreSQL, no external deps. Idempotency data lost on restart (documented limitation).
- Tests: 24 HTTP pipeline tests (was 14) covering auth (5), idempotency (5), and all original scenarios updated with token injection. 165 total tests passing.
- Documentation: `docs/architecture/t17b-internal-hardening.md`.
- `npm run check` y `npm test` pasan (165 tests, 0 fallas).

## Implemented In T18: Mock WhatsApp Gateway / Dry-Run Adapter

- Self-contained npm workspace `@serena/gateway-wa` at `apps/gateway-wa/`.
- Copies frozen domain types from `@serena/core` (T17A contract): `PipelineResult`, `PipelineInput`, `WhatsAppGatewayAction`, `NormalizedWhatsAppInboundMessage`.
- New domain types: `MockWhatsAppEvent` (simulated inbound message) and `DryRunResult` (full execution trace).
- Application layer: `normalizeMockWhatsAppEvent` (pure validation + mapping), `callSerenaCore` (HTTP client with config validation), `mapPipelineResultToGatewayAction` (copied from core), `runDryGatewayEvent` (full orchestrator).
- Communicates with Serena Core exclusively via HTTP `POST /internal/pipeline/process` with `X-Serena-Internal-Token` header.
- Always returns `sent: false` and `mode: "dry_run"` — never sends real messages.
- `wouldSend` populated only for `draft_ready` actions (`mediation_started` and `mediation_reply_recorded`).
- Zero npm dependencies — Node 22 built-in `fetch` and `node:test`.
- 38 tests covering normalization (valid/invalid/trimming), all 8 PipelineResult variants via fake fetch, HTTP error propagation, wouldSend logic, sent always false. Uses fake `fetch` for deterministic testing.
- Root `package.json` updated with `typecheck:gateway-wa` and `test:gateway-wa` scripts.
- Documentation: `apps/gateway-wa/README.md`, `docs/architecture/t18-mock-whatsapp-gateway.md`.
- `npm run check` and `npm test` include gateway-wa workspace.

## Implemented In T19: AI Guide Module

- New module `apps/core/src/modules/ai-guide/` with Clean/Hexagonal architecture, completely agnostic of any LLM provider.
- Domain types: `GuideUseCaseId` (4-value string union: `serena.conversation.reply`, `serena.risk.review`, `serena.mediation.understand_request`, `serena.mediation.clarify`), `ExecutionPolicy` (5 required fields), `UseCaseContract` (5 fields), `GuideResult<T>` (generic with inline metadata, audited flag).
- Ports: `LlmProvider` (type alias with `invoke(input)`), `AiInvocationAudit` (type alias with `record(input, result)`).
- Application logic: `UseCaseRegistry` (register/get/getAll with duplicate protection, get returns `undefined` for unregistered), `ExecutionPipeline` (template interpolation, retry loop, audit recording, empty-result validation), `AiGuideService` (public facade `execute(useCaseId, input)`).
- Pre-built contracts: 3 use cases (conversation.reply, risk.review, mediation.understand_request) with placeholder prompts. `serena.mediation.clarify` throws `NotImplementedError`.
- Infrastructure: `MockLlmProvider` (deterministic canned responses), `InMemoryAiInvocationAudit` (in-memory array with `getRecords()`).
- Tests: 28 unit tests with `node:test` + `node:assert/strict` covering registry, pipeline, service, provider mock, audit mock.
- Module independence: zero imports from other Serena modules (inbound-gate, mediation-bridge, orchestrator).
- TypeScript: zero type errors, clean `tsc --noEmit` across all projects.
- All 231 tests pass (193 core + 38 gateway-wa).

## Implemented In T28: Known Contacts In AI Guide Context

- `includeKnownContacts: true` activado en los prompts de mediación: `mediation.understand_request` y `mediation.clarify`.
- `ProcessChannelInboundMessage` obtiene contactos desde `ContactDirectory.findAll()`, formateados como `"Name (id: cid)"`, y los pasa en el `AiGuideInput` al `AiGuideService`.
- `ContextBuilder` renderiza sección "Contactos conocidos" en el `userPrompt` cuando `includeKnownContacts: true` y `knownContacts` no está vacío.
- Solo prompts de mediación reciben contactos. `conversation.reply` y `risk.review` los excluyen por minimización de datos y privacidad.
- Los contactos NO resuelven automáticamente ambigüedad de destinatario en mediación — esa responsabilidad sigue en `ContactDirectory` / `ResolveContact`.
- Graceful degradation: si `ContactDirectory` no está disponible, la mediación funciona sin contactos (sin errores).
- Tests actualizados: context-policy (3 tests modificados), execution-pipeline (4 tests nuevos), process-channel-inbound-message (7 tests nuevos).
- Documentación: `docs/ai-guide-prompts.md` actualizado con tabla ContextPolicy y nota T28.

## Implemented In T29: OpenAI-Compatible LLM Provider

- `AppEnv` expanded with `aiProvider`, `aiBaseUrl`, `aiApiKey`, `aiModel`, `aiTimeoutMs` fields in `apps/core/src/config/env.ts`.
- `OpenAICompatibleLlmProvider` in `apps/core/src/modules/ai-guide/infrastructure/openai/` — implements `LlmProvider` port using native `fetch` (zero npm deps).
- Communicates with any OpenAI-compatible chat completions API (OpenAI, OpenRouter, Ollama, LiteLLM) via `POST /chat/completions`.
- Factory `createLlmProvider(env)` in `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts` selects `MockLlmProvider` or `OpenAICompatibleLlmProvider` based on `AI_PROVIDER` env var.
- Env validation: `AI_PROVIDER=openai-compatible` requires `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`; missing vars throw clear errors. API key never appears in error messages.
- `ExecutionPipeline` constructor now accepts `providerName` and `configuredModel` (no hardcoded `"mock"` or `"mock-model-v1"`).
- `createInMemoryPipeline()` accepts optional `llmProvider`, `providerName`, `configuredModel` params (backward compatible — defaults to mock).
- `server.ts` wires provider from env via factory.
- New tests: env config (20 tests), provider unit (19 tests), factory (5 tests), integration (6 tests). All existing tests updated for new constructor params.
- Documentation: `.env.example`, `README.md`, `apps/core/README.md`, `docs/project-status.md`, `docs/open-questions.md`, `docs/ai-guide-prompts.md`, `docs/simulation-api.md` updated.
- **Default stays mock** — no real API calls unless explicitly configured via env vars.
- OutputContract validation runs regardless of provider (mock or real).

## Implemented In T30A: Post-T29 Local Readiness + Docs/Spec Sync

- `SERENA_INTERNAL_TOKEN` local setup documented in `.env.example` and mapped into the `serena-core` service in `docker-compose.yml`.
- `/internal/pipeline/process` now validates `receivedAt` as a strict UTC ISO timestamp before executing the orchestrator. Invalid timestamps return 400 using the existing `invalid_payload` error format.
- `gateway-wa` now applies a configurable timeout (`GATEWAY_CORE_TIMEOUT_MS`, default 30000ms) when calling Serena Core.
- `gateway-wa` validates successful Core responses as known `PipelineResult` variants with required field types, instead of casting arbitrary JSON.
- `gateway-wa` mock events now require strict UTC ISO timestamps before any HTTP call.
- Current-state specs added for `openai-compatible-provider` and `provider-selection-config` under `openspec/specs/`.
- T29 change artifacts archived under `openspec/changes/archive/t29-openai-compatible-llm-provider/` with `CLOSURE.md`.
- Tests: 578 passing (519 core + 59 gateway-wa). `npm run check` passes.

## Implemented In T30B: Structural Cleanup

- `@serena/contracts` workspace package at `packages/contracts/` — single source of truth for `PipelineResult` (8 variants), `PipelineInput`, and `PipelineResult` union. Pure TypeScript types, zero dependencies, consumed by both `@serena/core` and `@serena/gateway-wa` via barrel re-exports.
- `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` now re-exports from `@serena/contracts` (preserves backward compatibility for all 5+ internal consumers).
- `apps/gateway-wa/src/domain/pipeline-result.ts` now re-exports from `@serena/contracts` (removed "COPIED from" header and inline type definitions — was 104 lines, now 13 lines).
- New `channel-inbound` module at `apps/core/src/modules/channel-inbound/`:
  - `application/use-cases/process-channel-inbound-message.ts` — moved from `inbound-gate`, class body unchanged, import paths updated for new location.
  - `application/results/resolved-inbound-actor.ts` — moved from `inbound-gate`, byte-for-byte identical copy.
- 15 import-update files across core (server.ts, bootstrap/, inbound-gate/application, inbound-gate/infrastructure, inbound-gate/tests).
- Zero behavior changes — all 578 tests pass identically. Typecheck passes for core, gateway-wa, and scripts.

## Expected Next Task

After T40: deploy `gateway-wa` staging privately and run non-destructive internal smoke checks before any Evolution startup, public route, WhatsApp pairing, or real message delivery.

### Repository note
Este repositorio es el centro operativo del proyecto. Contiene documentación técnica (`docs/architecture/`) y operativa (`docs/ops/`) con datos reales de VPS, deploy, rutas de Caddy y backups. Debe hacerse privado antes de uso productivo o exposición pública prolongada.
