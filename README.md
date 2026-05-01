# Serena

Serena es un proyecto de acompañamiento conversacional para una persona mayor.

La Fase 1 apunta a mediacion prudente por WhatsApp: Serena recibe un pedido, identifica si corresponde enviar un recado a un contacto permitido, redacta con prudencia, espera respuesta y devuelve una sintesis o una cita literal cuando haya ambiguedad.

## Estado Actual

Este repositorio esta en bootstrap inicial con el stack base ya desplegado en la VPS para T04.

Lo que existe hoy:

- estructura base para aplicaciones, paquetes compartidos, infraestructura, tests y scripts
- documentacion inicial del stack, forma de trabajo y preguntas abiertas
- workspace Node.js/TypeScript preparado sin logica de negocio
- espacio reservado para modulos Go, sin fijar todavia una ruta de modulo Go
- Docker Compose local T02 con `postgres` y `serena-core`
- templates T03 para desplegar `serena-core` detras del Caddy edge del VPS
- preflight T03.1 de VPS documentado
- despliegue T04 aplicado en `/docker/serena` con `serena-core` y `serena-postgres` healthy
- ruta publica activa `https://serena.goingmerry01.tech/health` via Caddy

Lo que no existe todavia:

- logica conversacional de Serena
- integracion con WhatsApp
- panel web
- features productivas mas alla del healthcheck
- conexion real a PostgreSQL desde la aplicacion

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
  core/          # futuro nucleo de producto y casos de uso
  gateway-wa/    # futuro gateway/adaptador WhatsApp
  panel/         # placeholder para futuro panel, si corresponde
packages/
  shared/        # tipos, contratos y utilidades compartidas no acopladas a infraestructura
infra/           # infraestructura local y templates de despliegue
docs/            # estado, decisiones y preguntas abiertas
tests/           # pruebas transversales o de aceptacion cuando existan
scripts/         # tooling local del repositorio
```

## Node.js / TypeScript

El root contiene un `package.json` privado con workspaces para `apps/*` y `packages/*`.

Por ahora no se agregan dependencias externas. El objetivo es dejar una base ordenada sin fijar frameworks antes de tiempo.

Archivos relevantes:

- `package.json` define scripts minimos del workspace.
- `tsconfig.base.json` define una base estricta para futuros modulos TypeScript.
- `scripts/check-structure.mjs` valida que la estructura inicial exista.

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

El siguiente paso deberia ser definir la primera funcionalidad de producto o la conexion real de la aplicacion a PostgreSQL, sin mezclarlo con cambios de infraestructura.

Ver tambien:

- `docs/project-status.md`
- `docs/open-questions.md`
- `docs/deployment-t03.md`
- `docs/deployment-t03-1-preflight.md`
- `docs/deployment-t04.md`
