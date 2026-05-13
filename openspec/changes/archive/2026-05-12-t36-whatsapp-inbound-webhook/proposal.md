# Proposal: T36 WhatsApp Inbound Webhook

## Intent

PR #46 dejó `apps/gateway-wa` listo para llamar a Serena Core, pero Serena Core todavía no expone `POST /internal/webhook/whatsapp`. T36 cierra ese gap del issue #47 creando el receptor interno que acepta el payload normalizado del gateway, lo convierte a `InboundMessageCommand` y ejecuta el pipeline channel-agnostic sin hablar directo con Evolution API, sin reemplazar la Simulation API y sin enviar mensajes reales.

## Scope

### In Scope
- Exponer `POST /internal/webhook/whatsapp` en Serena Core.
- Validar el payload normalizado del gateway y mapearlo a comando channel-inbound.
- Reusar auth interna `/internal/*` y la instancia compartida de `ProcessChannelInboundMessage`.
- Documentar que el endpoint completa inbound end-to-end entre gateway y core para issue #47.

### Out of Scope
- Llamadas directas desde Serena Core a Evolution API.
- Reemplazar `POST /dev/simulate/inbound-message` o `POST /dev/simulate/scenario`.
- Envío real de mensajes, colas, persistencia durable o cambios de negocio.

## Capabilities

### New Capabilities
- `whatsapp-inbound-webhook`: contrato del endpoint interno que recibe payload normalizado de WhatsApp Gateway y lo traduce al pipeline channel-agnostic.

### Modified Capabilities
- `internal-auth`: extender escenarios para confirmar el mismo token fail-fast sobre `/internal/webhook/whatsapp`.

## Approach

Seguir el enfoque recomendado en exploración: handler dedicado en `apps/core/src/bootstrap/` para WhatsApp. El handler valida `NormalizedWhatsAppInboundMessage`, mapea `senderWhatsAppId → externalSenderId`, `text → text`, `receivedAt → occurredAt`, y pasa `provider`, `instanceId`, `messageId`, `senderName` y `raw` en `metadata`. `server.ts` conserva el mismo orden de seguridad actual: token antes de leer body.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/bootstrap/server.ts` | Modified | Nueva ruta `/internal/webhook/whatsapp` |
| `apps/core/src/bootstrap/` | Modified | Handler HTTP dedicado y wiring al pipeline channel-inbound |
| `openspec/specs/whatsapp-inbound-webhook/spec.md` | New | Contrato principal del endpoint |
| `openspec/specs/internal-auth/spec.md` | Modified | Auth compartida para el nuevo endpoint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Drift con auth interna | Med | Reusar patrón actual token-before-body |
| Split de estado in-memory | Med | Reusar `createInMemoryPipeline()` compartido |
| Scope creep hacia WhatsApp real | Low | Mantener el endpoint como adapter interno solamente |

## Rollback Plan

Quitar la ruta `/internal/webhook/whatsapp`, su handler y la documentación/spec asociada; `gateway-wa` vuelve a quedar preparado pero sin recepción core, igual que antes de T36.

## Dependencies

- PR #46 en `gateway-wa` dejó listo el caller hacia Serena.
- Issue #47 define la necesidad funcional de cerrar el inbound end-to-end.

## Success Criteria

- [ ] Serena Core define `POST /internal/webhook/whatsapp` con auth interna compartida.
- [ ] El endpoint acepta payload normalizado del gateway y lo convierte a `InboundMessageCommand`.
- [ ] La implementación no llama Evolution API, no reemplaza Simulation API y no envía mensajes reales.
