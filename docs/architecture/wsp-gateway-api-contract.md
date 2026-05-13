# WhatsApp Gateway API Contract

> **Status**: Phase 3 current contract — real Evolution API gateway implemented, inbound webhook route in Serena Core available (`POST /internal/webhook/whatsapp`)
> **Scope**: API contract for the agnostic WhatsApp Gateway service
> **Image**: `evolutionapi/evolution-api:latest`

---

## 1. Purpose

The WhatsApp Gateway is a standalone service that:
- Manages Evolution API instances (one per WhatsApp number)
- Receives webhooks from Evolution API and normalizes messages
- Routes inbound messages to the correct consumer app
- Exposes a simple REST API for sending messages
- Is agnostic to project-specific business logic

---

## 2. Authentication Model

3-tier API keys:

| Tier | Header | Used by | Permissions |
|------|--------|---------|-------------|
| Admin | `X-Gateway-Admin-Key` | Operators | Create/delete instances, get QR, list instances |
| App Consumer | `X-Gateway-App-Key` | Serena, future apps | Send messages, receive webhook responses |
| Evolution API | `X-Gateway-Evo-Key` | Evolution API webhooks | POST /webhook/evolution only |

---

## 3. Endpoints

### 3.1 Health Check

```
GET /health
Auth: None
Response: 200 { "status": "ok", "service": "whatsapp-gateway" }
```

### 3.2 Create Instance

```
POST /instances
Auth: Admin key
Body: { "name": "serena-main" }
Response: 201 { "name": "serena-main", "qr": "pairing-code-string", "status": "disconnected", "apiKey": "<app-key>" }
```
> **QR Format Note**: The `qr` field contains a pairing code string from Evolution API,
> NOT base64 image data. See §3.4 for details.

### 3.3 List Instances

```
GET /instances
Auth: Admin key
Response: 200 [{ "name": "serena-main", "status": "open", "connectedAt": "..." }]
```

### 3.4 Get QR Code

```
GET /instances/:name/qr
Auth: Admin key
Response: 200 { "qr": "PAIR-CODE-1234", "status": "disconnected" }
          or 200 { "status": "connected", "message": "Already connected" }
```

> **QR Format Note (Phase 3)**: The `qr` field returns a pairing code string (e.g. `"ABCD1234"`),
> NOT base64-encoded image data. Evolution API returns `{ pairingCode: "..." }` in the
> connect response, and the gateway passes this value through unchanged.
> Previous documentation showing base64 QR was incorrect.

### 3.5 Delete Instance

```
DELETE /instances/:name
Auth: Admin key
Response: 200 { "name": "serena-main", "deleted": true }
```

### 3.6 Send Message

```
POST /send
Auth: App consumer key
Body: { "instanceId": "serena-main", "to": "5491111111111", "text": "Hello" }
Response: 200 { "messageId": "...", "status": "sent", "timestamp": "..." }
```

### 3.7 Webhook Receiver (Internal)

```
POST /webhook/evolution
Auth: Evolution API key
Body: Evolution API webhook payload
Response: 200 { "received": true, "routedTo": "serena-core" }
Duplicate response: 200 { "received": true, "duplicate": true }
```

---

## 4. Webhook Normalization

Evolution API webhook → NormalizedInboundMessage:

| Evolution API field | Normalized field |
|---------------------|------------------|
| `data.key.remoteJid` | `senderWhatsAppId` (strip @s.whatsapp.net) |
| `data.key.id` | `messageId` |
| `data.message.conversation` | `text` |
| `data.key.fromMe` | **DISCARD if true** (self-message loop prevention) |
| `data.pushName` | `senderName` (optional) |
| `data.messageTimestamp` | `receivedAt` (convert to ISO 8601) |
| Instance name | `instanceId` |

### NormalizedInboundMessage

```typescript
type NormalizedInboundMessage = {
  provider: string;      // "evolution", "twilio", "meta", etc.
  instanceId: string;    // "serena-main"
  messageId: string;     // Evolution API message ID
  senderWhatsAppId: string; // WhatsApp ID (e.g. "5491111111111")
  text: string;          // Message content
  receivedAt: string;    // ISO 8601 UTC
  channel: "whatsapp";
  senderName?: string;   // Optional display name
  raw: Record<string, unknown>; // Raw provider payload for traceability
};
```

---

## 5. Routing Table (MVP)

| Instance ID | Consumer App | Webhook URL |
|-------------|--------------|-------------|
| `serena-main` | serena-core | `http://serena-core:3000/internal/webhook/whatsapp` |

Future: configurable routing table.

---

## 6. Error Handling

| Scenario | Response | Action |
|----------|----------|--------|
| Missing API key | 401 | Log + reject |
| Invalid API key | 403 | Log + reject |
| Instance not found | 404 | Log + reject |
| Evolution API unreachable | 502 | Retry with exponential backoff (max 3) |
| Evolution API error | 500 | Log + return error detail |
| Self-message (fromMe: true) | 200 { "ignored": true } | Silently discard |
| Non-text message | 200 { "ignored": true, "reason": "non-text" } | Log + discard |
| Duplicate messageId within 5 minutes | 200 { "received": true, "duplicate": true } | Do not re-route |

### Timeouts

| Operation | Timeout |
|-----------|---------|
| TCP connection | 5 seconds |
| HTTP response | 30 seconds |
| Retry total | Max 3 attempts in 60 seconds |

---

## 7. Security

- Evolution API **never** exposed publicly
- Gateway is the single point of control for all WhatsApp operations
- All internal communication via Docker networks (no TLS needed between containers)
- API keys rotated by changing env vars and restarting services
- Webhook signature validation (HMAC) between Evolution API and Gateway

---

## 8. Webhook Events

The gateway accepts two types of webhook events from Evolution API:

### 8.1 MESSAGES_UPSERT

Inbound text messages. Processed through: dedup → filter → normalize → route.

### 8.2 connection.update

Connection state changes. The gateway updates its internal InstanceManager status:

| Evolution state | Gateway status |
|----------------|----------------|
| `open` | `open` |
| `connecting` | `connecting` |
| `connected` | `connected` |
| `close`, `closed`, `disconnected`, `loggedOut` | `disconnected` |
| (unknown) | `connecting` |

Response: `200 { "received": true, "instance": "...", "status": "..." }`

If the instance is not tracked by the manager, the event is silently ignored (no crash).

---

## 9. Instance State Management

### 9.1 In-memory limitation (Phase 3)

The `InstanceManager` stores instance state **in memory only** (JavaScript `Map`).

**Implications:**
- If the gateway process restarts, it loses all local instance tracking.
- Evolution API continues to maintain sessions in its own PostgreSQL database.
- After a gateway restart, instances must be recreated via `POST /instances` or re-validated.
- The `/send` endpoint includes a **stale state fallback**: if the manager reports `disconnected` or `connecting`, it queries Evolution API directly for the real connection state before blocking the request.

**Future phases:** Persistence (SQLite/PostgreSQL) or rehydration from Evolution API on startup.

### 9.2 Stale connection state in /send

When `POST /send` is called and the manager reports a non-connected status:

1. Gateway calls Evolution API `GET /instance/connectionState/{name}`
2. If Evolution reports `open` or `connected` → manager is updated, message is sent
3. If Evolution reports `close`/`closed`/`disconnected` → returns `400 instance_not_connected`
4. If Evolution API is unreachable → returns `502 evolution_unreachable`

This prevents false negatives where the user scanned the QR and Evolution is connected, but the gateway's in-memory cache is stale.

---

## 10. Dependencies

### 10.1 Serena Core webhook endpoint (T36)

The gateway routes inbound messages to:

```
POST http://serena-core:3000/internal/webhook/whatsapp
```

**This endpoint exists in Serena Core** and is protected by `X-Serena-Internal-Token` using the same internal auth rules as `/internal/pipeline/process`.

**Current behavior:**
- If `SERENA_CORE_URL` is not configured, the gateway accepts the webhook but does not route it.
- If Serena Core returns an error, the gateway logs the error but still returns `200 { "received": true }` to Evolution API (to prevent retry loops).

**End-to-end inbound routing gateway → core is now available** for normalized WhatsApp inbound payloads.

---

## 11. Architecture Decision: apps/gateway-wa

**Decision**: Reuse `apps/gateway-wa/` as the production WhatsApp Gateway instead of creating a separate `apps/gateway-whatsapp/`.

**Rationale:**
- The existing `gateway-wa` module already has the correct domain types, application layer, and 59 dry-run tests.
- Adding an `infrastructure/` layer is purely additive — no existing code is modified or broken.
- The `GATEWAY_MODE` environment variable controls behavior:
  - `dry_run` (or unset in dev) → existing mock/dry-run behavior (59 tests)
  - `production` → real Evolution API integration with HTTP server
- A separate workspace would duplicate significant logic and create maintenance overhead.
- The gateway remains agnostic to Serena business logic — it can be extracted to its own repo later if needed.

---

*Document created during Phase 1 of wsp-phase1-gateway-preparation. Updated during Phase 3 (wsp-phase3-real-gateway).*
