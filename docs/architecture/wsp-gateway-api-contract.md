# WhatsApp Gateway API Contract

> **Status**: Draft — Phase 1 complete
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
Body: { "name": "serena-main", "webhookUrl": "http://whatsapp-gateway:3001/webhook/evolution" }
Response: 201 { "name": "serena-main", "qr": "base64...", "status": "disconnected", "apiKey": "<app-key>" }
```

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
Response: 200 { "qr": "base64...", "status": "disconnected" }
         or 200 { "status": "open", "message": "Already connected" }
```

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
```

---

## 4. Webhook Normalization

Evolution API webhook → NormalizedInboundMessage:

| Evolution API field | Normalized field |
|---------------------|------------------|
| `data.key.remoteJid` | `from` (strip @s.whatsapp.net) |
| `data.key.id` | `messageId` |
| `data.message.conversation` | `text` |
| `data.key.fromMe` | **DISCARD if true** (self-message loop prevention) |
| `data.pushName` | `senderName` (optional) |
| `data.messageTimestamp` | `timestamp` (convert to ISO 8601) |
| Instance name | `instanceId` |

### NormalizedInboundMessage

```typescript
type NormalizedInboundMessage = {
  instanceId: string;    // "serena-main"
  messageId: string;     // Evolution API message ID
  from: string;          // WhatsApp ID (e.g. "5491111111111")
  text: string;          // Message content
  timestamp: string;     // ISO 8601 UTC
  channel: "whatsapp";
  senderName?: string;   // Optional display name
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

*Document created during Phase 1 of wsp-phase1-gateway-preparation.*
