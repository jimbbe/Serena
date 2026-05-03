# Open Questions

These questions are intentionally left open until a task needs the decision.

## Product And Safety

- How is the allowed contact list defined, stored and reviewed?
- What exact user intents should trigger a mediated WhatsApp message?
- When should Serena summarize a response and when should it quote literally?
- What escalation path exists if a message suggests risk, confusion or urgency?
- What audit trail is required for mediated messages?

## Technical

- Where should Go be introduced first, if at all?
- Should each Go service use its own `go.mod`, or should the repo use a Go workspace later?
- Which Node package manager should be standardized if npm stops being enough?
- What migration tool should be used for PostgreSQL?

## Architecture (T10 Open Questions)

- **Which WhatsApp number will Serena use?** — Needs a real WhatsApp Business API number. Currently only contracts exist for `whatsapp-gateway`.
- **One-session-per-pair rule details** — The `SessionResolver` port expects to resolve one active session per participant pair. Edge cases: what if the pair has a historical closed session and starts a new one? Should closed sessions be archived or deleted?
- **Evolution API hosting** — Where will the Evolution API instance run? On the same VPS? Separate service? The `whatsapp-gateway` adapter will need this URL.
- **Persistence strategy** — Current modules use in-memory stores. When do we switch to PostgreSQL? Should we implement repositories alongside in-memory adapters, or defer the real DB until after the pipeline works end-to-end?

## Architecture (T17A / T17B Open Questions)

Estas preguntas surgieron durante el diseno del contrato WhatsApp Gateway (T17A) y hardening interno (T17B):

- **¿Donde vivira el Gateway?** — Decidido en T10: repo separado (`whatsapp-gateway`). Pregunta abierta: ¿el codigo de mapeo (`mapPipelineResultToGatewayAction`) se duplicara en el Gateway o se compartira via un package?
- **¿El Gateway sera multi-proyecto / multi-numero?** — La arquitectura T10 preve que si. Pregunta abierta: ¿como se configura el ruteo de webhooks por instancia?
- **¿Como se manejaran reintentos?** — Recomendacion inicial: exponential backoff con jitter, maximo 3 intentos, circuit breaker despues de 5 fallos consecutivos. Pregunta abierta: ¿el Gateway debe reintentar o Serena Core debe exponer un endpoint de reintento?
- **¿Habra cola de mensajes / event bus en el futuro?** — Para produccion con volumen, se podria introducir una cola entre el Gateway y Serena Core. Pregunta abierta: ¿esto es necesario para MVP o es premature optimization?
- **¿El Gateway debe notificar a la persona mayor cuando un mensaje produce `no_auto_send`?** — Por ahora no. En el futuro, `recipient_not_found` y `mediation_not_understood` podrian generar una respuesta automatica pidiendo aclaracion. Pregunta abierta: ¿esto es responsabilidad del Gateway o de Serena Core?

## Idempotencia — Preguntas Pendientes (T17B+)

Idempotencia in-memory implementada en T17B. Preguntas abiertas para T18/T19:

- **¿Donde se almacena el cache durable de `messageId` procesados?** — Opciones: PostgreSQL (tabla `processed_messages`) o Redis (SET con TTL).
- **¿Key de deduplicacion multi-proveedor/multi-instancia?** — La key actual es solo `messageId`. Para soportar multiples proveedores o instancias Evolution API, conviene una key compuesta: `provider + instanceId + messageId`.
- **¿Politica de retencion/TTL?** — ¿Cuanto tiempo se retienen los mensajes procesados? ¿24h, 7d, indefinido? Depende del volumen esperado y del caso de uso.
- **¿Comportamiento ante replay legitimo o reintentos tardios?** — Si un mensaje se reintenta dias despues, ¿debe considerarse duplicado o nuevo? La key compuesta + TTL ayuda a definir esta politica.

## Operaciones y Seguridad del Repositorio (T18.1+)

- **¿Cuando pasar el repositorio a privado?** — Por ahora contiene IPs reales, hostnames, rutas de Caddy, backups y datos de VPS que OpenCode usa para operar. Debe hacerse privado antes de uso productivo o exposicion publica prolongada. ¿Cual es el disparador concreto (primer mensaje real, primer deploy productivo del gateway, etc.)?
- **¿Persistencia durable para sesiones?** — Las sesiones de mediacion (`MediationBridgeSessionStore`) y la idempotencia (`ProcessedMessageStore`) son in-memory. Se pierden al reiniciar. ¿Cuando migrar a PostgreSQL/Redis? ¿Conviene hacerlo junto con los adapters PostgreSQL de T19?

## Estrategia de Integracion Futura

- **¿Estrategia PostgreSQL concreta?** — T19 preve PostgreSQL adapters. Preguntas abiertas: ¿schema por modulo o unico? ¿migraciones con que herramienta? ¿repo pattern con interfaces separadas de los puertos de dominio?
- **¿Estrategia Evolution API?** — T19/T20 preve integracion con Evolution API. Preguntas: ¿instancia dedicada o compartida? ¿como manejar webhooks entrantes (autenticacion, rate limiting)? ¿el mock gateway T18 se mantiene como herramienta de testing?
- **¿Futuro repo separado para WhatsApp Gateway real?** — La arquitectura T17A preve un repo `whatsapp-gateway` independiente. ¿Cuando crear ese repo? ¿que codigo se mueve/duplica? ¿el mock gateway T18 migra a ese repo o queda en Serena como herramienta de desarrollo?
- **¿Integracion futura de IA/LLM?** — El strategy actual es rules-first para mediation-understanding, LLM como fallback. ¿Cuando integrar LLM? ¿que proveedor? ¿que politicas de privacidad/costo aplican para el caso de uso de una persona mayor?

## Politicas de Revision Humana

- **¿Politica de revision humana para `risk_review_required`?** — El pipeline produce `risk_review_required` cuando detecta senales de riesgo/urgencia. ¿Quien revisa estos casos? ¿Con que frecuencia? ¿Hay un SLA?
- **¿Politica de revision humana para `ambiguous_active_session`?** — Cuando hay multiples sesiones activas para el mismo par, el pipeline produce `ambiguous_active_session`. ¿Como se resuelve? ¿Manual por un operador? ¿La persona mayor decide?
- **¿Manejo de mensajes ambiguos?** — `mediation_not_understood` y `recipient_not_found` requieren aclaracion. ¿Serena debe responder automaticamente pidiendo clarificacion? ¿O se escala a revision humana?
- **¿Manejo de contactos ambiguos?** — Si hay dos contactos con nombres similares (ej. "Maria" y "Maria Jose"), ¿como se resuelve la ambiguedad en `ResolveContact`?

## Infrastructure

- No open T04 infrastructure preflight questions remain. SSH, DNS, Docker/Compose, external network `proxy`, `/docker/serena` write access and Caddy backup were confirmed during T04.

## Verified In T03.1

- VPS identity: Hostinger VPS `1619520`, hostname `srv1619520.hstgr.cloud`, IPv4 `177.7.32.90`, IPv6 `2a02:4780:75:6109::1`.
- Active Caddy compose path: `/docker/caddy-edge/docker-compose.yml`.
- Active Caddy config source inside the container: `/config-src/Caddyfile`, generated by `caddyfile-writer`.
- No Serena project/container/route was observed.
- Caddy backup was not created in T03.1 because SSH authentication was still blocked at that point.

## Resolved In T04

- SSH access: `root@177.7.32.90` works for deploy operations.
- DNS: `serena.goingmerry01.tech` points to `177.7.32.90`.
- Docker/Compose: verified OK on the VPS for the Serena deploy.
- Docker network: external network `proxy` verified OK.
- Deployment path: `/docker/serena` is writable and hosts the Serena stack.
- Caddy backup: base backup exists at `/docker/backups/serena-t04-20260501-135202`; route backup exists at `/docker/backups/serena-t04-20260501-135202/caddy-edge-docker-compose.yml.route-and-caddy-20260501-142401.bak`.
- Public route: `https://serena.goingmerry01.tech/health` returns HTTP 200 through Caddy.

## Prepared In T03

- Deployment target/path: `serena-core` Compose project on the VPS, attached to external Docker network `proxy`, routed by existing Caddy edge. T04 also added private `serena-postgres` on `serena-internal`.
- Rollback process: stop the `serena-core` Compose project, revert the Serena Caddy route, reload Caddy, and inspect Caddy/app logs.

## Resolved In T02

- Local default ports: `CORE_PORT=3000` maps to the core container port `3000`; `POSTGRES_PORT=5432` maps to the PostgreSQL container port `5432`.
- Baseline environment variable names: `APP_ENV`, `NODE_ENV`, `CORE_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`.