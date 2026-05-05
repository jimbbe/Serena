# Tasks: T30A — Post-T29 Local Readiness + Docs/Spec Sync

## Fase 1 — Token local (env.example + docker-compose.yml)

- [x] **T30A-01** — Ampliar guidance de `SERENA_INTERNAL_TOKEN` en `.env.example`
  - Agregar comentario con instrucciones de generación (`openssl rand -hex 16` o equivalente)
  - Agregar nota de seguridad: solo para desarrollo local, no produccion
  - Agregar nota: debe coincidir en `serena-core` y `gateway-wa`
  - **Spec**: `local-dev-token-config` → Scenario: `.env.example` has token guidance
  - **Archivo**: `.env.example`

- [x] **T30A-02** — Mapear `SERENA_INTERNAL_TOKEN` en `docker-compose.yml` para `serena-core`
  - Agregar `SERENA_INTERNAL_TOKEN: ${SERENA_INTERNAL_TOKEN}` al bloque `environment` del servicio `serena-core`
  - **Spec**: `local-dev-token-config` → Scenario: docker-compose maps token to core
  - **Archivo**: `docker-compose.yml`

- [x] **T30A-03** — Mapear `SERENA_INTERNAL_TOKEN` en `docker-compose.yml` para `gateway-wa`
  - Agregar servicio `gateway-wa` al compose (si no existe) o agregar `SERENA_INTERNAL_TOKEN: ${SERENA_INTERNAL_TOKEN}` a su bloque `environment`
  - **Spec**: `local-dev-token-config` → Scenario: docker-compose maps token to gateway-wa
  - **Archivo**: `docker-compose.yml`

## Fase 2 — Validación `receivedAt` en internal-pipeline-handler

- [x] **T30A-04** — Validar formato ISO 8601 para `receivedAt` presente
  - En `internal-pipeline-handler.ts`, cuando `receivedAt` es string, validar con `Number.isFinite(new Date(value).getTime())`
  - Rechazar con error `{ field: "receivedAt", message: "Must be a valid ISO 8601 timestamp" }` si la validacion falla
  - **Spec**: `internal-pipeline-http` → Scenario: Invalid string in receivedAt returns 400
  - **Archivo**: `apps/core/src/bootstrap/internal-pipeline-handler.ts`

- [x] **T30A-05** — Rechazar `receivedAt` con string vacio
  - Asegurar que `receivedAt: ""` sea rechazado (el trim + validacion ISO debe cubrirlo)
  - **Spec**: `internal-pipeline-http` → Scenario: Empty string in receivedAt returns 400
  - **Archivo**: `apps/core/src/bootstrap/internal-pipeline-handler.ts`

- [x] **T30A-06** — Aceptar `receivedAt` ausente (backward compatible)
  - Verificar que la logica existente de "ausente = usa server time" se mantiene sin cambios
  - **Spec**: `internal-pipeline-http` → Scenario: Missing receivedAt is accepted (backward compatible)
  - **Archivo**: `apps/core/src/bootstrap/internal-pipeline-handler.ts`

- [x] **T30A-07** — Aceptar `receivedAt` con timezone offset
  - Verificar que `new Date("2026-05-02T22:00:00.000+03:00").getTime()` es finito (ya lo es en JS estandar)
  - **Spec**: `internal-pipeline-http` → Scenario: ISO 8601 with timezone offset passes
  - **Archivo**: `apps/core/src/bootstrap/internal-pipeline-handler.ts`

- [x] **T30A-08** — Rechazar fechas imposibles (mes 13, dia 45)
  - Verificar que `new Date("2026-13-45T00:00:00.000Z").getTime()` produce `NaN` y es rechazado
  - **Spec**: `internal-pipeline-http` → Scenario: Invalid date values like month 13 are rejected
  - **Archivo**: `apps/core/src/bootstrap/internal-pipeline-handler.ts`

## Fase 3 — Gateway-wa timeout + validacion respuesta JSON + validacion timestamp

### 3a. Timeout configurable

- [x] **T30A-09** — Leer `GATEWAY_CORE_TIMEOUT_MS` con fallback a 30000ms
  - En `call-serena-core.ts` o modulo de config, leer env var con default 30000
  - Validar que sea entero positivo; si no, loguear warning y usar default
  - **Spec**: `gateway-wa` → Scenarios: Default timeout, Custom timeout, Invalid timeout, Zero/negative timeout
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts` (o config adyacente)

- [x] **T30A-10** — Aplicar `AbortSignal.timeout()` al `fetch()`
  - Modificar el `fetch()` en `call-serena-core.ts` para usar `signal: AbortSignal.timeout(ms)`
  - **Spec**: `gateway-wa` → Scenarios: Default timeout, Custom timeout
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

- [x] **T30A-11** — Propagar error descriptivo al timeout
  - Catch `AbortError` y lanzar error con mensaje indicando que el request timed out
  - **Spec**: `gateway-wa` → Scenario: Timeout error is propagated with descriptive message
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

### 3b. Validacion respuesta JSON de Core

- [x] **T30A-12** — Validar que respuesta de Core es JSON valido
  - Despues de `response.json()`, catch parse errors y retornar error descriptivo con body truncado a 500 chars
  - **Spec**: `gateway-wa` (strong JSON response validation) → Scenario: Non-JSON response returns error
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

- [x] **T30A-13** — Validar campo `type` presente y no vacio
  - Verificar que el JSON parsed contiene `type: string` no vacio
  - **Spec**: `gateway-wa` (strong JSON response validation) → Scenario: Missing type field returns error
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

- [x] **T30A-14** — Validar que `type` es un valor conocido de `PipelineResult`
  - Verificar que `type` sea uno de: `discard`, `conversation_pending`, `risk_review_required`, `mediation_not_understood`, `recipient_not_found`, `mediation_started`, `mediation_reply_recorded`, `ambiguous_active_session`
  - **Spec**: `gateway-wa` (strong JSON response validation) → Scenario: Unknown type value returns error
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

- [x] **T30A-15** — Validar campos requeridos por `type` (ej: `mediation_started`)
  - Para `mediation_started`, verificar presencia de `sessionId`, `requesterId`, `recipientId`, `recipientDisplayName`, `rewordedText`
  - **Spec**: `gateway-wa` (strong JSON response validation) → Scenario: mediation_started missing required fields returns error
  - **Archivo**: `apps/gateway-wa/src/application/call-serena-core.ts`

### 3c. Validacion timestamp en mock events

- [x] **T30A-16** — Validar `timestamp` no vacio en `normalize-mock-event.ts`
  - Agregar validacion: `event.timestamp.trim()` debe ser non-empty
  - Incluir `timestamp` en `missingFields` si falla
  - **Spec**: `gateway-wa` (timestamp validation) → Scenarios: Empty timestamp, Whitespace-only timestamp
  - **Archivo**: `apps/gateway-wa/src/application/normalize-mock-event.ts`

- [x] **T30A-17** — Validar `timestamp` como ISO 8601 valido
  - Agregar validacion: `Number.isFinite(new Date(event.timestamp).getTime())` debe ser true
  - Si falla, agregar mensaje de error mencionando `timestamp` e ISO 8601
  - **Spec**: `gateway-wa` (timestamp validation) → Scenario: Non-ISO timestamp is rejected
  - **Archivo**: `apps/gateway-wa/src/application/normalize-mock-event.ts`

- [x] **T30A-18** — Reportar multiples fallos de validacion juntos
  - Asegurar que si `messageId` Y `timestamp` fallan, el error mencione AMBOS campos
  - La estructura actual de `missingFields` ya soporta esto — verificar que `timestamp` se integre al mismo array
  - **Spec**: `gateway-wa` (timestamp validation) → Scenario: Multiple validation failures report all fields
  - **Archivo**: `apps/gateway-wa/src/application/normalize-mock-event.ts`

## Fase 4 — Specs T29 (crear specs de estado actual)

- [x] **T30A-19** — Crear spec `openai-compatible-provider` en `openspec/specs/`
  - Documentar: tipo `OpenAICompatibleLlmProvider`, constructor, HTTP call a `/chat/completions`, timeout, error handling, API key security (no loguear en errores)
  - Formato: spec de "estado actual" (no delta spec)
  - **Spec**: `docs-spec-sync` → Scenario: openai-compatible-provider spec exists
  - **Archivo nuevo**: `openspec/specs/openai-compatible-provider/spec.md`

- [x] **T30A-20** — Crear spec `provider-selection-config` en `openspec/specs/`
  - Documentar: env var `AI_PROVIDER`, logica de seleccion (mock vs openai-compatible), validacion de env vars requeridas, `AI_TIMEOUT_MS`
  - Formato: spec de "estado actual" (no delta spec)
  - **Spec**: `docs-spec-sync` → Scenario: provider-selection-config spec exists
  - **Archivo nuevo**: `openspec/specs/provider-selection-config/spec.md`

## Fase 5 — Docs sync (project-status.md)

- [x] **T30A-21** — Actualizar seccion "Expected Next Task" en `docs/project-status.md`
  - Cambiar "Next: T29 or subsequent task" por referencia a T30A (esta tarea) o siguiente tarea planificada
  - **Spec**: `docs-spec-sync` → Scenario: Expected Next Task is updated
  - **Archivo**: `docs/project-status.md`

## Fase 6 — Archivo T29

- [x] **T30A-22** — Mover carpeta T29 a `openspec/changes/archive/`
  - Mover `openspec/changes/t29-openai-compatible-llm-provider/` → `openspec/changes/archive/t29-openai-compatible-llm-provider/`
  - **Spec**: `t29-closure` → Scenario: T29 folder is moved to archive
  - **Archivo**: directorio completo

- [x] **T30A-23** — Crear `CLOSURE.md` en el archive de T29
  - Documentar: PASS WITH WARNINGS (83% compliant, 548 tests)
  - Documentar: T29-17 (Commit & PR) pendiente de accion humana
  - Documentar: los 7 warnings del verify report para referencia
  - NO afirmar que el PR fue mergeado
  - **Spec**: `t29-closure` → Scenarios: CLOSURE.md documents pending PR, Archive does not claim PR was merged
  - **Archivo nuevo**: `openspec/changes/archive/t29-openai-compatible-llm-provider/CLOSURE.md`

## Fase 7 — Validacion final

- [x] **T30A-24** — Ejecutar `npm run check` y verificar que pasa sin errores
  - Todos los tests existentes deben pasar (las validaciones nuevas solo rechazan inputs que ya no se usaban en tests)
  - Si algun test falla por las validaciones nuevas, el test usaba datos invalidos y debe corregirse
  - **Criterio de exito**: todos los tests pasan sin modificaciones de logica de negocio

## Notas de mapeo spec → tasks

| Spec Capability | Scenarios | Tasks |
|---|---|---|
| `internal-pipeline-http` (receivedAt) | 6 scenarios | T30A-04 a T30A-08 |
| `gateway-wa` (timeout) | 5 scenarios | T30A-09 a T30A-11 |
| `gateway-wa` (JSON validation) | 5 scenarios | T30A-12 a T30A-15 |
| `gateway-wa` (timestamp validation) | 5 scenarios | T30A-16 a T30A-18 |
| `local-dev-token-config` | 3 scenarios | T30A-01 a T30A-03 |
| `docs-spec-sync` (specs T29) | 2 scenarios | T30A-19, T30A-20 |
| `docs-spec-sync` (docs update) | 1 scenario | T30A-21 |
| `t29-closure` (archive) | 3 scenarios | T30A-22, T30A-23 |
| Criterio de exito general | tests pasan | T30A-24 |

## Observaciones

- **T30A-01**: `.env.example` ya tiene `SERENA_INTERNAL_TOKEN=` con comentario basico (lineas 28-31). La task solo necesita **ampliar** con instrucciones de generacion y nota de seguridad.
- **T30A-03**: `gateway-wa` **no existe** como servicio en `docker-compose.yml` actualmente. Esta task implica crearlo o documentar que se hara cuando el servicio se agregue al compose.
- **T30A-06, T30A-07, T30A-08**: Son tasks de **verificacion** mas que de implementacion — la validacion ISO 8601 con `Number.isFinite(new Date().getTime())` ya cubre estos casos por comportamiento estandar de JS. Se incluyen para trazabilidad con la spec.
- **T30A-18**: La estructura actual de `missingFields` en `normalize-mock-event.ts` ya soporta reportar multiples campos. Solo hay que integrar `timestamp` al mismo flujo.
