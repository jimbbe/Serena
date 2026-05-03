# T18 — Mock WhatsApp Gateway / Dry-Run Adapter

## Overview

Self-contained mock WhatsApp Gateway at `apps/gateway-wa/` that simulates how a future real gateway would call Serena Core. Enables end-to-end dry-run testing of the full pipeline (normalize → call core → map result → log action) without connecting to real WhatsApp, Evolution API, or sending real messages.

## Architecture

The gateway-wa workspace is a self-contained npm workspace that:
1. Copies frozen domain types from `@serena/core` (T17A contract)
2. Communicates with Serena Core exclusively via HTTP (`POST /internal/pipeline/process`)
3. Always returns `sent: false` — this is a dry-run adapter
4. Uses zero npm dependencies — Node 22 built-in `fetch` and `node:test`

### Data Flow

```
MockWhatsAppEvent ──→ normalizeMockEvent() ──→ PipelineInput
                                                     │
                                          callSerenaCore(fetch)
                                                     │
                                          PipelineResult (or error)
                                                     │
                                       mapPipelineResultToGatewayAction()
                                                     │
                                          WhatsAppGatewayAction
                                                     │
                                          DryRunResult { sent: false }
```

## Type Reference

### Domain Types

| Type | Source | Description |
|------|--------|-------------|
| `MockWhatsAppEvent` | New (T18) | Simulated inbound WhatsApp message |
| `DryRunResult` | New (T18) | Outcome of dry-run execution |
| `PipelineResult` | Copied from core | Orchestrator output (8 variants) |
| `PipelineInput` | Copied from core | Normalized pipeline input |
| `WhatsAppGatewayAction` | Copied from core | Gateway action (5 variants) |
| `NormalizedWhatsAppInboundMessage` | Copied from core | Gateway-level inbound message |

### PipelineResult → GatewayAction Mapping

| PipelineResult.type | GatewayAction.action | wouldSend |
|---------------------|---------------------|-----------|
| `discard` | `ignore` | null |
| `conversation_pending` | `no_auto_send` | null |
| `risk_review_required` | `manual_review_required` | null |
| `mediation_not_understood` | `no_auto_send` | null |
| `recipient_not_found` | `no_auto_send` | null |
| `mediation_started` | `draft_ready` | `{ to, text }` |
| `mediation_reply_recorded` | `draft_ready` | `{ to, text }` |
| `ambiguous_active_session` | `manual_review_required` | null |

## Application Functions

### `normalizeMockWhatsAppEvent(event: MockWhatsAppEvent)`

Pure function. Validates `messageId`, `from`, and `text` are non-empty (after trimming). Maps to `PipelineInput`. Returns `{ ok: true, value }` or `{ ok: false, error }`. Reports ALL failing fields.

### `callSerenaCore(payload, messageId, config)`

Async HTTP client. Validates config (`coreUrl`, `internalToken`). Sends `POST` to `/internal/pipeline/process` with `X-Serena-Internal-Token` header. Throws on config errors, HTTP errors (non-2xx), or network errors.

### `mapPipelineResultToGatewayAction(result)`

Copied from core (T17A frozen contract). Pure function — no side effects. Maps every `PipelineResult` variant to a `WhatsAppGatewayAction`.

### `runDryGatewayEvent(event, config?)`

Orchestrates the full dry-run pipeline. Returns `DryRunResult` with:
- `sent: false` — always
- `mode: "dry_run"` — always
- `wouldSend` — populated only for `draft_ready` actions
- `error` — populated on validation/config/HTTP errors

## Usage Examples

### Dry-run with mediation_started result

```typescript
import { runDryGatewayEvent } from "@serena/gateway-wa/application/run-dry-gateway-event";

const event: MockWhatsAppEvent = {
  provider: "mock",
  instanceId: "serena-main",
  messageId: "test-001",
  from: "5491111111111",
  text: "Avisale a Carlos que llego tarde",
  timestamp: new Date().toISOString(),
};

const result = await runDryGatewayEvent(event);
// {
//   mode: "dry_run",
//   sent: false,
//   inputEvent: event,
//   normalizedPayload: { messageId: "test-001", senderWhatsAppId: "5491111111111", ... },
//   pipelineResult: { type: "mediation_started", sessionId: "s1", ... },
//   gatewayAction: { action: "draft_ready", toWhatsAppId: "carlos-id", text: "..." },
//   wouldSend: { to: "carlos-id", text: "..." }
// }
```

### Dry-run with validation error

```typescript
const invalidEvent: MockWhatsAppEvent = { ...event, messageId: "" };
const result = await runDryGatewayEvent(invalidEvent);
// {
//   mode: "dry_run",
//   sent: false,
//   inputEvent: invalidEvent,
//   normalizedPayload: null,
//   pipelineResult: null,
//   gatewayAction: null,
//   wouldSend: null,
//   error: "Missing or empty required fields: messageId"
// }
```

## Testing

38 tests using Node 22 built-in `node:test`. Fake `fetch` for deterministic HTTP simulation.

```bash
npm run -w @serena/gateway-wa test
```

Tests cover:
- Normalization (valid, trimming, missing fields)
- Mapping (all 8 PipelineResult variants)
- HTTP client (config errors, 401/403/500, network errors)
- Full dry-run flow (all 8 variants, wouldSend, sent always false)
- Error propagation (validation, config, HTTP, network)

## Related

- T17A: WhatsApp Gateway Contract (`docs/t17a-whatsapp-gateway-contract.md`)
- T17B: Internal Hardening (`docs/t17b-internal-hardening.md`)
- T16: Internal Pipeline HTTP (`docs/t16-internal-pipeline-http.md`)
