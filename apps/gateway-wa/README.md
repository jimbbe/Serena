# WhatsApp Gateway (`apps/gateway-wa`)

Self-contained WhatsApp Gateway workspace with two modes:

- `dry_run`: preserves the original mock adapter and never sends real WhatsApp messages.
- `production`: starts the real HTTP gateway backed by Evolution API.

Phase 3 intentionally reuses `apps/gateway-wa/` as the real gateway workspace instead of creating `apps/gateway-whatsapp/`.

## Purpose

### Dry-run mode

- Simulate inbound WhatsApp events from test users
- Normalize mock events into `PipelineInput` for Serena Core
- Call `POST /internal/pipeline/process` on Serena Core via HTTP
- Map `PipelineResult` to `WhatsAppGatewayAction`
- Return a `DryRunResult` with complete execution trace
- **Never sends real WhatsApp messages** — `sent` is always `false`

### Production mode

- Manage Evolution API instances and pairing codes
- Receive Evolution API webhooks at `POST /webhook/evolution`
- Process `connection.update` events to keep local instance state fresh
- Send text messages via `POST /send`
- Refresh stale local connection state from Evolution API before blocking `/send`

## Architecture

```
MockWhatsAppEvent → normalizeMockEvent() → PipelineInput
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

## Configuration

| Env Variable | Required | Description |
|-------------|----------|-------------|
| `SERENA_CORE_URL` | Yes | Base URL of Serena Core (e.g. `http://localhost:3000`) |
| `SERENA_INTERNAL_TOKEN` | Yes | Shared secret token for internal authentication |
| `GATEWAY_CORE_TIMEOUT_MS` | No | Timeout for Core calls in milliseconds. Defaults to `30000` |

Production mode also requires gateway API keys and Evolution API configuration (`GATEWAY_ADMIN_KEY`, `GATEWAY_APP_KEY`, `GATEWAY_EVO_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`).

Mock events require `timestamp` to be a strict UTC ISO timestamp (`YYYY-MM-DDTHH:mm:ss(.sss)Z`). Invalid or timezone-offset timestamps are rejected before calling Serena Core.

## Usage

```typescript
import { runDryGatewayEvent } from "@serena/gateway-wa/application/run-dry-gateway-event";
import type { MockWhatsAppEvent } from "@serena/gateway-wa/domain/mock-whatsapp-event";

const event: MockWhatsAppEvent = {
  provider: "mock",
  instanceId: "serena-main",
  messageId: "test-001",
  from: "5491111111111",
  text: "Avisale a Carlos que llego tarde",
  timestamp: new Date().toISOString(),
};

const result = await runDryGatewayEvent(event);
// result.sent === false (always)
// result.mode === "dry_run"
// result.gatewayAction.action → "draft_ready" | "ignore" | "no_auto_send" | etc.
// result.wouldSend → { to, text } | null (only for draft_ready)
```

## Testing

```bash
# Run gateway-wa tests only
npm run -w @serena/gateway-wa test

# Run all workspace tests
npm test
```

Tests use Node 22 built-in `node:test` with fake `fetch` for deterministic HTTP simulation. Zero external dependencies.

## Phase 3 limitations

- `InstanceManager` is in-memory. Restarting the gateway loses local instance tracking.
- Evolution API remains the source of truth for WhatsApp sessions; startup rehydration is future work.
- Inbound routing targets Serena Core `POST /internal/webhook/whatsapp`, which is reserved for T36 and is not implemented yet.
- No VPS deployment is performed by this phase.
