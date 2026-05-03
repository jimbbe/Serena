# Exploration: T18 — Mock WhatsApp Gateway / Dry-Run Adapter

## Current State

**apps/gateway-wa/** is a placeholder directory containing only:
- `README.md` — describes expected future responsibilities (receive provider events, translate payloads, send outbound messages)
- `src/.gitkeep` — empty source directory

All relevant domain types and the mapper function already exist in `apps/core`:

| Type/Function | Location | Purpose |
|---|---|---|
| `NormalizedWhatsAppInboundMessage` | `apps/core/src/modules/whatsapp-gateway/domain/normalized-inbound-message.ts` | Shape gateway normalizes provider payloads into |
| `WhatsAppGatewayAction` | `apps/core/src/modules/whatsapp-gateway/domain/gateway-action.ts` | Discriminated union: ignore, no_auto_send, draft_ready, manual_review_required, error |
| `IncomingWhatsAppMessage` | `apps/core/src/modules/whatsapp-gateway/domain/incoming-message.ts` | Simpler incoming message type (senderWhatsAppId, messageText, receivedAt, instanceId) |
| `PipelineResult` | `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | 8-variant discriminated union (discard, conversation_pending, risk_review_required, mediation_not_understood, recipient_not_found, mediation_started, mediation_reply_recorded, ambiguous_active_session) |
| `PipelineInput` | `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | Input shape (senderWhatsAppId, messageText, receivedAt) |
| `mapPipelineResultToGatewayAction` | `apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts` | Pure function: PipelineResult → WhatsAppGatewayAction |
| `WhatsAppGateway` port | `apps/core/src/modules/whatsapp-gateway/application/ports/whatsapp-gateway.ts` | Interface with sendMessage + onMessage |

## Affected Areas

- `apps/gateway-wa/` — **new workspace app** to be created (package.json, tsconfig.json, src/)
- `package.json` (root) — already includes `apps/*` in workspaces, no change needed
- `tsconfig.base.json` — already provides strict base config, no change needed
- `openspec/changes/t18-mock-whatsapp-gateway/` — SDD artifacts directory

## Approaches

### Approach 1: Import types from @serena/core

Add `@serena/core` as a workspace dependency in gateway-wa's package.json and import types directly.

- **Pros**: Single source of truth, no duplication, types stay in sync automatically
- **Cons**: `@serena/core` has no `exports` or `main` field — it's designed for `--experimental-strip-types` direct execution. Would need to add an exports map to core's package.json. Also couples gateway-wa to core's internal module structure.
- **Effort**: Medium (requires modifying @serena/core to expose types)

### Approach 2: Copy types into gateway-wa (recommended)

Duplicate the relevant TypeScript types in gateway-wa's own `src/domain/` directory.

- **Pros**: Zero coupling to core's internal structure, no changes needed to @serena/core, types are stable contracts (T17A already froze them), mock gateway is self-contained for testing
- **Cons**: Manual sync needed if types change (but T17A froze the contract, and changes would be rare and deliberate)
- **Effort**: Low (copy ~120 lines of pure type definitions)

### Approach 3: Create a shared contracts package

Move all shared types to `packages/shared/` (already exists as a placeholder).

- **Pros**: Clean separation, both core and gateway-wa depend on shared contracts
- **Cons**: Premature abstraction for a mock gateway, requires refactoring core's imports, over-engineering for T18 scope
- **Effort**: High (refactor core + create shared package + wire both apps)

## Recommendation

**Approach 2: Copy types into gateway-wa.**

Reasoning:
1. T17A already **froze the contract** — these types are the spec, not implementation details
2. The mock gateway is a **dry-run adapter** — it should be self-contained and testable without @serena/core running
3. The mapper function `mapPipelineResultToGatewayAction` should also be **copied** (it's a pure function, ~125 lines, no side effects). This avoids any runtime dependency on core.
4. The mock gateway communicates with Serena Core via **HTTP** (POST /internal/pipeline/process), not imports. For tests, the HTTP call is mocked/faked.
5. If/when a real WhatsApp Gateway is built in a separate repo, it will need its own copy anyway (per T17A §11 Open Question #1).

## HTTP Contract Summary

The mock gateway calls:

```
POST /internal/pipeline/process
Host: <serena-core-url>
Content-Type: application/json
X-Serena-Internal-Token: <token>

{
  "messageId": "mock-uuid-v4",
  "senderWhatsAppId": "5491111111111",
  "messageText": "avisale a Carlos que llego tarde",
  "receivedAt": "2026-05-02T22:00:00.000Z"
}
```

Response: `PipelineResult` (200), or error (400/401/403/500).

## Mock Gateway Architecture (proposed)

```
apps/gateway-wa/
├── package.json              # workspace: @serena/gateway-wa
├── tsconfig.json             # extends ../../tsconfig.base.json
├── README.md                 # updated from placeholder
└── src/
    ├── domain/
    │   ├── normalized-inbound-message.ts   # copied from core
    │   ├── gateway-action.ts               # copied from core
    │   └── pipeline-result.ts              # copied from core (PipelineResult + PipelineInput)
    ├── application/
    │   └── map-pipeline-result-to-gateway-action.ts  # copied from core
    ├── infrastructure/
    │   ├── http-client.ts     # fetch wrapper to call Serena Core
    │   └── mock-event-source.ts  # simulates WhatsApp events (CLI or file-based)
    ├── server.ts              # entry point: receives mock event → pipeline → action → log
    └── tests/
        └── mock-gateway.test.ts  # tests with faked HTTP responses
```

## Import Feasibility

**Can apps/gateway-wa import from apps/core?**

Technically yes (npm workspaces resolve `@serena/core`), but **not recommended** because:
1. `@serena/core` has no `exports` field — imports would rely on internal paths
2. Core uses `--experimental-strip-types` — no compiled output to import from
3. The mock gateway should not depend on core's runtime, only on its HTTP contract
4. Tests need to be self-contained with fakes/mocks

**Workspace reference pattern** (if needed later):
```json
{
  "dependencies": {
    "@serena/core": "*"
  }
}
```
But for T18, copying types is the right call.

## Risks

1. **Type drift**: If core's types change, gateway-wa's copies become stale. Mitigation: add a CI check or comment noting the source version (T17A).
2. **Scope creep**: T18 is a mock/dry-run. Must NOT implement real Evolution API integration, real WhatsApp sending, or WebSocket webhooks.
3. **Testing without real server**: The mock gateway must work with faked HTTP responses. No dependency on `serena-core` running during tests.

## Ready for Proposal

**Yes.** The exploration is complete. The orchestrator should proceed to:
1. `/sdd-propose` — create change proposal with scope and approach
2. `/sdd-spec` — write delta spec with Given/When/Then scenarios
3. `/sdd-design` — technical design with architecture decisions
4. `/sdd-tasks` — implementation task checklist

The recommended approach (copy types, self-contained mock, HTTP-based communication) is clear and low-risk.
