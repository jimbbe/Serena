# Proposal: T39 — Outbound delivery adapter hacia gateway-wa

## Intent
Permitir que Serena Core solicite entrega outbound real vía `gateway-wa` `POST /send` usando el seam ya definido (`DeliveryPort` + `RequestOutboundDelivery`), sin acoplar Core a Evolution API ni romper el default fake de desarrollo.

## Scope
### In Scope
- Agregar adapter HTTP configurable de `DeliveryPort` en Core con `fetch` nativo.
- Incorporar env mínima para base URL, app key e `instanceId` fijo por runtime.
- Disparar `RequestOutboundDelivery` sólo cuando exista draft `confirmed_pending_delivery` con destinatario resuelto.
- Mapear respuestas y fallas de `gateway-wa` a `DeliveryResult`, preservando transiciones del draft.
- Mantener `FakeDeliveryPort` como default y base de tests/dev.

### Out of Scope
- Deploy, pairing, Caddy, DNS, PostgreSQL, secretos reales, colas o retries avanzados.
- Llamadas directas desde Core a Evolution API o selección dinámica multi-instancia.

## Capabilities
### New Capabilities
- `outbound-delivery-adapter`: adapter HTTP de Core hacia `gateway-wa` detrás de `DeliveryPort`.

### Modified Capabilities
- `mediation-flow`: una confirmación positiva puede continuar hacia entrega vía `RequestOutboundDelivery`, sin saltear el state machine.
- `whatsapp-inbound-webhook`: el webhook sigue usando el pipeline normal; una confirmación válida puede gatillar entrega indirecta, nunca transporte directo.

## Approach
Crear `GatewayWaDeliveryPort` en infraestructura Core y seleccionarlo por config. `ProcessChannelInboundMessage` conserva la lógica conversacional; al confirmar una mediación reutiliza `RequestOutboundDelivery` como único orquestador de `confirmed_pending_delivery -> delivery_requested -> delivered/failed`. El adapter sólo transforma `{ recipientExternalId, messageText }` en `{ instanceId, to, text }` y agrega `X-Gateway-App-Key`.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/outbound-delivery/` | Modified | Nuevo adapter HTTP, mapeo y tests |
| `apps/core/src/modules/channel-inbound/` | Modified | Trigger indirecto del caso de uso |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wiring fake/real configurable |
| `apps/core/src/server.ts` | Modified | Bootstrap runtime coherente |
| `apps/core/src/config/env.ts` | Modified | Variables outbound mínimas |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `instanceId` incorrecto | Med | Config explícita y validación al boot |
| Acoplar Core al transporte | Med | Mantener todo detrás de `DeliveryPort` |
| Semántica gateway/core inconsistente | Med | Mapear `200/400/404/502` explícitamente |

## Rollback Plan
Volver el wiring a `FakeDeliveryPort`, quitar env outbound y conservar drafts confirmados sin entrega real.

## Dependencies
- Contrato vigente de `apps/gateway-wa` `POST /send`.
- T38 refresh operativo tratado como prerrequisito para uso live/staging, no para implementación.

## Success Criteria
- [ ] Core solicita entrega real sólo vía `RequestOutboundDelivery` + `DeliveryPort`.
- [ ] Fake sigue siendo el default sin tocar deploy ni secretos reales.
- [ ] Confirmación válida termina en `delivered` o `failed` según `gateway-wa`.
- [ ] Tests cubren success, `400/404/502`, wiring fake/real y no-regresión.
