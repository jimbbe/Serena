# T17A — WhatsApp Gateway Contract Specification

> Status: diseño técnico y contratos
> Scope: solo documentación, tipos TypeScript y función de mapeo puro
> NO integración real, NO Evolution API, NO envío de mensajes

---

## 1. Propósito

Definir el contrato explícito entre **Serena Core** (`serena-core`) y el futuro **WhatsApp Gateway** (servicio independiente, repo `whatsapp-gateway`).

Este documento establece:
- El shape normalizado que el Gateway debe enviar a Serena Core.
- Cómo el Gateway debe interpretar `PipelineResult`.
- La política de envío automático futuro.
- Idempotencia, seguridad y manejo de errores.
- Preguntas abiertas para el equipo de ingeniería.

---

## 2. Principio Arquitectónico

El WhatsApp Gateway **no contiene lógica de negocio de Serena**. Su responsabilidad es exclusivamente técnica:

| Responsabilidad del Gateway | Lo que NO hace |
|---|---|
| Recibir eventos de WhatsApp / Evolution API | Evaluar si un mensaje es de mediación |
| Normalizar payloads de distintos proveedores | Resolver contactos |
| Llamar a Serena Core via `POST /internal/pipeline/process` | Manejar sesiones de mediación |
| Interpretar `PipelineResult` y decidir acción | Reescribir mensajes |
| Enviar mensajes salientes cuando corresponda (futuro) | Detectar riesgos |
| Manejar reconexión, rate limiting, reintentos | Conocer la política de prudencia |

Este principio se concreta en el contrato de abajo: el Gateway recibe un `PipelineResult` **opaco para su lógica**, y actúa en función de un mapeo determinista definido por Serena Core.

---

## 3. Límites de T17A

T17A es una tarea de **diseño y documentación**. No implementa nada que toque infraestructura externa.

**Incluido en T17A:**
- ✅ `docs/t17a-whatsapp-gateway-contract.md` (este documento)
- ✅ Tipos TypeScript mínimos para fijar el contrato en código
- ✅ Función pura `mapPipelineResultToGatewayAction` con tests
- ✅ Actualización de docs principales

**Explícitamente excluido:**
- ❌ Evolution API real
- ❌ WhatsApp real
- ❌ Envío real de mensajes
- ❌ PostgreSQL
- ❌ Deploy
- ❌ Panel web
- ❌ LLM
- ❌ Autenticación HTTP completa (solo se documenta)
- ❌ Persistencia de idempotencia (solo se documenta)
- ❌ Cliente HTTP hacia WhatsApp Gateway
- ❌ Webhooks entrantes

---

## 4. Contrato de Mensaje Entrante Normalizado

### 4.1 Flujo conceptual

```
WhatsApp → Evolution API → WhatsApp Gateway → [normaliza] → Serena Core
```

### 4.2 Shape normalizado

El Gateway debe transformar cualquier payload de proveedor (Evolution API, Twilio, Meta directo, etc.) en el siguiente shape antes de llamar a Serena Core:

```typescript
type NormalizedWhatsAppInboundMessage = {
  provider: string;           // "evolution" | "twilio" | "meta"
  instanceId: string;         // ID de la instancia Evolution API (ej. "serena-main")
  messageId: string;          // ID estable del mensaje en el proveedor (ej. "wamid.xxx")
  senderWhatsAppId: string;   // WhatsApp ID del remitente (ej. "5492610000000")
  text: string;               // Contenido textual del mensaje (sin procesar)
  receivedAt: string;         // ISO 8601 timestamp de recepción
  raw: Record<string, unknown>; // Payload crudo del proveedor para debugging/trazabilidad
};
```

### 4.3 Mapping a PipelineInput

El Gateway mapea `NormalizedWhatsAppInboundMessage` → `PipelineInput` así:

| Campo Gateway | Campo Core | Nota |
|---|---|---|
| `senderWhatsAppId` | `senderWhatsAppId` | Directo |
| `text` | `messageText` | Directo |
| `receivedAt` | `receivedAt` | Directo |
| `provider` | — | No se envía al core |
| `instanceId` | — | No se envía al core |
| `messageId` | — | No se envía al core; el core no persiste idempotencia hoy |
| `raw` | — | Solo para logs del Gateway |

**Ejemplo de request HTTP:**

```http
POST /internal/pipeline/process HTTP/1.1
Host: serena-core:3000
Content-Type: application/json

{
  "senderWhatsAppId": "5492610000000",
  "messageText": "avisale a Carlos que llego 15 minutos tarde",
  "receivedAt": "2026-05-02T22:30:00.000Z"
}
```

El Gateway descarta los campos `provider`, `instanceId`, `messageId` y `raw` al construir el body para Serena Core. El contrato HTTP está definido en `docs/t16-internal-pipeline-http.md`.

---

## 5. Contrato de Respuesta desde Serena Core

### 5.1 PipelineResult — variantes

Serena Core devuelve `PipelineResult`, un discriminated union con 8 variantes (definido en `apps/core/src/modules/orchestrator/domain/pipeline-result.ts`):

| type | Significado | ¿Tiene draft? | ¿Se envía automático? |
|---|---|---|---|
| `discard` | Remitente inválido o texto vacío | No | Nunca |
| `conversation_pending` | Mensaje normal, sin mediación | No | No todavía |
| `risk_review_required` | Contenido urgente/riesgoso | No | Nunca sin revisión humana |
| `mediation_not_understood` | Señal de mediación no parseable | No | No automático |
| `recipient_not_found` | Destinatario no en directorio | No | No automático |
| `mediation_started` | Nueva sesión creada | Sí (`rewordedText`) | Futuro: sí, con draft |
| `mediation_reply_recorded` | Respuesta registrada en sesión | Sí (`rewordedText`) | Futuro: sí, con draft |
| `ambiguous_active_session` | Múltiples sesiones para el mismo par | No | Nunca sin revisión humana |

### 5.2 HTTP Response

El endpoint `POST /internal/pipeline/process` responde:

- **200 OK**: body = `PipelineResult` serializado (ver `docs/t16-internal-pipeline-http.md` para el JSON exacto de cada variante).
- **400 Bad Request**: payload inválido (campos faltantes, JSON malformado).
- **500 Internal Server Error**: error inesperado en el pipeline.

### 5.3 Interpretación del Gateway

El Gateway no debe hacer `if (result.type === "mediation_started") { ... }` con lógica de negocio. En su lugar, debe usar la función de mapeo `mapPipelineResultToGatewayAction` (definida en §7) que traduce `PipelineResult` a una acción concreta.

---

## 6. Política de Envío Futuro

### 6.1 Acciones del Gateway

La función de mapeo produce una de estas acciones:

| Acción | Significado | Comportamiento actual | Comportamiento futuro |
|---|---|---|---|
| `ignore` | Descartar silenciosamente | Nada | Nada |
| `no_auto_send` | No enviar automáticamente | Nada | Posible notificación al operador |
| `draft_ready` | Hay un draft listo para enviar | No se envía | Enviar via Evolution API |
| `manual_review_required` | Requiere intervención humana | Log + notificar | Panel de revisión |
| `error` | Error inesperado | Log + alerta | Retry con backoff |

### 6.2 Reglas por variante

| PipelineResult | Acción | Justificación |
|---|---|---|
| `discard` | `ignore` | Mensaje inválido o sender no autorizado |
| `conversation_pending` | `no_auto_send` | No hay módulo conversacional todavía |
| `risk_review_required` | `manual_review_required` | Contenido urgente/riesgoso, revisión humana obligatoria |
| `mediation_not_understood` | `no_auto_send` | Futuro: podría pedir aclaración al remitente |
| `recipient_not_found` | `no_auto_send` | Futuro: podría notificar a la persona mayor que el contacto no existe |
| `mediation_started` | `draft_ready` | Draft listo; en fase actual no se envía automáticamente |
| `mediation_reply_recorded` | `draft_ready` | Draft listo; en fase actual no se envía automáticamente |
| `ambiguous_active_session` | `manual_review_required` | Ambigüedad → intervención humana |

### 6.3 Draft Ready en fase actual

Aunque `mediation_started` y `mediation_reply_recorded` producen `draft_ready`, **en la fase actual el Gateway no debe enviar el mensaje**. Esto es consistente con T16: el pipeline produce drafts/intenciones pero no envía.

La acción `draft_ready` incluye:
- `toWhatsAppId`: el destinatario WhatsApp
- `text`: el texto reescrito (prudent-rewording)
- `sessionId`: para trazabilidad

Cuando se implemente el envío real (T18), el Gateway usará estos campos para construir la llamada a Evolution API.

---

## 7. Idempotencia Mínima

### 7.1 Principio

Cada mensaje de WhatsApp tiene un `messageId` estable asignado por el proveedor. Si el Gateway reenvía el mismo mensaje dos veces (por retry, redelivery, o bug), Serena Core debería poder detectarlo y no reprocesarlo.

### 7.2 Diseño propuesto (no implementado)

| Componente | Responsabilidad |
|---|---|
| Gateway | Enviar `messageId` en un header `X-Serena-Message-Id` al llamar a Serena Core |
| Serena Core | En una tarea futura (T17C o T19), mantener un cache/deduplicador de `messageId` procesados |
| Contrato | Si el `messageId` ya fue procesado, devolver `409 Conflict` con el `PipelineResult` original (idempotent) |

### 7.3 Estado actual en T17A

- **No se implementa persistencia de idempotencia.** Solo se documenta la necesidad.
- El Gateway **debe** generar y mantener un `messageId` estable por mensaje.
- El header `X-Serena-Message-Id` se define como parte del contrato futuro.

---

## 8. Seguridad Mínima para Llamada Interna

### 8.1 Principio

`POST /internal/pipeline/process` es un endpoint interno. En producción con Docker Compose, solo es accesible desde la red `serena-internal`. Pero se recomienda una capa adicional de seguridad para el futuro.

### 8.2 Estrategia propuesta (no implementada)

| Componente | Detalle |
|---|---|
| Header | `X-Serena-Internal-Token: <token>` |
| Token | Desde variable de entorno `SERENA_INTERNAL_TOKEN` |
| Validación | Serena Core compara el header con el token; si no coincide → `401 Unauthorized` |
| Rotación | Cambiar la env var y reiniciar ambos servicios |

### 8.3 Estado actual en T17A

- **No se implementa autenticación.** Solo se documenta la necesidad.
- El endpoint sigue siendo abierto dentro de la red interna.
- En producción (T04), Caddy no expone `/internal/*` públicamente.

---

## 9. Errores HTTP Esperados

El Gateway debe manejar estas respuestas de Serena Core:

| HTTP Status | Significado | Acción del Gateway |
|---|---|---|
| `200 OK` | Pipeline ejecutado | Interpretar `PipelineResult` → `GatewayAction` |
| `400 Bad Request` | Payload inválido | Log + descartar (no reintentar sin corregir) |
| `401 Unauthorized` | Futuro: token interno inválido | Log + alerta (error de configuración) |
| `403 Forbidden` | Futuro: acceso denegado por política | Log + alerta |
| `409 Conflict` | Futuro: messageId duplicado (idempotencia) | Usar respuesta cacheada |
| `500 Internal Server Error` | Error inesperado en pipeline | Log + reintentar con backoff (máx 3) |
| `502/503/504` | Serena Core no disponible | Reintentar con backoff + circuit breaker |
| Timeout / conexión rechazada | Serena Core caído | Circuit breaker + alerta |

### 9.1 Timeouts recomendados

| Operación | Timeout |
|---|---|
| Conexión TCP | 5 segundos |
| Respuesta HTTP completa | 30 segundos |
| Reintentos totales (con backoff) | Máximo 3 intentos en 60 segundos |

---

## 10. Función de Mapeo: `mapPipelineResultToGatewayAction`

### 10.1 Propósito

Traduce `PipelineResult` (output del orchestrator) a `WhatsAppGatewayAction` (instrucción para el Gateway), sin lógica de negocio, sin side effects.

### 10.2 Tipos

```typescript
// Acción que el Gateway debe ejecutar
type WhatsAppGatewayAction =
  | IgnoreAction
  | NoAutoSendAction
  | DraftReadyAction
  | ManualReviewRequiredAction
  | ErrorAction;

type IgnoreAction = {
  action: "ignore";
  resultType: string;
  reason: string;
};

type NoAutoSendAction = {
  action: "no_auto_send";
  resultType: string;
  reason: string;
};

type DraftReadyAction = {
  action: "draft_ready";
  resultType: string;
  toWhatsAppId: string;
  text: string;
  sessionId: string;
  fromDisplayName: string;
  toDisplayName: string;
};

type ManualReviewRequiredAction = {
  action: "manual_review_required";
  resultType: string;
  reason: string;
  detail?: string;
  matchedSignals?: readonly string[];
  activeSessionIds?: readonly string[];
};

type ErrorAction = {
  action: "error";
  message: string;
};
```

### 10.3 Reglas de mapeo

| PipelineResult.type | GatewayAction |
|---|---|
| `discard` | `{ action: "ignore", resultType: "discard", reason: "<reason>" }` |
| `conversation_pending` | `{ action: "no_auto_send", resultType: "conversation_pending", reason: "No conversational module available" }` |
| `risk_review_required` | `{ action: "manual_review_required", resultType: "risk_review_required", reason: "Risk/urgent content requires human review", matchedSignals: [...] }` |
| `mediation_not_understood` | `{ action: "no_auto_send", resultType: "mediation_not_understood", reason: "Could not parse mediation request" }` |
| `recipient_not_found` | `{ action: "no_auto_send", resultType: "recipient_not_found", reason: "Recipient not in contact directory: <recipientName>" }` |
| `mediation_started` | `{ action: "draft_ready", resultType: "mediation_started", toWhatsAppId: recipientId, text: rewordedText, sessionId, fromDisplayName, toDisplayName }` |
| `mediation_reply_recorded` | `{ action: "draft_ready", resultType: "mediation_reply_recorded", toWhatsAppId: toParticipantId, text: rewordedText, sessionId, fromDisplayName, toDisplayName }` |
| `ambiguous_active_session` | `{ action: "manual_review_required", resultType: "ambiguous_active_session", reason: "Multiple active sessions for the same participant pair", activeSessionIds: [...] }` |

### 10.4 Ubicación

- **Función**: `apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts`
- **Tests**: `apps/core/src/modules/whatsapp-gateway/tests/map-pipeline-result-to-gateway-action.test.ts`

---

## 11. Open Questions

Estas preguntas quedan abiertas para T17B o tareas posteriores:

1. **¿Dónde vivirá el Gateway?**
   - Decidido en T10: repo separado (`whatsapp-gateway`). Este documento asume esa decisión.
   - Pregunta abierta: ¿el código de mapeo (`mapPipelineResultToGatewayAction`) se duplicará en el Gateway o se compartirá vía un package?

2. **¿El Gateway será multi-proyecto / multi-número?**
   - La arquitectura T10 prevé que sí. El campo `instanceId` en `NormalizedWhatsAppInboundMessage` permite distinguir instancias.
   - Pregunta abierta: ¿cómo se configura el ruteo de webhooks por instancia?

3. **¿Cómo se manejarán reintentos?**
   - Recomendación inicial: exponential backoff con jitter, máximo 3 intentos, circuit breaker después de 5 fallos consecutivos.
   - Pregunta abierta: ¿el Gateway debe reintentar o Serena Core debe exponer un endpoint de reintento?

4. **¿Cómo se manejarán mensajes duplicados?**
   - La idempotencia por `messageId` está documentada en §7 pero no implementada.
   - Pregunta abierta: ¿dónde se almacena el cache de `messageId` procesados? ¿En PostgreSQL o en Redis?

5. **¿Habrá cola de mensajes / event bus en el futuro?**
   - Para producción con volumen, se podría introducir una cola (RabbitMQ, Redis Streams) entre el Gateway y Serena Core.
   - Pregunta abierta: ¿esto es necesario para MVP o es premature optimization?

6. **¿El Gateway debe notificar a la persona mayor cuando un mensaje produce `no_auto_send`?**
   - Por ahora no. En el futuro, `recipient_not_found` y `mediation_not_understood` podrían generar una respuesta automática pidiendo aclaración.
   - Pregunta abierta: ¿esto es responsabilidad del Gateway o de Serena Core?

---

## 12. Archivos Relevantes

| Archivo | Rol |
|---|---|
| `docs/t17a-whatsapp-gateway-contract.md` | Este documento — especificación del contrato |
| `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | Tipos `PipelineResult` y `PipelineInput` |
| `apps/core/src/modules/whatsapp-gateway/domain/incoming-message.ts` | Tipo `IncomingWhatsAppMessage` existente |
| `apps/core/src/modules/whatsapp-gateway/application/ports/whatsapp-gateway.ts` | Puerto `WhatsAppGateway` existente |
| `apps/core/src/modules/whatsapp-gateway/domain/normalized-inbound-message.ts` | Tipo `NormalizedWhatsAppInboundMessage` (T17A) |
| `apps/core/src/modules/whatsapp-gateway/domain/gateway-action.ts` | Tipo `WhatsAppGatewayAction` (T17A) |
| `apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts` | Función de mapeo pura (T17A) |
| `apps/core/src/modules/whatsapp-gateway/tests/map-pipeline-result-to-gateway-action.test.ts` | Tests de mapeo (T17A) |
| `docs/t16-internal-pipeline-http.md` | Contrato HTTP del endpoint de pipeline |
| `docs/t10-mvp-architecture.md` | Arquitectura MVP (incluye sección WhatsApp Gateway) |

---

*Documento creado en T17A. Actualizado por última vez: 2026-05-02.*
