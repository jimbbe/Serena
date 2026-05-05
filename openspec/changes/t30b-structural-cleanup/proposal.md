# Proposal: T30B — Structural Cleanup

## Problema

El codebase tiene dos problemas estructurales que generan deuda tecnica y riesgo de divergencia:

1. **Contratos duplicados**: `PipelineResult` (8 variantes) y `PipelineInput` estan definidos en `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` y copiados textualmente a `apps/gateway-wa/src/domain/pipeline-result.ts`. La copia del gateway tiene un comentario header: *"COPIED from... DO NOT modify without updating the corresponding source."* Cualquier cambio al contrato requiere sincronizacion manual — un riesgo de divergencia silenciosa.

2. **Modulo mal nombrado**: `ProcessChannelInboundMessage` vive en el modulo `inbound-gate` pero es agnostico al canal (acepta cualquier `InboundChannel`). El nombre `inbound-gate` sugiere responsabilidad de WhatsApp-gate, pero este caso de uso orquesta el pipeline completo para cualquier canal. `ResolvedInboundActor` sufre el mismo problema de ubicacion.

## Objetivos

1. **Single source of truth** para `PipelineInput` y `PipelineResult` via paquete compartido `@serena/contracts`.
2. **Modulo con nombre correcto**: `ProcessChannelInboundMessage` y `ResolvedInboundActor` se mueven a un nuevo modulo `channel-inbound`.
3. **Cero cambios de comportamiento**: toda la logica, tests y API publica permanecen identicos.

## Alcance Incluido

| # | Area | Accion |
|---|------|--------|
| 1 | `@serena/contracts` | Crear `packages/contracts` con `PipelineInput` y las 8 variantes de `PipelineResult` |
| 2 | Core re-export | `apps/core/.../pipeline-result.ts` re-exporta desde `@serena/contracts` |
| 3 | Gateway re-export | `apps/gateway-wa/src/domain/pipeline-result.ts` re-exporta desde `@serena/contracts` (elimina copia manual) |
| 4 | Nuevo modulo | Crear `apps/core/src/modules/channel-inbound/` con estructura `application/use-cases/` y `application/results/` |
| 5 | Move use case | Mover `process-channel-inbound-message.ts` de `inbound-gate` a `channel-inbound/application/use-cases/` |
| 6 | Move tipo | Mover `resolved-inbound-actor.ts` de `inbound-gate` a `channel-inbound/application/results/` |
| 7 | Import updates | Actualizar ~15 archivos que importan desde las rutas viejas |
| 8 | OpenSpec sync | Actualizar specs que referencian rutas antiguas |

## Contratos Compartidos

### `PipelineResult` variants (8)

| Variant | Campos clave |
|---------|-------------|
| `DiscardResult` | `type: "discard"`, `reason` |
| `ConversationPendingResult` | `type: "conversation_pending"`, `senderId` |
| `RiskReviewRequiredResult` | `type: "risk_review_required"`, `senderId`, `matchedSignals` |
| `MediationNotUnderstoodResult` | `type: "mediation_not_understood"`, `senderId` |
| `RecipientNotFoundResult` | `type: "recipient_not_found"`, `senderId`, `recipientName` |
| `MediationStartedResult` | `type: "mediation_started"`, `sessionId`, `requesterId`, `recipientId`, `rewordedText`, etc. |
| `MediationReplyRecordedResult` | `type: "mediation_reply_recorded"`, `sessionId`, `fromParticipantId`, `toParticipantId`, `rewordedText`, etc. |
| `AmbiguousActiveSessionResult` | `type: "ambiguous_active_session"`, `senderId`, `activeSessionIds` |

### `PipelineInput`

```ts
{ senderWhatsAppId: string; messageText: string; receivedAt: string }
```

### Patron de re-export

Core y gateway consumen el mismo contrato desde `@serena/contracts`:

```ts
// apps/core/src/modules/orchestrator/domain/pipeline-result.ts
export { PipelineResult, PipelineInput, /* all variants */ } from "@serena/contracts";

// apps/gateway-wa/src/domain/pipeline-result.ts
export { PipelineResult, PipelineInput, /* all variants */ } from "@serena/contracts";
```

El gateway **ya no tiene una copia divergente** — ambos paquetes re-exportan desde la misma fuente.

### Modulo `channel-inbound`

```
apps/core/src/modules/channel-inbound/
  application/
    use-cases/
      process-channel-inbound-message.ts  (movido desde inbound-gate)
    results/
      resolved-inbound-actor.ts  (movido desde inbound-gate)
```

`inbound-gate` permanece enfocado en evaluacion y routing de puerta de entrada.

## Fuera de Alcance (Explicito)

- **Simulation playbook, manual console** — no se agregan ni modifican
- **WhatsApp real, Evolution API** — ninguna integracion real
- **PostgreSQL** — se mantiene todo en memoria
- **Prompt/policy/provider changes** — ningun cambio en logica de IA
- **API publica** — ningun endpoint, parametro o response cambia
- **Dependencias externas** — solo se agrega `@serena/contracts` como paquete workspace interno
- **Cambios de comportamiento** — zero logic changes, solo restructuracion

## Impacto Esperado

- **Eliminacion de riesgo de divergencia**: un solo lugar para modificar contratos de pipeline.
- **Modulo con nombre correcto**: `channel-inbound` refleja que es agnostico al canal.
- **Mantenibilidad**: futuros cambios de contrato no requieren sincronizacion manual entre core y gateway.
- **Clean Architecture**: limites de modulo claros, sin copias manuales.

## Criterios de Exito

- [ ] `packages/contracts` existe con `package.json`, `tsconfig.json`, `src/index.ts`
- [ ] `@serena/contracts` exporta `PipelineInput` y las 8 variantes de `PipelineResult`
- [ ] Core `pipeline-result.ts` re-exporta desde `@serena/contracts`
- [ ] Gateway `pipeline-result.ts` re-exporta desde `@serena/contracts` (sin copia manual)
- [ ] `channel-inbound` modulo existe con `process-channel-inbound-message` y `resolved-inbound-actor`
- [ ] `inbound-gate` ya no contiene `process-channel-inbound-message` ni `resolved-inbound-actor`
- [ ] `npm run check` pasa sin errores
- [ ] `npm test` pasa — 578 tests (519 core + 59 gateway-wa)
- [ ] Busqueda de control: no existen imports desde rutas viejas ni header "COPIED from"

## Plan de Validacion

### Baseline (ya verificado)

- `npm run check` → PASS
- `npm test` → 578 tests, 0 failures

### Final

1. `npm run check` — estructura y typecheck
2. `npm test` — 578 tests sin regresion
3. Control search — verificar que no quedan imports desde rutas antiguas:
   - `rg "inbound-gate.*process-channel-inbound-message"` → 0 resultados
   - `rg "inbound-gate.*resolved-inbound-actor"` → 0 resultados
   - `rg "COPIED from"` en gateway-wa → 0 resultados

## Riesgos

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Dependencia circular si `@serena/contracts` importa de core/gateway | Baja — el paquete sera solo tipos puros, sin imports runtime de workspace packages |
| Error en paths de imports (~15 archivos) | Media — verificar con `npm run typecheck` antes de tests |
| Test `process-channel-inbound-message.test.ts` (~2000+ lineas) se rompe | Baja — solo cambiar imports, la logica no cambia |
| `tsconfig` no resuelve `@serena/contracts` | Baja — npm workspaces ya incluye `packages/*`, solo necesita `package.json` correcto |
| OpenSpec specs referencian paths viejos | Media — actualizar specs como parte de la tarea |
