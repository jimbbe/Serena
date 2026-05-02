# T16 — Internal Pipeline HTTP Endpoint

Endpoint HTTP interno que expone el pipeline orchestrator (`ProcessIncomingWhatsAppMessage`) via `POST /internal/pipeline/process`.

## Contrato

### Request

```
POST /internal/pipeline/process
Content-Type: application/json
```

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `senderWhatsAppId` | string | si | WhatsApp ID del remitente (non-empty, trimmed) |
| `messageText` | string | si (*) | Texto del mensaje entrante (non-empty, trimmed) |
| `text` | string | no | Alias para `messageText`. Si `messageText` no esta presente, se usa `text` |
| `receivedAt` | string | no | ISO 8601 timestamp. Si no se envia, usa `new Date().toISOString()` |

(*) Se requiere al menos uno de `messageText` o `text`. Si ambos estan presentes, `messageText` tiene precedencia.

#### Ejemplos

```json
{
  "senderWhatsAppId": "5491111111111",
  "messageText": "avisale a Carlos que llego tarde",
  "receivedAt": "2026-05-02T22:00:00.000Z"
}
```

```json
{
  "senderWhatsAppId": "5492222222222",
  "text": "dale, no hay problema"
}
```

### Response

#### 200 OK — Pipeline ejecutado

El body es un `PipelineResult` con type discriminator:

| type | Significado |
|------|-------------|
| `discard` | Remitente invalido o no autorizado |
| `conversation_pending` | Mensaje normal, sin mediacion detectada |
| `risk_review_required` | Contenido urgente/riesgoso, requiere revision humana |
| `mediation_not_understood` | Senal de mediacion detectada pero no se pudo extraer el pedido |
| `recipient_not_found` | Destinatario del recado no esta en el directorio de contactos |
| `mediation_started` | Nueva sesion de mediacion creada, lista para enviar |
| `mediation_reply_recorded` | Respuesta registrada en sesion activa, lista para reenviar |
| `ambiguous_active_session` | Multiples sesiones activas para el mismo par |

Campos por variante:

```typescript
// discard
{ type: "discard"; reason: string }

// conversation_pending
{ type: "conversation_pending"; senderId: string }

// risk_review_required
{ type: "risk_review_required"; senderId: string; matchedSignals: string[] }

// mediation_not_understood
{ type: "mediation_not_understood"; senderId: string }

// recipient_not_found
{ type: "recipient_not_found"; senderId: string; recipientName: string }

// mediation_started
{ type: "mediation_started"; sessionId: string; requesterId: string;
  requesterDisplayName: string; recipientId: string;
  recipientDisplayName: string; rewordedText: string }

// mediation_reply_recorded
{ type: "mediation_reply_recorded"; sessionId: string;
  fromParticipantId: string; fromDisplayName: string;
  toParticipantId: string; toDisplayName: string; rewordedText: string }

// ambiguous_active_session
{ type: "ambiguous_active_session"; senderId: string;
  activeSessionIds: string[] }
```

#### 400 Bad Request

| Error | Causa |
|-------|-------|
| `invalid_json` | Body no es JSON valido |
| `invalid_payload` | Campos requeridos faltan o son invalidos. `fields[]` lista cada campo con su mensaje |
| `failed_to_read_body` | Error de I/O al leer el request body |

```json
{
  "error": "invalid_payload",
  "detail": "One or more fields are invalid or missing",
  "fields": [
    { "field": "senderWhatsAppId", "message": "Required non-empty string" }
  ]
}
```

#### 404 Not Found

```json
{ "error": "not_found", "detail": "No route matches POST /otra-cosa" }
```

#### 405 Method Not Allowed

```json
{ "error": "method_not_allowed", "detail": "Method GET not allowed. Use POST." }
```

#### 500 Internal Server Error

```json
{ "error": "pipeline_execution_failed", "detail": "<mensaje de error>" }
```

```json
{ "error": "pipeline_not_configured" }
```

## Comportamiento

### Sesiones entre requests

Las sesiones de mediacion sobreviven entre requests HTTP porque el servidor comparte una unica instancia del orchestrator con dependencias in-memory creadas via `createInMemoryPipeline()`. El adapter `MediationBridgeActiveSessionQuery` lee sesiones directamente de `InMemoryMediationBridgeSessionStore`, sin necesidad de registro manual.

Flujo tipico:

```
POST /internal/pipeline/process  (Maria: "avisale a Carlos que llego tarde")
  → 200 { type: "mediation_started", sessionId: "...", ... }

POST /internal/pipeline/process  (Carlos: "dale, no hay problema")
  → 200 { type: "mediation_reply_recorded", sessionId: "...", ... }
```

La segunda request encuentra la sesion activa porque `MediationBridgeActiveSessionQuery` consulta el mismo store donde se creo la sesion en la primera request.

## Limites

- **Sin autenticacion**: el endpoint `/internal/pipeline/process` es interno, sin auth. En produccion debe estar detras de un reverse proxy (Caddy) que no lo exponga publicamente.
- **Sin persistencia**: las sesiones viven en memoria. Si el proceso se reinicia, se pierden todas las sesiones activas.
- **Sin rate limiting**: no hay throttling ni proteccion contra abuso. Para produccion se debe agregar a nivel de reverse proxy.
- **Sin WhatsApp real**: el pipeline produce `PipelineResult` (drafts/intenciones) pero no envia mensajes. El adapter de WhatsApp Gateway es la tarea siguiente.
- **Sin PostgreSQL**: el store de sesiones es `InMemoryMediationBridgeSessionStore`. Migrar a PostgreSQL cuando se implementen los adapters de persistencia.

## Archivos relevantes

| Archivo | Rol |
|---------|-----|
| `apps/core/src/bootstrap/server.ts` | Ruteo HTTP: `/health` + `/internal/pipeline/process` |
| `apps/core/src/bootstrap/internal-pipeline-handler.ts` | Handler: validacion + ejecucion |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Factory: cablea dependencias in-memory |
| `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts` | 14 tests HTTP integrados (1 test autocontenido Maria→Carlos round-trip) |
| `apps/core/src/server.ts` | Entry point: crea orchestrator y levanta servidor |
