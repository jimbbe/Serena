# Mock WhatsApp Gateway / Dry-Run Adapter

Self-contained mock WhatsApp Gateway that simulates how a future real gateway would call Serena Core. Enables end-to-end dry-run testing of the full pipeline without connecting to real WhatsApp, Evolution API, or sending real messages.

## Purpose

- Simulate inbound WhatsApp events from test users
- Normalize mock events into `PipelineInput` for Serena Core
- Call `POST /internal/pipeline/process` on Serena Core via HTTP
- Map `PipelineResult` to `WhatsAppGatewayAction`
- Return a `DryRunResult` with complete execution trace
- **Never sends real WhatsApp messages** — `sent` is always `false`

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
