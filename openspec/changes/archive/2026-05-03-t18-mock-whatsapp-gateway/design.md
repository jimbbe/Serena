# Design: Mock WhatsApp Gateway / Dry-Run Adapter

## Technical Approach

Self-contained workspace at `apps/gateway-wa/` that copies frozen types and the mapper from `@serena/core` (T17A contract). Communicates with Serena Core exclusively via HTTP (`POST /internal/pipeline/process`). Always returns `sent: false` — this is a dry-run adapter, not a real gateway. Zero npm dependencies; uses Node 22 built-in `fetch` and `node:test`.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| **Type sourcing** | Import from `@serena/core` | Core has no `exports` field; would need core modifications | Self-contained copy |
| | Self-contained copy (AD1) | Manual sync if contracts change, but T17A froze them | ← **Selected** |
| | Shared `packages/` | Over-engineered for a mock; refactors core imports | |
| **Communication** | In-process calls | Tight coupling; tests require full core running | |
| | HTTP via `fetch` (AD2) | Realistic architecture (separate service); tests mock HTTP | ← **Selected** |
| **Test strategy** | Real HTTP to live server | Flaky, slow, requires core running | |
| | Fake `fetch` in tests | Fast, deterministic, no external dependencies | ← **Selected** |
| **Config** | Static env vars (`SERENA_CORE_URL`, `SERENA_INTERNAL_TOKEN`) | Simple; inline with how real gateway deploys | ← **Selected** |

## Data Flow

```
MockWhatsAppEvent  ──→  normalizeMockEvent()  ──→  PipelineInput
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

1. **Normalize**: Pure function. Validates `messageId`, `from`, `text`; maps to `PipelineInput`.
2. **HTTP call**: Async. `POST` with `X-Serena-Internal-Token` header, JSON body.
3. **Map**: Pure function (copied from core). `PipelineResult` → `WhatsAppGatewayAction`.
4. **Build result**: Assembles `DryRunResult` with `wouldSend` extracted from `draft_ready` actions.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/gateway-wa/package.json` | Modify | Workspace `@serena/gateway-wa` with test+typecheck scripts |
| `apps/gateway-wa/tsconfig.json` | Create | Extends `../../tsconfig.base.json` |
| `apps/gateway-wa/src/domain/mock-whatsapp-event.ts` | Create | `MockWhatsAppEvent` type: `messageId`, `from`, `text`, `timestamp` |
| `apps/gateway-wa/src/domain/dry-run-result.ts` | Create | `DryRunResult` type with `mode`, `sent`, `inputEvent`, `normalizedPayload`, `pipelineResult`, `gatewayAction`, `wouldSend`, `error?` |
| `apps/gateway-wa/src/domain/gateway-action.ts` | Create | **COPIED** from `apps/core/…/gateway-action.ts` |
| `apps/gateway-wa/src/domain/normalized-inbound-message.ts` | Create | **COPIED** from `apps/core/…/normalized-inbound-message.ts` |
| `apps/gateway-wa/src/domain/pipeline-result.ts` | Create | **COPIED** from `apps/core/…/pipeline-result.ts` (PipelineResult + PipelineInput) |
| `apps/gateway-wa/src/application/normalize-mock-event.ts` | Create | `normalizeMockWhatsAppEvent()`: pure validation + mapping |
| `apps/gateway-wa/src/application/call-serena-core.ts` | Create | `callSerenaCore()`: async HTTP client with error handling |
| `apps/gateway-wa/src/application/run-dry-gateway-event.ts` | Create | `runDryGatewayEvent()`: orchestrates normalize → HTTP → map → result |
| `apps/gateway-wa/src/application/map-pipeline-result.ts` | Create | **COPIED** from `apps/core/…/map-pipeline-result-to-gateway-action.ts` |
| `apps/gateway-wa/src/tests/dry-run-gateway.test.ts` | Create | 10+ tests with fake HTTP responses |
| `apps/gateway-wa/README.md` | Modify | Document mock gateway purpose and usage |
| `apps/gateway-wa/.gitkeep` | Delete | No longer needed |
| `package.json` (root) | Modify | Add `typecheck:gateway-wa` script |
| `docs/t18-mock-whatsapp-gateway.md` | Create | T18 documentation |

## Interfaces / Contracts

```typescript
// Domain types (new — not copied)
type MockWhatsAppEvent = {
  messageId: string;
  from: string;
  text: string;
  timestamp: string; // ISO 8601
};

type DryRunResult = {
  mode: "dry_run";
  sent: false;
  inputEvent: MockWhatsAppEvent;
  normalizedPayload: { messageId: string; senderWhatsAppId: string; messageText: string; receivedAt: string };
  pipelineResult: PipelineResult | null;
  gatewayAction: WhatsAppGatewayAction | null;
  wouldSend: { to: string; text: string } | null;
  error?: string;
};

// Application functions
function normalizeMockWhatsAppEvent(event: MockWhatsAppEvent):
  { ok: true; value: PipelineInput } | { ok: false; error: string };

async function callSerenaCore(payload: PipelineInput, config: GatewayConfig):
  Promise<PipelineResult>; // throws on network/HTTP error

async function runDryGatewayEvent(event: MockWhatsAppEvent, config: GatewayConfig):
  Promise<DryRunResult>;
```

**`wouldSend` extraction**: Set to `{ to, text }` only when `gatewayAction.action === "draft_ready"`; `null` otherwise. Maps `toWhatsAppId`→`to`, `text`→`text`.

**Error handling**: Validation errors populate `DryRunResult.error` with `normalizedPayload`/`pipelineResult`/`gatewayAction`/`wouldSend` all `null`. HTTP/config errors likewise — `error` field carries the message.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — normalization | Valid event maps correctly; missing `messageId`/`from`/`text` rejected; field mapping | Pure function, no mocks needed |
| Unit — mapping | Each `PipelineResult` variant → correct `WhatsAppGatewayAction` | Pure function (copied) |
| Unit — config | Missing `SERENA_CORE_URL` or token returns error before HTTP | Direct call; no mock needed |
| Integration — HTTP | Successful HTTP call chained with mapper → correct `DryRunResult` | `globalThis.fetch` replaced with fake returning specific `PipelineResult` |
| Integration — error | Network error, non-200 HTTP, non-JSON response | Fake fetch that rejects or returns bad responses |
| Integration — end-to-end | Full `runDryGatewayEvent()` flow for all 8 `PipelineResult` variants | Fake fetch per variant |

All 10+ tests use Node 22 `node:test` (built-in). Test command: `node --experimental-strip-types --test src/tests/*.test.ts`.

## Open Questions

- None. All design decisions are resolved by the proposal and existing T17A contracts.
