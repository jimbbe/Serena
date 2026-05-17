## Exploration: T41 — Evolution API readiness para Serena

### Current State
`apps/gateway-wa` ya soporta modo `production` con Evolution API, corre como gateway HTTP separado y mantiene el boundary correcto: Serena Core recibe webhook normalizado y el outbound real usa `gateway-wa`, no Evolution directo. El template `infra/vps/gateway-wa-staging/docker-compose.yml` ya modela una topologia privada en VPS con `gateway-wa`, `evolution-api`, `evo-postgres` y `redis`, sin host ports publicados, con `gateway-wa` unido a `serena-internal` para hablar con `serena-core` y a una red privada de Evolution. La gestion de numeros existe hoy de forma BASICA via `POST/GET/DELETE /instances` y `GET /instances/:name/qr`, pero el tracking local de instancias es in-memory; si reinicia `gateway-wa`, pierde la lista local y no rehidrata desde Evolution. La configuracion operativa actual tambien es estatica: routing table por JSON/env y secrets por env vars.

### Affected Areas
- `infra/vps/gateway-wa-staging/docker-compose.yml` — topologia privada propuesta para VPS y redes entre gateway, Serena y Evolution.
- `infra/vps/gateway-wa-staging/.env.example` — contrato de runtime para keys, Evolution URL y routing.
- `infra/vps/gateway-wa-staging/routing-table.example.json` — mapea `instanceId`/numero hacia consumidor interno.
- `apps/gateway-wa/src/index.ts` — bootstrap productivo del gateway y carga de routing table.
- `apps/gateway-wa/src/infrastructure/config.ts` — define prerequisitos de runtime para modo production.
- `apps/gateway-wa/src/infrastructure/instances/manager.ts` — gestion actual de instancias/numeros; hoy es in-memory.
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts` — API actual para crear/listar/borrar instancias y consultar QR.
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` — forwarding privado hacia Serena Core por `instanceId`.
- `apps/gateway-wa/src/infrastructure/routing/table.ts` — configuracion estatica de consumidores y auth interna.
- `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` — boundary inbound del core; confirma que el core no depende de Evolution.
- `apps/core/src/modules/outbound-delivery/adapter/gateway-wa-delivery-port.ts` — boundary outbound del core; confirma que el core habla con `/send` del gateway.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — runbook repo-only para staging privado y smoke no destructivo.
- `docs/ops/t40-vps-core-readiness.md` — confirma que core VPS ya quedo listo para recibir webhook desde gateway.

### Approaches
1. **Gateway privado con operator access interno** — correr Evolution API en contenedor propio dentro del mismo stack privado del VPS, dejando `gateway-wa` como unica superficie de control accesible solo por red interna/SSH tunnel/operator path.
   - Pros: respeta el boundary actual; no expone admin publico; reutiliza codigo, compose y runbook existentes; permite gestionar numeros via `/instances*` sin acoplar el core.
   - Cons: la gestion de numeros sigue siendo operativa/manual; el listado de instancias no sobrevive restart; configuracion de rutas sigue siendo archivo/env, no API durable.
   - Effort: Medium

2. **Gateway con admin publico endurecido** — exponer `/instances*` detras de Caddy con auth adicional para administrar numeros remotamente.
   - Pros: experiencia operativa mas comoda; no requiere SSH tunnel para management.
   - Cons: contradice la restriccion actual de no exponer admin publico; aumenta superficie de ataque; requiere decisiones extra de auth, rate limiting y auditoria.
   - Effort: High

3. **Core o panel administrando Evolution directo** — mover la gestion de numeros/configuracion fuera de `gateway-wa`.
   - Pros: podria centralizar UI/ops en otro modulo.
   - Cons: rompe el boundary pedido; duplica integracion; acopla Serena a WhatsApp/Evolution; NO alinea con la arquitectura aclarada por el usuario.
   - Effort: High

### Recommendation
Seguir con **Approach 1**. El repo YA esta bastante cerca de “Evolution API ready” para una integracion privada correcta: el gateway productivo existe, el core ya expone el webhook interno requerido, el compose staging ya separa redes y Evolution vive en su propio contenedor. Lo que falta para proposal/spec NO es reinventar arquitectura, sino cerrar readiness operativa: definir el deploy privado en VPS, el path seguro para administrar numeros sin superficie publica (por ejemplo SSH tunnel o acceso desde red Docker), y decidir una primera capa de configuracion manejable para `instanceId -> consumer` sin meter secretos en Git.

### Risks
- `InstanceManager` es in-memory: tras restart, `/instances` deja de reflejar la realidad de Evolution hasta recrear/rehidratar.
- No hay rehidratacion startup desde Evolution API ni persistencia durable para estado/rutas.
- La gestion de configuracion es estatica por env/JSON; sirve para staging, pero escala mal si hay multiples numeros o cambios frecuentes.
- Falta hardening adicional antes de live staging serio: autenticidad webhook/HMAC, politica de rotacion de keys, y decision formal sobre acceso operativo privado.
- El smoke actual evita pairing y delivery real; por lo tanto readiness funcional completa del numero sigue sin verificarse en explore.

### Ready for Proposal
Yes — con foco acotado: proposal para dejar **staging privado y operable** a Evolution API + gateway-wa en VPS, manteniendo al core desacoplado, sin pairing, sin exposicion publica de admin y explicitando que la gestion de numeros/configuracion en esta fase sera operator-only y probablemente archivo/env + endpoints internos ya existentes.
