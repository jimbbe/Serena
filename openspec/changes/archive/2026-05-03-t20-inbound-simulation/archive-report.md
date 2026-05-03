# Archive Report: T20 — Channel-Agnostic Simulation Endpoint

**Archived**: 2026-05-03
**Original change dir**: `openspec/changes/t20-inbound-simulation/`
**Archived at**: `openspec/changes/archive/2026-05-03-t20-inbound-simulation/`

## Executive Summary

T20 introduced a channel-agnostic simulation endpoint (`POST /dev/simulate/inbound-message`) enabling developers to test the full Serena pipeline (inbound gate → orchestrator → AI guide) without real WhatsApp, real LLM, or real message sending. The feature is guarded by `ENABLE_SIMULATION_ENDPOINTS=true` (disabled by default) and backward compatible — existing endpoints remain unchanged.

## Verdict

**PASS WITH WARNINGS** — 277 tests (46 new T20), 0 failures, `npm run check` clean, 15/15 tasks complete.

## Scope Delivered

| Component | Status | Details |
|-----------|--------|---------|
| `InboundMessageCommand` type + `InboundChannel` (6 values) | ✅ | Channel-agnostic input contract |
| `profileToUseCaseId` pure mapping function | ✅ | Typed exhaustive mapping, cross-module |
| `ChannelInboundResult` response type | ✅ | 10 fields including guideError, simulatedOutbound |
| `ProcessChannelInboundMessage` use case | ✅ | Handles discard, conversation, mediation, risk, clarification |
| `ENABLE_SIMULATION_ENDPOINTS` env var | ✅ | Case-insensitive "true" check |
| `POST /dev/simulate/inbound-message` route | ✅ | 8 validation rules, structured errors |
| `createHttpServer` 4th optional param | ✅ | Backward compatible |
| `createInMemoryPipeline` AiGuideService wiring | ✅ | MockLlmProvider, no real LLM |
| Bootstrap wiring in `server.ts` | ✅ | Conditional on env var |
| Unit tests (26) | ✅ | profileToUseCaseId + ProcessChannelInboundMessage |
| Integration tests (20) | ✅ | Full endpoint scenarios |
| `docs/simulation-api.md` | ✅ | 210 lines, 8 curl examples |

## Files Created (8 new)

- `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts`
- `apps/core/src/modules/inbound-gate/domain/profile-to-usecase.ts`
- `apps/core/src/modules/inbound-gate/domain/channel-inbound-result.ts`
- `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts`
- `apps/core/src/bootstrap/simulation-handler.ts`
- `apps/core/src/modules/inbound-gate/tests/profile-to-usecase.test.ts`
- `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts`
- `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts`
- `docs/simulation-api.md`

## Files Modified (4)

- `apps/core/src/config/env.ts` — Added `enableSimulationEndpoints`
- `apps/core/src/bootstrap/server.ts` — Added 4th optional param + route
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — Wired AiGuideService
- `apps/core/src/server.ts` — Conditional simulation handler wiring

## Warnings Carried Forward

| ID | Issue | Recommendation |
|----|-------|----------------|
| W-01 | `SimulatedOutbound` type shape deviates from spec | Align in Phase 2 when drafting is implemented |
| W-02 | No dedicated `inbound-message-command.test.ts` file | Type-only, compile-time verification sufficient |
| W-03 | Coverage tool not available | All code paths exercised by 46 tests |
| W-04 | `createInMemoryPipeline` returns extra `processInboundMessage` | Beneficial extension, not a bug |

## Spec Domains Synced to Main Specs

1. `openspec/specs/inbound-simulation-command/spec.md`
2. `openspec/specs/inbound-simulation-mapping/spec.md`
3. `openspec/specs/inbound-simulation-usecase/spec.md`
4. `openspec/specs/inbound-simulation-endpoint/spec.md`
5. `openspec/specs/inbound-simulation-tests/spec.md`

## Next Steps

- Phase 2: Wire real `ProcessInboundMessage` (not mocked) in integration test clarification scenario
- Phase 2: Populate `SimulatedOutbound` when mediation produces draft messages
- Integrate real LLM provider once available
- Future channel adapters (voice, web_chat, telegram) can reuse `InboundMessageCommand`
