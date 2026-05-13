# Tasks: T36 — WhatsApp Inbound Webhook

## Phase 1: OpenSpec alignment

- [x] 1.1 Keep `openspec/changes/t36-whatsapp-inbound-webhook/{proposal.md,design.md,specs/*/spec.md,tasks.md}` aligned with the final webhook shape and internal-auth scenarios.
- [x] 1.2 Update `docs/open-questions.md` only if T36 needs to restate durable webhook idempotency as future work.

## Phase 2: Core webhook adapter

- [x] 2.1 Add `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` to validate the gateway payload, map it to `InboundMessageCommand`, and call `ProcessChannelInboundMessage.execute()`.
- [x] 2.2 Refactor `apps/core/src/bootstrap/server.ts` to share one internal token guard for all `/internal/*` routes, preserving token-before-body behavior for `/internal/webhook/whatsapp`.
- [x] 2.3 Wire `POST /internal/webhook/whatsapp` in `apps/core/src/server.ts` using the shared `createInMemoryPipeline().processChannelInboundMessage` instance; keep `ENABLE_SIMULATION_ENDPOINTS` out of this path.

## Phase 3: Integration tests

- [x] 3.1 Add `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` covering missing token, wrong token, missing env, token-before-body, and method/routing failures.
- [x] 3.2 Add validation cases for required fields, strict `receivedAt`, `channel=whatsapp`, optional `provider`/`senderName`/`raw`, and invalid-payload field reporting.
- [x] 3.3 Add happy-path cases for known sender, unknown sender, mediation request, risk/urgency request, and metadata preservation through `ProcessChannelInboundMessage`.

## Phase 4: Docs and release readiness

- [x] 4.1 Update `README.md`, `apps/core/README.md`, and `docs/project-status.md` to note the new internal webhook and end-to-end gateway→core inbound flow.
- [x] 4.2 Run `npm run check`, `npm test`, and `npm run test:gateway-wa`; fix failures before opening the PR.
- [x] 4.3 Confirm PR readiness: no spec drift, no secrets, and T36 changes stay limited to webhook adapter, wiring, tests, and docs.
