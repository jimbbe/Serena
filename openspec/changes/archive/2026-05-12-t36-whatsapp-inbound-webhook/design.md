# Design: T36 WhatsApp Inbound Webhook

## Technical Approach

Add a Core-only adapter endpoint, `POST /internal/webhook/whatsapp`, in `apps/core/src/bootstrap/`. The endpoint accepts the gateway-normalized WhatsApp payload, validates it, maps it to `InboundMessageCommand`, and calls the already shared `ProcessChannelInboundMessage` created by `createInMemoryPipeline()`. It reuses `/internal/*` token auth in `createHttpServer`, is not tied to simulation endpoints, and performs no Evolution API calls or outbound delivery.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Dedicated `whatsapp-webhook-handler.ts` in `apps/core/src/bootstrap/` | Extend `simulation-handler.ts`; reuse `/internal/pipeline/process` handler | Bootstrap handlers already own HTTP parsing/validation. A dedicated adapter prevents simulation coupling and avoids changing channel-inbound business logic. |
| Reuse `createInMemoryPipeline().processChannelInboundMessage` | Build a new `ProcessChannelInboundMessage` in `server.ts`; call old WhatsApp orchestrator | The factory already wires identity, conversation, mediation flow, outbound drafts, AI guide, and shared stores. Reusing it prevents split in-memory state. |
| Extract/reuse an internal auth dispatch helper in `bootstrap/server.ts` | Duplicate token checks per route | Specs require token-before-body for all `/internal/*`. One helper keeps 401/403/500 behavior identical and avoids drift. |
| Preserve metadata only under `command.metadata` | Flatten provider fields into command root; drop `raw` | The channel command already has metadata for channel extras. `ProcessChannelInboundMessage` does not pass metadata to AI guide, so provider payloads remain trace-only and do not influence LLM prompts. |
| No new idempotency store in T36 | Reuse `ProcessedMessageStore`; add durable cache | The spec only requires documenting future idempotency. Reusing the old store would be keyed only by `messageId` and could imply hidden cross-instance semantics. |

## Data Flow

```text
gateway-wa ─POST /internal/webhook/whatsapp─→ createHttpServer
  → internal token guard
  → createWhatsAppWebhookHandler
  → validate NormalizedWhatsAppInboundMessage
  → InboundMessageCommand(channel="whatsapp")
  → ProcessChannelInboundMessage
  → { received: true, routedTo: "serena-core", result }
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` | Create | JSON parsing, payload validation, mapping to `InboundMessageCommand`, response envelope. |
| `apps/core/src/bootstrap/server.ts` | Modify | Add `/internal/webhook/whatsapp` route and shared internal auth guard for `/internal/*`. |
| `apps/core/src/server.ts` | Modify | Wire handler from `createInMemoryPipeline().processChannelInboundMessage`; log route. |
| `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` | Create | HTTP integration tests for auth, routing, validation, mapping, normal pipeline execution, no simulation dependency. |
| `docs/open-questions.md` | Modify | Note durable webhook idempotency remains future work if not already documented sufficiently. |

## Interfaces / Contracts

```ts
type WhatsAppWebhookPayload = {
  channel?: "whatsapp";
  provider?: string;
  instanceId: string;
  messageId: string;
  senderWhatsAppId: string;
  senderName?: string;
  text: string;
  receivedAt: string;
  raw?: Record<string, unknown>;
};
```

Mapping:

```ts
{
  channel: "whatsapp",
  externalSenderId: senderWhatsAppId.trim(),
  text: text.trim(),
  occurredAt: receivedAt.trim(),
  metadata: { provider, instanceId, messageId, senderName, raw }
}
```

Validation mirrors current strict timestamp behavior from `internal-pipeline-handler.ts`: `receivedAt` must be a strict UTC ISO timestamp with `Z`. Optional `raw` must be a plain JSON object, not an array. The response is `{ received: true, routedTo: "serena-core", result }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/handler | Invalid required/optional fields and metadata mapping | `node:test` against `createWhatsAppWebhookHandler` through a small HTTP server. |
| Integration | `/internal/webhook/whatsapp` auth, method, disabled simulation mode, known/unknown sender, risk and mediation behavior | Mirror `bootstrap/tests/internal-pipeline-http.test.ts` with random port and `createInMemoryPipeline()`. |
| Regression | Existing pipeline and simulation routes unchanged | Run `npm run check`, `npm test`, `npm run test:gateway-wa`. |

## Migration / Rollout

No migration required. Rollback removes the route, handler, tests, and docs; gateway-wa returns to “Core endpoint missing”.

## Open Questions

- [ ] Durable de-duplication key and storage remain future work: likely `provider + instanceId + messageId` with PostgreSQL or Redis.
