## Exploration: t36-whatsapp-inbound-webhook

### Current State
`apps/gateway-wa` already normalizes Evolution inbound webhooks into `NormalizedWhatsAppInboundMessage` and posts them to `POST /internal/webhook/whatsapp` with `X-Serena-Internal-Token`. Serena Core does not expose that route yet. The existing internal HTTP endpoint, `POST /internal/pipeline/process`, is legacy-orchestrator-specific: it validates `messageId`, `senderWhatsAppId`, `messageText|text`, optional strict UTC `receivedAt`, checks idempotency in `ProcessedMessageStore`, and executes `ProcessIncomingWhatsAppMessage`. By contrast, the channel-agnostic path already exists via `ProcessChannelInboundMessage.execute(InboundMessageCommand)`, and `createInMemoryPipeline()` already returns a fully wired `processChannelInboundMessage` instance with shared identity, conversation, contact, mediation-flow, outbound-draft, and AI-guide dependencies.

### Affected Areas
- `apps/core/src/bootstrap/server.ts` — add `/internal/webhook/whatsapp` routing and reuse the same token-before-body pattern used by `/internal/pipeline/process`.
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — already exposes the shared `processChannelInboundMessage`; this is the safest wiring point for T36.
- `apps/core/src/bootstrap/simulation-handler.ts` — existing validation/JSON-response style is the closest pattern for a `ProcessChannelInboundMessage` HTTP adapter.
- `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts` — target command shape for the webhook mapping (`channel`, `externalSenderId`, `text`, optional `occurredAt`, `metadata`, etc.).
- `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` — target use case; metadata is free-form `Record<string, unknown>` and identity resolution happens before gate evaluation.
- `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts` — existing server integration-test style for auth/order/JSON/405/404.
- `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` — existing integration-test style for `ProcessChannelInboundMessage` request validation and success/error behavior.
- `openspec/specs/gateway-webhook-receiver/spec.md` — existing gateway-side dependency spec that currently marks T36 as pending.
- `openspec/specs/internal-auth/spec.md` — internal auth already applies to `/internal/*`; T36 should add scenarios for the new webhook endpoint.
- `openspec/specs/inbound-simulation-endpoint/spec.md` and/or a new inbound-webhook spec — closest existing contract for command validation and channel-inbound routing.
- `README.md`, `docs/project-status.md`, `apps/gateway-wa/README.md`, `docs/architecture/wsp-gateway-api-contract.md` — all currently state that `/internal/webhook/whatsapp` is still pending.

### Approaches
1. **Dedicated WhatsApp webhook handler** — add a new bootstrap handler that validates `NormalizedWhatsAppInboundMessage`, maps it to `InboundMessageCommand`, and calls the shared `processChannelInboundMessage` instance.
   - Pros: Smallest change, clear boundary between gateway contract and channel-inbound command, matches current bootstrap patterns.
   - Cons: Some request parsing/response helpers will be duplicated unless lightly extracted later.
   - Effort: Low

2. **Generic inbound HTTP adapter refactor** — first extract a reusable HTTP adapter for `ProcessChannelInboundMessage`, then plug simulation and WhatsApp webhook into it.
   - Pros: Less duplication long-term, cleaner bootstrap surface.
   - Cons: Bigger refactor before delivering T36, touches working simulation code without product need.
   - Effort: Medium

### Recommendation
Use **Approach 1**. Add a dedicated `createWhatsAppWebhookHandler(...)` in `apps/core/src/bootstrap/`, validate the gateway payload shape, map it to `InboundMessageCommand`, and call the already-shared `processChannelInboundMessage` returned by `createInMemoryPipeline()`. Preserve internal auth in `server.ts` with the same fail-fast ordering as `/internal/pipeline/process`.

Recommended mapping:
- `channel`: `"whatsapp"` (or validate provided `channel` is absent/`"whatsapp"`)
- `externalSenderId`: `senderWhatsAppId`
- `text`: `text`
- `occurredAt`: `receivedAt`
- `metadata`: `{ provider, instanceId, messageId, senderName?, raw }`

### Risks
- **Auth drift**: if `/internal/webhook/whatsapp` reimplements token checks differently, behavior can diverge from `/internal/pipeline/process`.
- **State split**: if T36 instantiates a second `ProcessChannelInboundMessage` instead of reusing the factory-returned one, conversation/flow state can diverge from other in-process paths.
- **Spec gap**: there is no main OpenSpec dedicated to Serena Core’s inbound WhatsApp webhook yet; proposal/spec phase should decide whether to delta `inbound-simulation-endpoint` or introduce a dedicated `whatsapp-inbound-webhook` spec.
- **Payload context creep**: `raw` fits `metadata`, but it may enlarge in-memory traces and test fixtures; keep it as pass-through metadata, not parsed business logic.

### Ready for Proposal
Yes — proposal should define one new Serena Core internal endpoint, reuse shared internal auth, reuse the existing channel-inbound use case, and add a dedicated delta spec for the core-side webhook contract.
