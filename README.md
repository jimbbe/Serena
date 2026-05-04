# Serena

Serena es un proyecto de acompañamiento conversacional para una persona mayor.

La Fase 1 apunta a mediacion prudente por WhatsApp: Serena recibe un pedido, identifica si corresponde enviar un recado a un contacto permitido, redacta con prudencia, espera respuesta y devuelve una sintesis o una cita literal cuando haya ambiguedad.

## Estado Actual

El repositorio tiene stack base desplegado en VPS (T04), arquitectura MVP definida (T10), modulos de logica de negocio implementados con testing (T06-T09, T11-T15), endpoint HTTP interno expuesto (T16), contrato WhatsApp Gateway especificado (T17A), hardening interno completado (T17B), mock WhatsApp Gateway / dry-run adapter (T18), documentacion reorganizada (T18.1), modulo ai-guide con pipeline de ejecucion agnostico de LLM (T19), canal inbound channel-agnostic con resolucion de identidad externa (T20), Simulation API con single-step y scenario runner multi-step, e historial de conversacion activo en AI guide (T27). **485 tests pasando** (447 core + 38 gateway-wa).

## 🔒 Centro Operativo del Proyecto

Este repositorio funciona como centro operativo del proyecto Serena. Contiene documentacion tecnica y operativa real de VPS, deploy, rutas de Caddy, backups, y configuracion de infraestructura.

⚠️ **IMPORTANTE:** Este repositorio debe hacerse privado antes de uso productivo o exposicion publica prolongada. Por ahora se mantienen IPs reales, hostnames, rutas y comandos de deploy porque OpenCode los usa para operar.

### Donde encontrar cada cosa

| Seccion | Ubicacion |
|---------|-----------|
| Arquitectura y diseno | `docs/architecture/` |
| Operacion, deploy y VPS | `docs/ops/` |
| Estado del proyecto | `docs/project-status.md` |
| Preguntas abiertas | `docs/open-questions.md` |

### Lo que existe hoy

**Infraestructura (T02-T04):**

- Docker Compose local con `postgres` y `serena-core`
- Stack VPS en `/docker/serena` con `serena-core` y `serena-postgres` healthy
- Ruta publica activa `https://serena.goingmerry01.tech/health` via Caddy
- Workspace Node.js/TypeScript con estructura modular (apps/, packages/, docs/, scripts/)
- `npm run check` valida estructura y typecheck sin levantar servicios

**Logica de negocio implementada con tests (modulos bajo `apps/core/src/modules/`):**

- **inbound-gate** (T06-T08): evalua mensajes entrantes, aplica politicas de acceso con trazabilidad, audita decisiones y rutea a perfiles de procesamiento segun el contenido (conversational, mediation_understanding, risk_review, discard). 34 tests.
- **mediation-bridge** (T09): gestiona el ciclo de vida de sesiones de mediacion (inicio, turnos remitente-destinatario, cierre), con store in-memory. Introduce formato de primer borrador con presentacion de Serena. 8 tests.
- **contact-directory** (T11): dominio de contactos, puerto `ContactDirectory`, adapter in-memory con datos semilla, use case `ResolveContact`. 17 tests.
- **mediation-understanding** (T12): dominio `MediationRequest`, puerto `MediationUnderstanding`, extraccion basada en reglas con patrones en espanol, use case `ExtractMediationRequest`. 18 tests.
- **prudent-rewording** (T13): dominio `RewordingContext`, puerto `PrudentRewording`, adapter de templates `IndirectRewording`, use case `RewordMessage`. 15 tests.
- **session-manager** (T14): dominio `SessionResolution` con variantes explicitas, puerto `ActiveSessionQuery`, adapter in-memory, use case `ResolveSession`. Lookup order-independent, sesiones cerradas ignoradas, ambiguedad explicita. 16 tests.
- **T10 MVP Architecture**: documento `docs/architecture/t10-mvp-architecture.md` define la arquitectura Clean/Hexagonal de la Fase 1, flujo completo de mediacion prudente, y los modulos requeridos para MVP.

**Contratos y especificaciones:**

- **T17A — WhatsApp Gateway Contract**: `docs/architecture/t17a-whatsapp-gateway-contract.md` define el contrato completo entre Serena Core y el futuro WhatsApp Gateway. Incluye tipos (`NormalizedWhatsAppInboundMessage`, `WhatsAppGatewayAction`), funcion de mapeo pura (`mapPipelineResultToGatewayAction`) con 15 tests, politica de envio futuro, idempotencia y seguridad documentadas. Sin integracion real todavia.
- **whatsapp-gateway**: tiene tipo `IncomingWhatsAppMessage` y puerto `WhatsAppGateway`; falta integracion real con Evolution API.

**Modulos con pipeline implementado:**

- **orchestrator** (T15): caso de uso `ProcessIncomingWhatsAppMessage` que conecta inbound-gate → mediation-understanding → contact-directory → session-manager → mediation-bridge → prudent-rewording. Devuelve `PipelineResult` con variantes explicitas. 11 tests end-to-end in-memory.
- **internal-pipeline-http** (T16): endpoint `POST /internal/pipeline/process` que valida JSON, ejecuta el pipeline orchestrator y devuelve `PipelineResult`. Factory in-memory con dependencias compartidas para continuidad de sesiones entre requests. Con hardening (auth token + idempotencia). Ver `docs/architecture/t16-internal-pipeline-http.md`.
- **ai-guide** (T19): modulo Clean/Hexagonal completamente agnostico de cualquier LLM provider. Incluye `UseCaseRegistry`, `ExecutionPipeline` con retry loop, `AiGuideService`, y contratos pre-definidos (`conversation.reply`, `risk.review`, `mediation.understand_request`). 28 tests con `MockLlmProvider` deterministico. Sin dependencia de otros modulos Serena.
- **channel-agnostic inbound** (T20): `InboundMessageCommand` normaliza mensajes de cualquier canal (whatsapp, voice, web_chat, telegram, system, simulation) en un solo contrato. `ProcessChannelInboundMessage` ejecuta el pipeline completo con resolucion de identidad → inbound gate → AI guide → `ChannelInboundResult`. La resolucion de identidad corre ANTES del gate.
- **external identity resolution** (T20): `ExternalIdentityResolver` traduce identificadores externos de canal a identidad interna (`personId`, `role`, `authorized`). Bloquea actores bloqueados antes del gate. Soporta multi-canal: mismo `personId` puede llegar por WhatsApp, voz o web_chat. Adapter in-memory con seed data (Marta en 3 canales).

**Mock WhatsApp Gateway (T18):**
- `apps/gateway-wa/` workspace con mock gateway / dry-run adapter. Simula el flujo completo del WhatsApp Gateway sin enviar mensajes reales (`sent: false`). Copia tipos del contrato T17A. 38 tests con fake `fetch`. Sin dependencias npm externas. Ver `docs/architecture/t18-mock-whatsapp-gateway.md`.

**Simulation API (T20):**
- Endpoint `POST /dev/simulate/inbound-message` — ejecuta el pipeline completo (inbound gate → AI guide) con mock LLM, sin WhatsApp real ni envio de mensajes. Devuelve traza completa: identidad resuelta, decision del gate, perfil LLM, resultado del AI guide. Solo habilitado con `ENABLE_SIMULATION_ENDPOINTS=true`.
- Endpoint `POST /dev/simulate/scenario` — scenario runner multi-step. Ejecuta secuencias de pasos con estado compartido in-memory (sesiones persisten entre pasos). Soporta multi-actor, stopOnError, merge de metadata. Devuelve resultados por paso + summary agregado.
- Ver `docs/simulation-api.md` para contrato completo, ejemplos curl y limitaciones.

**Hardening interno (T17B):**

- **Autenticacion por token**: `X-Serena-Internal-Token` header requerido en `/internal/*`. Token via `SERENA_INTERNAL_TOKEN` env var. 401/403/500 segun error. Health publico.
- **Idempotencia**: `messageId` en payload; `ProcessedMessageStore` in-memory evita re-ejecucion de mensajes duplicados. `duplicate: true` en respuesta HTTP.
- **CI**: GitHub Actions workflow en `.github/workflows/ci.yml` (PR/push a main, Node 22, check + test).
- Ver `docs/architecture/t17b-internal-hardening.md`.

### Pipeline actual

El flujo conceptual de procesamiento de un mensaje entrante:

```
InboundMessageCommand                     # comando channel-agnostic (whatsapp, voice, web_chat, ...)
  → ExternalIdentityResolver.resolve()    # traduce externalSenderId → personId/role/authorized
  → [bloqueado? → short-circuit]          # identidades bloqueadas no pasan al gate
  → ProcessChannelInboundMessage          # use case coordinador
    → ProcessInboundMessage               # inbound gate: evalua, decide, rutea
    → profileToUseCaseId                  # mapea perfil LLM → use case AI guide
    → AiGuideService.execute()            # ejecuta AI guide (mock deterministico en dev)
  → ChannelInboundResult                  # traza completa: identity, decision, guideResult, errores
```

- **WhatsApp sera un adapter futuro real**: el core no depende de WhatsApp. El `InboundMessageCommand` acepta cualquier canal. Cuando se integre Evolution API / Baileys, un `WhatsAppAdapter` normalizara el payload de WhatsApp a `InboundMessageCommand` y lo pasara al pipeline. El mock `gateway-wa` (T18) ya simula ese flujo.
- **La Simulation API** (`POST /dev/simulate/inbound-message` y `POST /dev/simulate/scenario`) ejecuta exactamente este pipeline sin mensajes reales, sin WhatsApp real y sin LLM real.
- Ver `docs/simulation-api.md` para el contrato completo de los endpoints de simulacion.

### Lo que no existe todavia

- WhatsApp / Evolution API / Baileys real (solo contrato T17A y mock T18)
- LLM provider real (OpenAI / OpenRouter); solo `MockLlmProvider` deterministico
- Envio real de mensajes (el pipeline produce resultados, no envia; el mock simula `sent: false`)
- Persistencia real de conversaciones (todo es in-memory, se pierde en restart)
- Conexion real a PostgreSQL desde la aplicacion (stores in-memory)
- Panel web / dashboard
- Scheduler / cron real para tareas periodicas

## Forma De Trabajo

El proyecto se trabaja con tres roles:

- Hermes / Estoicus define tareas, alcance, criterios de exito y prompts.
- OpenCode implementa tareas chicas, versionadas y testeables.
- Marco ejecuta OpenCode, prueba el resultado y valida antes de pasar a la siguiente tarea.

Reglas de trabajo:

- no asumir contexto que no este en el repositorio local
- mantener cambios chicos, claros y reversibles
- documentar preguntas abiertas en vez de resolverlas por intuicion
- no hardcodear secretos
- no mezclar bootstrap con features de producto
- no desplegar infraestructura hasta que exista una tarea especifica

## Stack Base

Stack decidido para el arranque:

- Node.js + TypeScript para servicios de producto, APIs, tooling web, paneles e integraciones con SDKs cuando convenga velocidad de desarrollo.
- Go como opcion para servicios simples, workers, gateways/adapters o componentes donde convenga robustez, concurrencia o despliegue binario simple.
- PostgreSQL como base de datos prevista.
- Docker / Docker Compose como base de contenedores prevista.
- Arquitectura modular y containerizada.

Todavia no esta decidido que modulo va en Node.js/TypeScript y cual va en Go. Esa decision se debe tomar por tarea y documentar cuando haya una razon tecnica concreta.

## Estructura

```text
apps/
  core/          # nucleo de producto: inbound-gate, mediation-bridge, contact-directory, mediation-understanding, prudent-rewording, session-manager, ai-guide, orchestrator, internal-pipeline, whatsapp-gateway (contrato)
  gateway-wa/    # mock WhatsApp gateway / dry-run adapter (T18)
  panel/         # placeholder para futuro panel, si corresponde
packages/
  shared/        # tipos, contratos y utilidades compartidas no acopladas a infraestructura
infra/           # infraestructura local (T02) y VPS (T03-T04)
docs/            # documentacion: estado (project-status), preguntas abiertas (open-questions), arquitectura (architecture/) y operaciones (ops/)
tests/           # pruebas transversales o de aceptacion cuando existan
scripts/         # tooling local del repositorio
```

## Node.js / TypeScript

El root contiene un `package.json` privado con workspaces para `apps/*` y `packages/*`.

Por ahora no se agregan dependencias externas. El objetivo es dejar una base ordenada sin fijar frameworks antes de tiempo.

Archivos relevantes:

- `package.json` define scripts minimos del workspace.
- `tsconfig.base.json` define una base estricta para futuros modulos TypeScript.
- `scripts/check-structure.ts` valida que la estructura inicial exista.

## Go

Go queda disponible para modulos futuros, pero no se crea `go.mod` todavia.

Motivo: no hay servicio Go concreto ni ruta de modulo decidida. Crear un `go.mod` ahora fijaria una decision tecnica prematura. Cuando una tarea defina un modulo Go, deberia crearse su `go.mod` en el directorio del servicio o en la ubicacion que se justifique en ese momento.

## Configuracion Local

Crear un `.env` local a partir de `.env.example` para personalizar puertos o credenciales locales de desarrollo.

No se deben commitear secretos.

## Entorno Local Con Docker Compose (T02)

La raiz del repo ahora incluye `docker-compose.yml` con:

- `postgres` (PostgreSQL local con volumen nombrado persistente)
- `serena-core` (servicio Node.js/TypeScript en `apps/core`)

### Levantar

```sh
docker compose up --build
```

### Verificar health

```sh
curl http://localhost:3000/health
```

Respuesta esperada (ejemplo):

```json
{"status":"ok","service":"serena-core","environment":"local"}
```

### Apagar

```sh
docker compose down
```

Para borrar tambien el volumen persistente local de PostgreSQL:

```sh
docker compose down -v
```

Nota: dentro de Docker Compose, `DATABASE_URL` usa el hostname `postgres`. Para herramientas ejecutadas desde la maquina host, usar `localhost` con `POSTGRES_PORT`.

## Verificacion

Ejecutar:

```sh
npm run check
```

Ese comando valida la estructura base sin levantar servicios ni requerir dependencias externas.

## Despliegue VPS Preparado (T03)

T03 deja documentado y versionado el camino de despliegue para `serena-core`, sin tocar produccion:

- `docs/ops/deployment-t03.md` describe estrategia, preflight, comandos de deploy, verificacion y rollback.
- `infra/vps/docker-compose.yml` definia el camino inicial de `serena-core` detras de Caddy, unido a la red externa `proxy` y sin puertos host. T04 lo extendio con PostgreSQL privado.
- `infra/vps/Caddyfile.serena.example` contiene solo la ruta futura `serena.goingmerry01.tech -> serena-core:3000`.

## Preflight VPS Real (T03.1)

T03.1 releva la VPS real sin hacer deploy:

- `docs/ops/deployment-t03-1-preflight.md` consolida inventario, DNS, Caddy/proxy, comandos de deploy/verify/rollback y bloqueos.
- VPS confirmada: `srv1619520.hstgr.cloud` / `177.7.32.90`.
- Caddy confirmado en `/docker/caddy-edge/docker-compose.yml`.
- Los bloqueos de SSH, DNS, Docker/Compose, `proxy` y backup quedaron resueltos durante T04.

## Despliegue VPS Base (T04)

T04 dejo operativo el stack base en la VPS:

- path remoto: `/docker/serena`
- servicios: `serena-core` healthy y `serena-postgres` healthy
- redes: `serena-core` en `proxy` + `serena-internal`; `serena-postgres` solo en `serena-internal`
- sin host ports publicados por Serena
- ruta publica: `https://serena.goingmerry01.tech/health`
- Caddy valida y recarga correctamente con la ruta `serena.goingmerry01.tech -> serena-core:3000`

Runbook operativo: `docs/ops/deployment-t04.md`.

## Proximos Pasos

Fase completada: **logica de negocio con pipeline channel-agnostic** (T06-T27). Pipeline end-to-end funciona con 485 tests (447 core + 38 gateway-wa). Endpoint HTTP interno con hardening (T17B), AI guide agnostico (T19), canal inbound multi-channel con resolucion de identidad (T20), Simulation API con single-step y scenario runner, e historial de conversacion activo en AI guide (T27).

**Proximo paso inmediato**: **scenario runner multi-step para simulaciones conversacionales** — el endpoint `POST /dev/simulate/scenario` ya existe. El foco inmediato es robustecerlo con mas escenarios de prueba y cobertura de edge cases.

**Despues**: decidir entre dos caminos:

1. **Persistencia conversacional** — reemplazar stores in-memory con PostgreSQL adapters para que sesiones, contactos y auditoria sobrevivan restarts.
2. **Adapter WhatsApp real** — integrar Evolution API / Baileys como adapter de canal real, respetando el contrato T17A y sin acoplar el core a WhatsApp.

La decision depende de si queremos primero produccion real (WhatsApp) o primero datos durables (PostgreSQL).

Ver tambien:

- `docs/project-status.md`
- `docs/open-questions.md`
- `docs/simulation-api.md`
- `docs/architecture/t10-mvp-architecture.md`
- `docs/architecture/t17a-whatsapp-gateway-contract.md`
- `docs/ops/deployment-t04.md` (runbook operativo actual)