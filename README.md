# Serena

Serena es un proyecto de acompañamiento conversacional para una persona mayor.

La Fase 1 apunta a mediacion prudente por WhatsApp: Serena recibe un pedido, identifica si corresponde enviar un recado a un contacto permitido, redacta con prudencia, espera respuesta y devuelve una sintesis o una cita literal cuando haya ambiguedad.

## Estado Actual

El repositorio tiene el stack base desplegado en la VPS (T04), la arquitectura MVP definida (T10), modulos de logica de negocio implementados con testing (T06-T09, T11-T15), y endpoint HTTP interno expuesto (T16) que permite invocar el pipeline orchestrador via `POST /internal/pipeline/process`.

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
- **T10 MVP Architecture**: documento `docs/t10-mvp-architecture.md` define la arquitectura Clean/Hexagonal de la Fase 1, flujo completo de mediacion prudente, y los modulos requeridos para MVP.

**Solo contratos (sin implementacion aun):**

- **whatsapp-gateway**: tiene tipo `IncomingWhatsAppMessage` y puerto `WhatsAppGateway`; falta integracion real.

 **Modulos con pipeline implementado:**

- **orchestrator** (T15): caso de uso `ProcessIncomingWhatsAppMessage` que conecta inbound-gate → mediation-understanding → contact-directory → session-manager → mediation-bridge → prudent-rewording. Devuelve `PipelineResult` con variantes explicitas. 11 tests end-to-end in-memory.
- **internal-pipeline-http** (T16): endpoint `POST /internal/pipeline/process` que valida JSON, ejecuta el pipeline orchestrator y devuelve `PipelineResult`. Factory in-memory con dependencias compartidas para continuidad de sesiones entre requests. 14 tests HTTP integrados. Ver `docs/t16-internal-pipeline-http.md`.

### Lo que no existe todavia

- Conexion real a PostgreSQL desde la aplicacion (los modulos actuales usan stores in-memory)
- Integracion con WhatsApp / Evolution API
- Panel web
- Envio real de mensajes (el pipeline produce drafts/intenciones, no envia)

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
  core/          # nucleo de producto: inbound-gate, mediation-bridge, contact-directory, mediation-understanding, prudent-rewording, session-manager, + contratos
  gateway-wa/    # placeholder para futuro gateway/adaptador WhatsApp
  panel/         # placeholder para futuro panel, si corresponde
packages/
  shared/        # tipos, contratos y utilidades compartidas no acopladas a infraestructura
infra/           # infraestructura local (T02) y VPS (T03-T04)
docs/            # estado, arquitectura, decisiones, preguntas abiertas y runbooks
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

- `docs/deployment-t03.md` describe estrategia, preflight, comandos de deploy, verificacion y rollback.
- `infra/vps/docker-compose.yml` definia el camino inicial de `serena-core` detras de Caddy, unido a la red externa `proxy` y sin puertos host. T04 lo extendio con PostgreSQL privado.
- `infra/vps/Caddyfile.serena.example` contiene solo la ruta futura `serena.goingmerry01.tech -> serena-core:3000`.

## Preflight VPS Real (T03.1)

T03.1 releva la VPS real sin hacer deploy:

- `docs/deployment-t03-1-preflight.md` consolida inventario, DNS, Caddy/proxy, comandos de deploy/verify/rollback y bloqueos.
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

Runbook operativo: `docs/deployment-t04.md`.

## Proximos Pasos

Fase completada: **logica de negocio con adaptadores in-memory** (T06-T16). Pipeline end-to-end funciona con 140 tests y endpoint HTTP interno expuesto.

Proxima fase (T17+): **infraestructura real**:

- **T17**: WhatsApp Gateway — repo separado, servicio agnostico multi-proyecto, multi-numero
- **T18**: Serena WhatsApp adapter — conectar serena-core a WhatsApp Gateway
- **T19**: PostgreSQL adapters — reemplazar stores in-memory
- **T20**: VPS deployment update — WhatsApp Gateway + Serena detras de Caddy

Ver tambien:

- `docs/project-status.md`
- `docs/open-questions.md`
- `docs/t10-mvp-architecture.md`
- `docs/deployment-t04.md` (runbook operativo actual)