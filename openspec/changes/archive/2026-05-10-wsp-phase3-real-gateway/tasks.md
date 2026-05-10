# Tasks: WhatsApp Gateway Phase 3 — Real Evolution API Integration

## T1 — Config module: env loading + validation

**Description**: Create `infrastructure/config.ts` that loads and validates all required environment variables. Returns a typed config object or throws on missing required vars in production mode.

**Files**:
- `apps/gateway-wa/src/infrastructure/config.ts` (create)
- `apps/gateway-wa/src/infrastructure/config.test.ts` (create)

**Dependencies**: None

**Acceptance criteria**:
- [ ] Exports `loadConfig()` returning typed config with all vars from design §Configuration
- [ ] `GATEWAY_MODE` defaults to `"production"` when unset (per spec)
- [ ] `GATEWAY_PORT` defaults to `3001`
- [ ] Missing `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` throws in production mode
- [ ] Missing `GATEWAY_ADMIN_KEY` / `GATEWAY_APP_KEY` / `GATEWAY_EVO_KEY` throws
- [ ] Missing `SERENA_CORE_URL` / `SERENA_INTERNAL_TOKEN` throws
- [ ] Dry-run mode skips Evolution/API key validation
- [ ] Unit tests cover: all vars set, each var missing, dry-run mode, production mode

---

## T2 — Auth middleware: 3-tier API key validation

**Description**: Create `infrastructure/auth/middleware.ts` that extracts API keys from request headers, validates against env-stored keys using constant-time comparison, and maps endpoints to required tiers.

**Files**:
- `apps/gateway-wa/src/infrastructure/auth/middleware.ts` (create)
- `apps/gateway-wa/src/infrastructure/auth/middleware.test.ts` (create)

**Dependencies**: T1 (config)

**Acceptance criteria**:
- [ ] `validateAuth(req, path)` returns `{ ok: true }` or `{ ok: false, status, body }`
- [ ] Extracts key from correct header per tier: `X-Gateway-Admin-Key`, `X-Gateway-App-Key`, `X-Gateway-Evo-Key`
- [ ] `/health` requires no auth (returns ok without checking)
- [ ] `/instances*` requires admin key
- [ ] `/send` requires app key
- [ ] `/webhook/evolution` requires evo key
- [ ] Wrong tier key → 403 (e.g. admin key on `/send`)
- [ ] Missing key → 401 `{ "error": "unauthorized", "message": "API key required" }`
- [ ] Invalid key → 403 `{ "error": "forbidden", "message": "Invalid API key" }`
- [ ] Constant-time comparison used (no early-return string comparison)
- [ ] Key values never appear in error messages
- [ ] Unit tests cover: each tier valid/invalid/missing, wrong tier, health exempt

---

## T3 — Evolution API types + error mapping

**Description**: Create `infrastructure/evolution/types.ts` with typed Evolution API request/response interfaces and error mapping utilities.

**Files**:
- `apps/gateway-wa/src/infrastructure/evolution/types.ts` (create)

**Dependencies**: None

**Acceptance criteria**:
- [ ] Types for: `CreateInstanceRequest`, `CreateInstanceResponse`, `ConnectionStateResponse`, `QrCodeResponse`, `SendTextRequest`, `SendTextResponse`, `DeleteInstanceResponse`
- [ ] `EvolutionApiError` type with mapped status codes
- [ ] `mapEvolutionError(err)`: connection refused → 502, timeout → 504, 4xx → mapped code, 5xx → passthrough
- [ ] Timeout constants: 5s connection, 30s full response

---

## T4 — Evolution API client: fetch wrapper

**Description**: Create `infrastructure/evolution/client.ts` wrapping native `fetch` to call Evolution API endpoints. Uses `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` from config.

**Files**:
- `apps/gateway-wa/src/infrastructure/evolution/client.ts` (create)
- `apps/gateway-wa/src/infrastructure/evolution/client.test.ts` (create)

**Dependencies**: T3 (types)

**Acceptance criteria**:
- [ ] `createInstance(name)` → `POST /instance/create` with `{ instanceName }`
- [ ] `getConnectionState(name)` → `GET /instance/connectionState/:name`
- [ ] `connectInstance(name)` → `GET /instance/connect/:name`
- [ ] `sendText(instanceName, number, text)` → `POST /message/sendText/:instanceName`
- [ ] `deleteInstance(name)` → `DELETE /instance/delete/:name`
- [ ] All requests include `apikey` header
- [ ] Missing `EVOLUTION_API_URL` fails fast with error mentioning the var
- [ ] Missing `EVOLUTION_API_KEY` fails fast with error mentioning the var
- [ ] `AbortSignal.timeout(30000)` applied per call
- [ ] Connection refused → 502 error with message mentioning Evolution API unreachable
- [ ] Unit tests use fake `globalThis.fetch` (existing pattern from dry-run tests)
- [ ] Tests cover: each endpoint correct URL/method/headers, missing config, connection error, 500 passthrough

---

## T5 — Webhook filter: self-message + non-text discard

**Description**: Create `infrastructure/webhook/filter.ts` with pure functions to discard self-messages (`fromMe:true`) and non-text messages.

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/filter.ts` (create)
- `apps/gateway-wa/src/infrastructure/webhook/filter.test.ts` (create)

**Dependencies**: None

**Acceptance criteria**:
- [ ] `isSelfMessage(payload)` → true if `data.key.fromMe === true`
- [ ] `extractText(payload)` → text from `data.message.conversation` or `data.message.extendedTextMessage.text`
- [ ] `shouldDiscard(payload)` returns `{ discard: true, reason }` or `{ discard: false }`
- [ ] Self-message → `{ discard: true, reason: "self_message" }`
- [ ] Image/audio/video without text → `{ discard: true, reason: "non-text" }`
- [ ] Empty conversation string → `{ discard: true, reason: "non-text" }`
- [ ] Valid text message → `{ discard: false }`
- [ ] Unit tests cover: self-message, image, empty text, valid text, extendedTextMessage fallback

---

## T6 — Webhook normalizer: Evolution payload → NormalizedInboundMessage

**Description**: Create `infrastructure/webhook/normalizer.ts` that maps Evolution API webhook payloads into `NormalizedInboundMessage` format per the API contract.

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/normalizer.ts` (create)
- `apps/gateway-wa/src/infrastructure/webhook/normalizer.test.ts` (create)

**Dependencies**: T5 (filter — uses `extractText`), existing domain type `NormalizedWhatsAppInboundMessage`

**Acceptance criteria**:
- [ ] `normalizeEvolutionPayload(payload, instanceId)` returns `NormalizedWhatsAppInboundMessage`
- [ ] `data.key.remoteJid` → `senderWhatsAppId` with `@s.whatsapp.net` stripped
- [ ] `data.key.id` → `messageId`
- [ ] Text from `extractText()` → `text`
- [ ] `data.pushName` → `senderName` (optional)
- [ ] `data.messageTimestamp` (unix seconds) → `receivedAt` (ISO 8601 UTC)
- [ ] `instanceId` parameter → `instanceId`
- [ ] `channel` fixed to `"whatsapp"`
- [ ] `raw` → full original payload
- [ ] Unit tests cover: standard text, extendedTextMessage, timestamp conversion, suffix stripping, pushName optional

---

## T7 — HTTP server: createServer + request parsing middleware

**Description**: Create `infrastructure/server.ts` with `node:http.createServer`, middleware chain (auth → body buffer → JSON parse → route dispatch → error handler), and start/stop lifecycle.

**Files**:
- `apps/gateway-wa/src/infrastructure/server.ts` (create)
- `apps/gateway-wa/src/infrastructure/server.test.ts` (create)

**Dependencies**: T1 (config), T2 (auth)

**Acceptance criteria**:
- [ ] `createServer(config, router)` returns `http.Server`
- [ ] Middleware chain: auth → body buffer → JSON parse → route dispatch → error handler
- [ ] `POST`/`PUT` without `Content-Type: application/json` → 415
- [ ] Body > 1 MB → 413 `{ "error": "payload_too_large" }`
- [ ] Invalid JSON body → 400 `{ "error": "invalid_json" }`
- [ ] Unknown route → 404 `{ "error": "not_found", "path": "<path>" }`
- [ ] Wrong HTTP method → 405 `{ "error": "method_not_allowed" }`
- [ ] All responses include `Content-Type: application/json`
- [ ] `startServer(server, port)` returns promise that resolves when listening
- [ ] `stopServer(server)` returns promise that resolves when closed
- [ ] Unit tests cover: 415, 413, 400, 404, 405, successful request flow

---

## T8 — Router: method + path → handler dispatch

**Description**: Create `infrastructure/router.ts` with a Map-based route table mapping `{method, path}` to handler functions. Supports path params (`:name`).

**Files**:
- `apps/gateway-wa/src/infrastructure/router.ts` (create)
- `apps/gateway-wa/src/infrastructure/router.test.ts` (create)

**Dependencies**: None

**Acceptance criteria**:
- [ ] `Router` class with `register(method, path, handler)` method
- [ ] `match(method, url)` returns `{ handler, params }` or null
- [ ] Path params extracted: `/instances/:name` with `/instances/serena-main` → `{ name: "serena-main" }`
- [ ] Exact method match required (GET ≠ POST for same path)
- [ ] Returns `{ allowedMethods }` when path matches but method doesn't (for 405)
- [ ] Unit tests cover: exact match, param extraction, method mismatch, no match

---

## T9 — Health endpoint handler

**Description**: Create `infrastructure/health.ts` with handler for `GET /health`. No auth required.

**Files**:
- `apps/gateway-wa/src/infrastructure/health.ts` (create)
- `apps/gateway-wa/src/infrastructure/health.test.ts` (create)

**Dependencies**: None

**Acceptance criteria**:
- [ ] `handleHealth(req)` returns `200 { "status": "ok", "service": "whatsapp-gateway", "mode": "<mode>" }`
- [ ] Mode reflects current `GATEWAY_MODE` value
- [ ] Unit test: returns correct shape with mode

---

## T10 — Instance manager: CRUD wrapping Evolution client

**Description**: Create `infrastructure/instances/manager.ts` with in-memory `Map<string, InstanceState>` tracking instance lifecycle, wrapping the Evolution client.

**Files**:
- `apps/gateway-wa/src/infrastructure/instances/manager.ts` (create)
- `apps/gateway-wa/src/infrastructure/instances/manager.test.ts` (create)

**Dependencies**: T4 (evolution client)

**Acceptance criteria**:
- [ ] `InstanceState` type: `{ name, status, qr, connectedAt }`
- [ ] `createInstance(name)` → calls Evolution create + connect, stores state, returns `{ name, qr, status: "disconnected" }`
- [ ] `listInstances()` → returns array of all tracked instances with status
- [ ] `getQrCode(name)` → returns cached QR or "connected" if status=open
- [ ] `deleteInstance(name)` → calls Evolution delete, removes from map
- [ ] Duplicate name → throws/returns conflict signal
- [ ] Non-existent name → throws/returns not-found signal
- [ ] Unit tests use fake Evolution client (dependency injection)
- [ ] Tests cover: create, list empty, list with instances, get QR disconnected, get QR connected, delete, duplicate, not-found

---

## T11 — Instance management endpoint handlers

**Description**: Create `infrastructure/instances/handlers.ts` with HTTP handlers for `POST /instances`, `GET /instances`, `GET /instances/:name/qr`, `DELETE /instances/:name`.

**Files**:
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts` (create)
- `apps/gateway-wa/src/infrastructure/instances/handlers.test.ts` (create)

**Dependencies**: T10 (manager)

**Acceptance criteria**:
- [ ] `POST /instances` with `{ "name": "..." }` → 201 with `{ name, status, qr, apiKey }`
- [ ] `POST /instances` with empty/invalid name → 400 `{ "error": "invalid_instance_name" }`
- [ ] `POST /instances` duplicate → 409 `{ "error": "instance_exists", "name": "..." }`
- [ ] `GET /instances` → 200 with array of `{ name, status, connectedAt }`
- [ ] `GET /instances/:name/qr` disconnected → 200 `{ qr, status: "disconnected" }`
- [ ] `GET /instances/:name/qr` connected → 200 `{ status: "connected", message: "Already connected" }`
- [ ] `GET /instances/:name/qr` not found → 404 `{ "error": "instance_not_found", "name": "..." }`
- [ ] `DELETE /instances/:name` → 200 `{ name, deleted: true }`
- [ ] `DELETE /instances/:name` not found → 404 `{ "error": "instance_not_found", "name": "..." }`
- [ ] Name validation: alphanumeric + hyphens only, non-empty
- [ ] Unit tests cover all scenarios with mocked manager

---

## T12 — Message sender: validate + call Evolution + map response

**Description**: Create `infrastructure/messages/sender.ts` with validation and Evolution API call for sending text messages.

**Files**:
- `apps/gateway-wa/src/infrastructure/messages/sender.ts` (create)
- `apps/gateway-wa/src/infrastructure/messages/sender.test.ts` (create)

**Dependencies**: T4 (evolution client), T10 (manager — for instance existence check)

**Acceptance criteria**:
- [ ] `sendText(instanceId, to, text)` validates: instanceId non-empty, to non-empty numeric, text non-empty after trim
- [ ] Validation failures return `{ ok: false, status: 400, error: "validation_error", fields: [...] }`
- [ ] Checks instance exists in manager before calling Evolution
- [ ] Instance not found → 404 `{ "error": "instance_not_found", "name": "..." }`
- [ ] Instance disconnected → 400 `{ "error": "instance_not_connected", "name": "...", "status": "disconnected" }`
- [ ] Calls Evolution `sendText` and maps response to `{ messageId, status: "sent", timestamp }`
- [ ] Evolution unreachable → 502 `{ "error": "evolution_unreachable", "message": "Evolution API is not reachable" }`
- [ ] Unit tests cover: valid send, missing fields, empty text, non-existent instance, disconnected instance, Evolution error

---

## T13 — Message sending endpoint handler

**Description**: Create `infrastructure/messages/handler.ts` with HTTP handler for `POST /send`.

**Files**:
- `apps/gateway-wa/src/infrastructure/messages/handler.ts` (create)
- `apps/gateway-wa/src/infrastructure/messages/handler.test.ts` (create)

**Dependencies**: T12 (sender)

**Acceptance criteria**:
- [ ] `POST /send` with `{ instanceId, to, text }` → 200 with `{ messageId, status: "sent", timestamp }`
- [ ] Missing `instanceId` → 400 `{ "error": "validation_error", "fields": ["instanceId"] }`
- [ ] Empty text after trim → 400 `{ "error": "validation_error", "fields": ["text"] }`
- [ ] Non-existent instance → 404
- [ ] Evolution unreachable → 502
- [ ] Unit tests cover all scenarios with mocked sender

---

## T14 — Webhook receiver: full handler (filter + normalize + route)

**Description**: Create `infrastructure/webhook/receiver.ts` with handler for `POST /webhook/evolution` that chains filter → normalize → route to Serena Core.

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` (create)
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` (create)

**Dependencies**: T5 (filter), T6 (normalizer), existing `call-serena-core.ts` pattern for routing

**Acceptance criteria**:
- [ ] `POST /webhook/evolution` receives Evolution payload
- [ ] Self-message → 200 `{ "ignored": true, "reason": "self_message" }` (no error logged)
- [ ] Non-text → 200 `{ "ignored": true, "reason": "non-text" }`
- [ ] Valid text → normalize → `POST {SERENA_CORE_URL}/internal/webhook/whatsapp` with normalized body
- [ ] Routing includes `X-Serena-Internal-Token` header
- [ ] Success → 200 `{ "received": true, "routedTo": "serena-core" }`
- [ ] Missing `SERENA_CORE_URL` → logs error, does not route
- [ ] Instance name extracted from URL path or payload
- [ ] Unit tests cover: self-message discard, image discard, empty text discard, valid text routed, missing core URL

---

## T15 — Entry point + bootstrap: index.ts with mode guard

**Description**: Create `apps/gateway-wa/src/index.ts` as server entry point. Reads `GATEWAY_MODE`, starts HTTP server in production mode, preserves dry-run CLI path.

**Files**:
- `apps/gateway-wa/src/index.ts` (create)

**Dependencies**: T1 (config), T7 (server), T8 (router), T9 (health), T11 (instance handlers), T13 (message handler), T14 (webhook handler)

**Acceptance criteria**:
- [ ] `GATEWAY_MODE=dry_run` → no HTTP server, dry-run CLI path only
- [ ] `GATEWAY_MODE=production` (or unset) → starts HTTP server
- [ ] Missing required env vars → fatal error with clear message naming the var
- [ ] Server registers all routes: `GET /health`, `POST /instances`, `GET /instances`, `GET /instances/:name/qr`, `DELETE /instances/:name`, `POST /send`, `POST /webhook/evolution`
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Logs port on startup

---

## T16 — package.json: add start script + exports

**Description**: Update `apps/gateway-wa/package.json` with `start` script and new exports for infrastructure modules.

**Files**:
- `apps/gateway-wa/package.json` (modify)

**Dependencies**: None (can be done in parallel, but must exist before T15 runs)

**Acceptance criteria**:
- [ ] `"start": "node --experimental-strip-types src/index.ts"` added to scripts
- [ ] Exports updated if infrastructure modules are externally importable

---

## T17 — Integration tests: full endpoint flow

**Description**: Create `apps/gateway-wa/src/tests/integration.test.ts` that starts the real server and tests all 7 endpoints end-to-end with fake Evolution API.

**Files**:
- `apps/gateway-wa/src/tests/integration.test.ts` (create)

**Dependencies**: T15 (entry point), T4 (fake fetch for Evolution)

**Acceptance criteria**:
- [ ] Server starts on port 0 (dynamic) for tests
- [ ] `GET /health` → 200 without auth
- [ ] `POST /instances` with admin key → 201
- [ ] `GET /instances` with admin key → 200 with array
- [ ] `GET /instances/:name/qr` with admin key → 200
- [ ] `DELETE /instances/:name` with admin key → 200
- [ ] `POST /send` with app key → 200
- [ ] `POST /webhook/evolution` with evo key → 200
- [ ] Auth rejection: 401 without key, 403 with wrong key, 403 with wrong tier
- [ ] Unknown route → 404
- [ ] Wrong method → 405
- [ ] All 59 existing dry-run tests still pass (regression)

---

## T18 — Update API contract doc: QR format clarification

**Description**: Update `docs/architecture/wsp-gateway-api-contract.md` to clarify QR returns pairing code string (not base64).

**Files**:
- `docs/architecture/wsp-gateway-api-contract.md` (modify)

**Dependencies**: None

**Acceptance criteria**:
- [ ] QR format documented as pairing code string from Evolution API
- [ ] Example response shows `{ "qr": "ABCD1234" }` not base64
- [ ] Note added that Evolution API returns `{ pairingCode: "..." }` format

---

## Dependency Graph

```
T1 (config) ──────────────────────────────────────────────────────────────┐
T3 (evo types) ───────────────────────────────────────────────────────────┤
T5 (filter) ────┐                                                        │
T8 (router) ────┤                                                        │
T16 (package) ──┤                                                        │
                ▼                                                        ▼
T2 (auth) ◄── T1                                          T4 (evo client) ◄── T3
                ▼                                                        ▼
T7 (server) ◄── T1, T2, T8                                T10 (manager) ◄── T4
                ▼                                                        ▼
T9 (health) ──►                                                        T11 (handlers) ◄── T10
T14 (webhook) ◄── T5, T6                                               ▼
T15 (index) ◄── T1, T7, T8, T9, T11, T13, T14          T12 (sender) ◄── T4, T10
                ▼                                                        ▼
T17 (integration) ◄── T15, T4                            T13 (handler) ◄── T12
                ▼
T18 (docs) ────► (parallel, no deps)
```

## Execution Order (serialized for safety)

1. **Foundation**: T1, T3, T5, T8, T16 (parallel — no interdependencies)
2. **Auth + Client**: T2 (after T1), T4 (after T3), T6 (after T5)
3. **Server**: T7 (after T1, T2, T8)
4. **Business logic**: T10 (after T4), T9 (standalone)
5. **Handlers**: T11 (after T10), T12 (after T4, T10), T14 (after T5, T6)
6. **Message handler**: T13 (after T12)
7. **Bootstrap**: T15 (after T7, T8, T9, T11, T13, T14)
8. **Integration**: T17 (after T15)
9. **Docs**: T18 (parallel — can be done anytime)
