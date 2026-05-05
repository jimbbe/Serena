# Proposal: T30A — Post-T29 Local Readiness + Docs/Spec Sync

## Problema

T29 (`openai-compatible-llm-provider`) cerró con **PASS WITH WARNINGS** (83% compliant, 548 tests) pero su carpeta de cambio **nunca fue archivada**. Adicionalmente, existen gaps de validación y configuración que bloquean pruebas locales confiables:

1. `receivedAt` en `internal-pipeline-handler.ts` acepta cualquier string — no valida ISO 8601, lo que produce `Invalid Date` silencioso downstream.
2. `call-serena-core.ts` no tiene timeout en `fetch()` — si Serena Core no responde, el gateway cuelga indefinidamente.
3. `normalize-mock-event.ts` no valida `timestamp` — timestamps vacíos o inválidos pasan sin error.
4. `SERENA_INTERNAL_TOKEN` no está documentado ni mapeado en `docker-compose.yml` — no hay guía para configurar auth local.
5. Specs de T29 (openai-compatible provider, provider selection) no existen en `openspec/specs/`.
6. `docs/project-status.md` tiene sección "Expected Next Task" desactualizada.

## Objetivos

1. **Archivar T29** correctamente y actualizar referencias en docs.
2. **Endurecer validaciones** de `receivedAt` y `timestamp` para rechazar datos inválidos con errores 400 claros.
3. **Agregar timeout configurable** al fetch de gateway-wa → serena-core.
4. **Documentar flujo de token local** para que cualquier desarrollador pueda levantar el stack completo.
5. **Sincronizar specs y docs** con el estado real post-T29.

## Alcance Incluido

| # | Área | Acción |
|---|------|--------|
| 1 | T29 archive | Mover `openspec/changes/t29-openai-compatible-llm-provider/` → `archive/`, actualizar docs |
| 2 | `receivedAt` validation | Validar formato ISO 8601 en `internal-pipeline-handler.ts`, rechazar con 400 |
| 3 | Gateway timeout | Agregar `AbortSignal.timeout()` configurable via `GATEWAY_CORE_TIMEOUT_MS` (default 30s) |
| 4 | Timestamp validation | Validar formato en `normalize-mock-event.ts`, rechazar vacíos/inválidos |
| 5 | Token local docs | Agendar guidance en `.env.example`, mapear env en `docker-compose.yml` |
| 6 | Specs T29 | Crear specs para openai-compatible provider y provider selection en `openspec/specs/` |
| 7 | Docs sync | Actualizar "Expected Next Task" en `docs/project-status.md` |

## Fuera de Alcance (Explícito)

- **Producción/VPS hardening** — firewall, rate limiting, monitoring
- **Simulation auth adicional** — endpoints de simulación quedan como están
- **Body size limits** — no se agregan límites de payload
- **Repo privado** — visibilidad del repositorio no se toca
- **Mover `ProcessChannelInboundMessage`** — no se refactoriza ubicación del tipo
- **Extraer contratos compartidos** — no se unifican interfaces entre módulos

## Impacto Esperado

- **Local dev**: cualquier developer puede levantar el stack completo con auth funcional y timeouts predecibles.
- **Resiliencia**: el gateway ya no cuelga indefinidamente si core no responde.
- **Data integrity**: timestamps inválidos se rechazan temprano con errores claros en lugar de fallar silenciosamente.
- **Spec hygiene**: el repositorio de specs refleja el estado real del sistema post-T29.

## Criterios de Éxito

- [ ] T29 change folder archivada en `openspec/changes/archive/`
- [ ] `receivedAt` rechaza strings no-ISO 8601 con HTTP 400 y mensaje descriptivo
- [ ] `GATEWAY_CORE_TIMEOUT_MS` configurable en gateway-wa, default 30s, con `AbortSignal`
- [ ] `timestamp` en mock events validado — vacío/inválido → 400
- [ ] `.env.example` incluye guidance para `SERENA_INTERNAL_TOKEN`
- [ ] `docker-compose.yml` mapea `SERENA_INTERNAL_TOKEN` al servicio `serena-core`
- [ ] Specs para openai-compatible provider y provider selection existen en `openspec/specs/`
- [ ] `docs/project-status.md` "Expected Next Task" actualizado
- [ ] Todos los tests existentes pasan sin modificaciones (las validaciones nuevas solo rechazan inputs que ya no se usaban en tests)

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Validación `receivedAt` rompe tests existentes | Baja — todos usan ISO válido | Si algún test falla, es señal de que el test usaba datos inválidos y debe corregirse |
| Timeout 30s muy agresivo para payloads grandes | Media | Es configurable via env var; 30s coincide con `AI_TIMEOUT_MS` default de core |
| Crear specs post-implementación (retroactivo) | Baja | Se escriben como specs de "estado actual", no delta specs |
| Archivar T29 sin PR mergeado | Media — T29-17 pendiente | Documentar en el archive que el PR está pendiente de acción humana |
