# Project Status

## Current Phase

Serena has the base VPS stack deployed (T04), MVP architecture defined (T10), and business logic modules implemented with testing (T06-T09, T11-T14). The next milestone is the Orchestrator pipeline that wires all modules end-to-end.

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

- Orchestrator module (only `PipelineResult` and `PipelineInput` types with documentation of the planned pipeline exist; no pipeline logic or use case yet).
- WhatsApp / Evolution API real integration (`whatsapp-gateway` has only domain types and port contract).
- PostgreSQL connection usage in application code (current modules use in-memory stores).
- HTTP API beyond `/health` (no business endpoints exist).
- Panel UI.

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

- Documento `docs/t10-mvp-architecture.md` define la arquitectura Clean/Hexagonal de la Fase 1.
- Flujo completo de mediacion prudente: inbound-gate → session-manager → contact-directory → mediation-understanding → prudent-rewording → mediation-bridge → whatsapp-gateway.
- Separacion de capas: domain (tipos puros), application (puertos, use cases), infrastructure (adapters concretos).
- Modulos definidos como necesarios para MVP: inbound-gate, session-manager, contact-directory, mediation-understanding, prudent-rewording, mediation-bridge, orchestrator, whatsapp-gateway.
- Preguntas abiertas de arquitectura registradas en `docs/open-questions.md`.

## Implemented In T11: Contact Directory

- Domain: `Contact` (id, displayName, whatsappId, allowed).
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

## Expected Next Task

Integrar los modulos implementados en el pipeline del **orchestrator**:
1. `OrchestratorPort` — define la interfaz del caso de uso
2. `MediationPipeline` use case — conecta inbound-gate → mediation-understanding → contact-directory → session-manager → mediation-bridge → prudent-rewording → whatsapp-gateway port
3. Integration tests cubriendo el happy path y casos de error

Despues de orchestrar, conectar infraestructura real: WhatsApp/Evolution API, PostgreSQL adapters, HTTP API endpoints.