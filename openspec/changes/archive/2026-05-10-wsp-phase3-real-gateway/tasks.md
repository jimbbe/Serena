# Tasks: WhatsApp Gateway Phase 3 — Real Evolution API Integration

**Status**: Complete  
**PR**: #46  
**Branch**: `feat/wsp-phase3-real-gateway`  
**Verification**: aligned with `verify-report.md` — **PASS — READY FOR MERGE**

---

## T1 — Config module: env loading + validation

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/config.ts`
- `apps/gateway-wa/src/infrastructure/config.test.ts`

**Completed acceptance criteria**:
- [x] `loadConfig()` returns typed config with Phase 3 runtime vars.
- [x] `GATEWAY_MODE` defaults to `production` when unset.
- [x] `GATEWAY_PORT` defaults to `3001`.
- [x] Missing Evolution/API/auth/Core vars fail fast where required.
- [x] Dry-run mode skips Evolution API validation while preserving auth validation.
- [x] Unit tests cover production, dry-run, defaults, and missing vars.

---

## T2 — Auth middleware: 3-tier API key validation

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/auth/middleware.ts`
- `apps/gateway-wa/src/infrastructure/auth/middleware.test.ts`

**Completed acceptance criteria**:
- [x] Admin/app/evo keys are extracted from the correct headers.
- [x] `/health` remains unauthenticated.
- [x] `/instances*` requires admin key, `/send` app key, `/webhook/evolution` evo key.
- [x] Missing key returns 401; invalid/wrong tier returns 403.
- [x] Constant-time comparison is used and key values are not leaked.
- [x] Unit tests cover each tier, invalid/missing keys, wrong tier, and health exemption.

---

## T3 — Evolution API types + error mapping

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/evolution/types.ts`

**Completed acceptance criteria**:
- [x] Evolution request/response types are defined.
- [x] `EvolutionApiError` and timeout constants are defined.
- [x] `mapEvolutionError()` maps unreachable/timeout/errors to controlled gateway errors.

---

## T4 — Evolution API client: fetch wrapper

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/evolution/client.ts`
- `apps/gateway-wa/src/infrastructure/evolution/client.test.ts`

**Completed acceptance criteria**:
- [x] `createInstance`, `getConnectionState`, `connectInstance`, `sendText`, and `deleteInstance` call the expected Evolution endpoints.
- [x] All requests include `apikey` header.
- [x] Missing Evolution configuration fails fast.
- [x] `AbortSignal.timeout(30000)` is applied per request.
- [x] Unit tests use fake `globalThis.fetch` and cover endpoint shape/error cases.

---

## T5 — Webhook filter: self-message + non-text discard

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/filter.ts`
- `apps/gateway-wa/src/infrastructure/webhook/filter.test.ts`

**Completed acceptance criteria**:
- [x] Self-messages (`fromMe: true`) are discarded.
- [x] Text is extracted from `conversation` or `extendedTextMessage.text`.
- [x] Non-text/empty text payloads are discarded with `non-text`.
- [x] Unit tests cover self-message, image/media, empty text, valid text, and extended text fallback.

---

## T6 — Webhook normalizer: Evolution payload → NormalizedInboundMessage

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/normalizer.ts`
- `apps/gateway-wa/src/infrastructure/webhook/normalizer.test.ts`

**Completed acceptance criteria**:
- [x] Evolution payloads normalize to `NormalizedWhatsAppInboundMessage`.
- [x] WhatsApp JID suffix is stripped.
- [x] `messageId`, `text`, `senderName`, `receivedAt`, `instanceId`, `channel`, `provider`, and `raw` are mapped.
- [x] Unit tests cover standard text, extended text, timestamps, suffix stripping, and optional pushName.

---

## T7 — HTTP server: createServer + request parsing middleware

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/server.ts`
- `apps/gateway-wa/src/infrastructure/server.test.ts`

**Completed acceptance criteria**:
- [x] `createServer()`, `startServer()`, and `stopServer()` are implemented.
- [x] Middleware handles auth, body buffering, JSON parsing, routing, and errors.
- [x] 415, 413, 400, 404, and 405 cases return controlled JSON errors.
- [x] Unit/integration tests cover server lifecycle and request handling.

---

## T8 — Router: method + path → handler dispatch

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/router.ts`
- `apps/gateway-wa/src/infrastructure/router.test.ts`

**Completed acceptance criteria**:
- [x] `Router.register()` and route matching are implemented.
- [x] Path params are extracted.
- [x] Method mismatch returns allowed methods for 405 handling.
- [x] Unit tests cover exact match, params, method mismatch, and no match.

---

## T9 — Health endpoint handler

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/health.ts`
- `apps/gateway-wa/src/infrastructure/health.test.ts`

**Completed acceptance criteria**:
- [x] `GET /health` returns `200` with service status and mode.
- [x] Unit tests cover response shape and mode.

---

## T10 — Instance manager: CRUD wrapping Evolution client

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/instances/manager.ts`
- `apps/gateway-wa/src/infrastructure/instances/manager.test.ts`

**Completed acceptance criteria**:
- [x] `InstanceState` and in-memory lifecycle tracking are implemented.
- [x] Create/list/QR/delete operations wrap Evolution API where required.
- [x] Duplicate and not-found cases are handled.
- [x] Unit tests cover CRUD, QR states, duplicate, not-found, and status updates.

---

## T11 — Instance management endpoint handlers

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts`
- `apps/gateway-wa/src/infrastructure/instances/handlers.test.ts`

**Completed acceptance criteria**:
- [x] `POST /instances`, `GET /instances`, `GET /instances/:name/qr`, and `DELETE /instances/:name` handlers are implemented.
- [x] Name validation, duplicate, not-found, QR, connected/open, and delete responses are covered.
- [x] Unit tests cover endpoint handler behavior with mocked manager.

---

## T12 — Message sender: validate + call Evolution + map response

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/messages/sender.ts`
- `apps/gateway-wa/src/infrastructure/messages/sender.test.ts`

**Completed acceptance criteria**:
- [x] `sendText(instanceId, to, text)` validates required fields.
- [x] Instance existence and connection state are checked.
- [x] Evolution `sendText` response maps to `{ messageId, status: "sent", timestamp }`.
- [x] Validation, not-found, disconnected, stale-state, and Evolution errors are covered.

---

## T13 — Message sending endpoint handler

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/messages/handler.ts`
- `apps/gateway-wa/src/infrastructure/messages/handler.test.ts`

**Completed acceptance criteria**:
- [x] `POST /send` delegates to `MessageSender`.
- [x] Success, validation errors, not-found, and Evolution errors map to HTTP responses.
- [x] Unit tests cover handler behavior with mocked dependencies.

---

## T14 — Webhook receiver: full handler (dedup + filter + normalize + route)

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts`
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts`

**Completed acceptance criteria**:
- [x] `POST /webhook/evolution` receives Evolution payloads.
- [x] Duplicate message IDs are accepted without re-routing.
- [x] Self-messages and non-text messages are discarded.
- [x] Valid text messages normalize and route to Serena Core with internal token.
- [x] Missing Core URL is handled without crashing.
- [x] Unit tests cover duplicate, discard, normalize/route, missing Core URL, and connection updates.

---

## T15 — Entry point + bootstrap: index.ts with mode guard

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/index.ts`

**Completed acceptance criteria**:
- [x] `GATEWAY_MODE=dry_run` preserves dry-run behavior.
- [x] `GATEWAY_MODE=production` starts the HTTP gateway.
- [x] Missing required production env vars fail fast.
- [x] All Phase 3 routes are registered.
- [x] Graceful shutdown hooks are wired.

---

## T16 — package.json: add start script + exports

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/package.json`

**Completed acceptance criteria**:
- [x] `start` script exists for gateway runtime.
- [x] Existing workspace/test/typecheck scripts remain compatible.

---

## T17 — Integration tests: full endpoint flow

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/tests/integration.test.ts`

**Completed acceptance criteria**:
- [x] Server starts on dynamic port for tests.
- [x] All 7 endpoints are exercised.
- [x] Auth rejection, unknown route, and wrong method are covered.
- [x] Existing dry-run tests remain passing.
- [x] Added final integration coverage for `connection.update` and stale `/send` state.

---

## T18 — Update API contract doc: QR format clarification

**Status**: [x] Complete

**Files**:
- `docs/architecture/wsp-gateway-api-contract.md`

**Completed acceptance criteria**:
- [x] QR/pairing format is documented as a pairing code string from Evolution API.
- [x] Example response avoids base64 QR assumptions.
- [x] Evolution `pairingCode` behavior is documented.

---

## T19 — Webhook deduplication

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/dedup.ts`
- `apps/gateway-wa/src/infrastructure/webhook/dedup.test.ts`
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts`
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts`

**Completed acceptance criteria**:
- [x] Duplicate `messageId` within the dedup window is accepted without re-routing.
- [x] Dedup state is in-memory with lazy cleanup.
- [x] Tests cover first occurrence, duplicates, expiry, cleanup, and receiver integration.

---

## T20 — connection.update handling

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts`
- `apps/gateway-wa/src/infrastructure/evolution/types.ts`
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts`
- `apps/gateway-wa/src/tests/integration.test.ts`

**Completed acceptance criteria**:
- [x] `connection.update` events are detected before message normalization.
- [x] `open`, `connected`, `connecting`, `close`/`closed`/`disconnected`/`loggedOut`, and unknown states are mapped.
- [x] Untracked instance updates return 200 and do not crash.
- [x] Self-messages and non-text message behavior remains unchanged.

---

## T21 — InstanceManager.updateStatus

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/instances/manager.ts`
- `apps/gateway-wa/src/infrastructure/instances/manager.test.ts`

**Completed acceptance criteria**:
- [x] `updateStatus(name, status)` updates tracked instances.
- [x] Connected/open statuses set `connectedAt`.
- [x] Untracked instance updates are a no-op.
- [x] Unit tests cover open, connected, connecting, disconnected, and untracked updates.

---

## T22 — stale state fallback in /send

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/messages/sender.ts`
- `apps/gateway-wa/src/infrastructure/messages/sender.test.ts`
- `apps/gateway-wa/src/tests/integration.test.ts`

**Completed acceptance criteria**:
- [x] Manager `open`/`connected` sends without extra state check.
- [x] Manager `disconnected`/`connecting` checks Evolution connection state before blocking.
- [x] Evolution `open`/`connected` updates manager and allows send.
- [x] Evolution closed/disconnected blocks with `instance_not_connected`.
- [x] Evolution state-check failure returns controlled `502 evolution_unreachable`.

---

## T23 — document in-memory InstanceManager limitation

**Status**: [x] Complete

**Files**:
- `docs/architecture/wsp-gateway-api-contract.md`
- `docs/project-status.md`
- `apps/gateway-wa/README.md`
- `openspec/specs/gateway-instance-management/spec.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/design.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/proposal.md`

**Completed acceptance criteria**:
- [x] Gateway restart loses local instance tracking is documented.
- [x] Evolution API remains source of truth is documented.
- [x] Rehydration/persistence is out of Phase 3 scope.
- [x] MVP/demo requires recreate or revalidate after restart.

---

## T24 — document T36 Serena inbound dependency

**Status**: [x] Complete

**Files**:
- `README.md`
- `docs/architecture/wsp-gateway-api-contract.md`
- `docs/project-status.md`
- `apps/gateway-wa/README.md`
- `openspec/specs/gateway-webhook-receiver/spec.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/design.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/proposal.md`

**Completed acceptance criteria**:
- [x] Gateway target `POST /internal/webhook/whatsapp` is documented.
- [x] Serena Core endpoint is explicitly pending T36.
- [x] Inbound is not marketed as full end-to-end until T36 lands.
- [x] T36 was not implemented in this PR.

---

## T25 — document apps/gateway-wa production gateway decision

**Status**: [x] Complete

**Files**:
- `README.md`
- `apps/gateway-wa/README.md`
- `docs/architecture/wsp-gateway-api-contract.md`
- `docs/project-status.md`
- `openspec/specs/gateway-wa/spec.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/design.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/proposal.md`

**Completed acceptance criteria**:
- [x] `apps/gateway-wa` reuse is documented.
- [x] `dry_run` remains compatibility/testing mode.
- [x] `production` enables Evolution API real gateway behavior.
- [x] No `apps/gateway-whatsapp` workspace is created in Phase 3.

---

## T26 — align duplicate webhook response with spec

**Status**: [x] Complete

**Files**:
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts`
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts`
- `docs/architecture/wsp-gateway-api-contract.md`

**Completed acceptance criteria**:
- [x] Duplicate webhook response is `200 { "received": true, "duplicate": true }`.
- [x] Duplicate webhook is not re-routed.
- [x] Tests and API contract are aligned.

---

## T27 — final verification report

**Status**: [x] Complete

**Files**:
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/verify-report.md`
- `openspec/changes/archive/2026-05-10-wsp-phase3-real-gateway/tasks.md`

**Completed acceptance criteria**:
- [x] Verify report reflects `connection.update`, stale `/send`, in-memory limitation, T36 dependency, `apps/gateway-wa` decision, and duplicate response alignment.
- [x] Verify report verdict is `PASS — READY FOR MERGE`.
- [x] `tasks.md` has no implemented tasks left unchecked.
- [x] Validation commands pass.

---

## Validation

The final validation commands for this task update are recorded in the latest PR follow-up and must remain green before merge:

- [x] `npm run check`
- [x] `npm run test:gateway-wa`
- [x] `npm test`

---

## Dependency Graph

```text
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
T14 (webhook) ◄── T5, T6, T19, T20, T26                                ▼
T15 (index) ◄── T1, T7, T8, T9, T11, T13, T14          T12 (sender) ◄── T4, T10, T21, T22
                ▼                                                        ▼
T17 (integration) ◄── T15, T4, T20, T22                 T13 (handler) ◄── T12
                ▼
T18/T23/T24/T25/T27 (docs + final verification)
```

## Execution Order (completed)

1. [x] Foundation: T1, T3, T5, T8, T16
2. [x] Auth + Client: T2, T4, T6
3. [x] Server: T7
4. [x] Business logic: T9, T10, T11, T12, T13, T14
5. [x] Bootstrap: T15
6. [x] Integration: T17
7. [x] Initial docs: T18
8. [x] PR review follow-up: T19–T27
