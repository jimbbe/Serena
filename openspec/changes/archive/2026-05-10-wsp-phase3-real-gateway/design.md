# Design: Phase 3 — Real Evolution API Gateway

## Technical Approach

Add `infrastructure/` layer alongside existing `domain/` and `application/` in `apps/gateway-wa/`. Zero changes to existing files — purely additive. `node:http` server, native `fetch`, zero npm deps. Dry-run mode preserved via `GATEWAY_MODE` env guard.

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| HTTP framework | node:http (built-in) | Express/Fastify | **node:http** | Zero deps. Gateway has 7 endpoints — no need for framework overhead. Follows existing pattern (call-serena-core.ts uses native fetch). |
| Instance state | In-memory Map | SQLite/file | **In-memory Map** | Evolution API is source of truth. Gateway only caches routing metadata. Restart-safe later if needed. |
| QR format | Pairing code string | Base64 image | **String as-is** | Evolution API returns `{ pairingCode: "ABCD1234" }`, not base64. Gateway returns code unchanged. |
| Error strategy | Evolution errors → 502 | Evolution errors → passthrough | **502 + message** | Hide Evolution internals. Map connection errors → 502, Evolution status codes → mapped gateway codes. |
| Test mocking | Fake fetch (existing pattern) | MSW/nock | **Fake fetch** | Follows existing pattern in `dry-run-gateway.test.ts`. Zero deps. Deterministic. |

## Directory Structure

```
apps/gateway-wa/src/infrastructure/
├── config.ts                 # Env loading + validation (GATEWAY_MODE, keys, Evolution URL)
├── server.ts                 # createServer, middleware chain, start/stop
├── router.ts                 # Route table → handler dispatch
├── evolution/
│   ├── client.ts             # Evolution API fetch wrapper (createInstance, getQrCode, sendText, deleteInstance, listInstances)
│   └── types.ts              # Evolution request/response types + error mapping
├── webhook/
│   ├── receiver.ts           # POST /webhook/evolution handler
│   ├── normalizer.ts         # Evolution payload → NormalizedInboundMessage (per API contract §4)
│   └── filter.ts             # fromMe:true discard, non-text discard
├── auth/
│   └── middleware.ts          # 3-tier key extraction + validation
├── instances/
│   ├── manager.ts            # Instance CRUD wrapping Evolution client
│   └── routing.ts            # Hardcoded instanceId → consumerUrl map
├── messages/
│   └── sender.ts             # Validate → call Evolution sendText → map response
├── index.ts                  # Server bootstrap (GATEWAY_MODE guard, start)
└── *.test.ts                 # Unit tests co-located with source
```

## Data Flow

```
                   ┌── Auth MW (extract key, validate tier) ──┐
                   │                                           │
  GET /health ─────┤                                           ├──→ 200 OK
  POST /instances ─┤  ┌─ Auth MW ─→ json parse ─→ manager ────┤──→ Evolution API
  GET /instances ──┤  │                                        │
  GET /:name/qr ───┤  │                                        │
  DELETE /:name ───┤  │                                        │
  POST /send ──────┤  │                                        │
                   │  │                                        │
  POST /webhook ───┤  └─ Auth(evo-key) ─→ filter ─→ normalize ─┤──→ route to consumer
                   │                                              │
                   └──────────────────────────────────────────────┘
```

## Component Design

### HTTP Server (`server.ts`, `router.ts`)
- `node:http.createServer` with async handler.
- Middleware chain applied in order: auth → buffer body → JSON parse → route dispatch → error handler.
- `router.ts` maps `{method, path}` to handler functions via Map.
- Each handler receives parsed `IncomingMessage` + body and returns `{status, body}`.

### Auth Middleware (`auth/middleware.ts`)
- Keys loaded from env: `GATEWAY_ADMIN_KEY`, `GATEWAY_APP_KEY`, `GATEWAY_EVO_KEY`.
- Extract key from `X-Gateway-Admin-Key`, `X-Gateway-App-Key`, or `X-Gateway-Evo-Key` header.
- Validate against stored key using constant-time comparison.
- Map endpoint to required tier (health=none, /instances*=admin, /send=app, /webhook=evo).
- Rejected → 401 (missing) or 403 (invalid).

### Evolution Client (`evolution/client.ts`)
- Wraps native `fetch` to `{EVOLUTION_API_URL}` with `apikey: {EVOLUTION_API_KEY}` header.
- Methods: `createInstance(name, webhookUrl)`, `connectInstance(name)`, `getQrCode(name)`, `sendText(instance, to, text)`, `deleteInstance(name)`, `listInstances()`.
- Map Evolution errors: connection refused → 502, timeout → 504, 4xx → mapped code.
- Timeout: 30s per call via `AbortSignal.timeout`.

### Webhook Receiver (`webhook/`)
- **Filter**: Discard if `data.key.fromMe === true` (200 `{ignored:true, reason:"self-message"}`). Discard non-text messages (no `data.message.conversation`).
- **Normalizer**: Map Evolution payload → `NormalizedWhatsAppInboundMessage` using existing domain type. Add `channel: "whatsapp"`, strip `@s.whatsapp.net` suffix from remoteJid, convert unix timestamp to ISO 8601.
- **Route**: Look up instanceId in routing table → `POST` to consumer URL with normalized payload.

### Instance Manager (`instances/manager.ts`)
- Wraps Evolution client CRUD.
- In-memory `Map<string, InstanceState>` tracking name, status, qr, connectedAt.
- `createInstance`: call Evolution create + connect, store state, return {name, qr, status}.
- `getQrCode`: return cached code or "connected" if status=open.

### Message Sender (`messages/sender.ts`)
- Validate: instanceId exists, `to` is non-empty, `text` is non-empty.
- Call Evolution `sendText`. Map response: `{messageId, status: "sent", timestamp}`.
- Validation failures → 400. Instance not found → 404.

## Configuration

| Variable | Required | Used by | Default |
|----------|----------|---------|---------|
| `GATEWAY_MODE` | No | Server bootstrap | `"dry_run"` (preserves existing behavior) |
| `GATEWAY_PORT` | No | HTTP server | `3001` |
| `EVOLUTION_API_URL` | Yes (real mode) | Evolution client | — |
| `EVOLUTION_API_KEY` | Yes (real mode) | Evolution client | — |
| `GATEWAY_ADMIN_KEY` | Yes | Auth middleware | — |
| `GATEWAY_APP_KEY` | Yes | Auth middleware | — |
| `GATEWAY_EVO_KEY` | Yes | Auth middleware | — |
| `SERENA_CORE_URL` | Yes | Call serena core (existing) | — |
| `SERENA_INTERNAL_TOKEN` | Yes | Call serena core (existing) | — |

Loaded in `config.ts` via `process.env` (matching existing pattern in `call-serena-core.ts`). Config validation runs at server start — missing required vars → fatal error.

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit — auth | Key extraction, validation, tier mismatch | Call middleware directly with fake IncomingMessage |
| Unit — webhook | Normalizer field mapping, filter logic | Call normalizer/filter with fixture payloads |
| Unit — evolution | Client error mapping, timeout handling | Fake fetch (set globalThis.fetch) |
| Unit — messages | Validation, response mapping | Call sender with valid/invalid inputs |
| Integration | Full endpoint flow (7 endpoints) | Start server on `:0`, HTTP requests via native fetch, fake Evolution API via fake fetch |
| Regression | All 59 existing dry-run tests | `node --experimental-strip-types --test src/**/*.test.ts` |

## Security Considerations

- **Keys never logged**: Auth failures log "unauthorized" without key value.
- **Env var only**: No config files, no defaults for keys — missing → fatal.
- **Constant-time comparison**: Prevents timing attacks on key validation.
- **Input validation**: All request bodies validated before processing. Non-JSON bodies → 400.
- **No Evolution API exposure**: Gateway is single control point. Evolution API never published to internet (per network plan).
- **Rate limiting**: Not in MVP (Phase 6). Documented as future concern.
- **Webhook self-filter**: `fromMe:true` discarded at entry — prevents echo loops.

## Open Questions

- [ ] Should instance state survive gateway restart? (Current: no — Evolution API is source of truth.)
- [ ] Should QR codes be re-fetched from Evolution on every request? (Current: cache in memory until connected.)
