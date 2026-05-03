# Proposal: T20 — Channel-Agnostic Simulation Endpoint

## Intent

Enable developers to test the full Serena pipeline (inbound gate → orchestrator → AI guide) through a channel-agnostic HTTP endpoint without real WhatsApp, LLM, or message sending.

## Scope

### In Scope
- `InboundMessageCommand` type, `profileToUseCaseId` mapping, `ProcessChannelInboundMessage` use case
- `POST /dev/simulate/inbound-message` guarded by `ENABLE_SIMULATION_ENDPOINTS=true`
- AiGuideService wiring, `ChannelInboundResult` response, tests, docs

### Out of Scope
- Real channel adapters, channel-aware OutboundDraft, PostgreSQL, real LLM, refactoring PipelineInput

## Capabilities

### New Capabilities
- `inbound-simulation`: Channel-agnostic simulation endpoint with full pipeline execution and environment guard

### Modified Capabilities
- `internal-pipeline-http`: `createHttpServer` gains optional simulation handler (backward compatible)
- `ai-guide-service`: AiGuideService wired into pipeline factory (no behavioral change to existing endpoint)

## Approach

**Approach 1: Minimal Simulation** — channel-agnostic command + profile→usecase mapping as reusable building blocks, proper use case, thin HTTP layer.

- `InboundMessageCommand` in `inbound-gate/domain/` — gate is natural entry point
- `profileToUseCaseId` — pure function, testable, single source of truth
- `ProcessChannelInboundMessage` in `inbound-gate/application/use-cases/` — adapts command, maps profile, calls AI guide
- Simulation handler + route in `server.ts` — disabled by default
- `ChannelInboundResult`: traceId, inboundDecision, profileId, useCaseId, guideResult, warnings, errors
- `clarification` → `serena.mediation.clarify` throws — handler catches, returns structured error

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `inbound-gate/domain/inbound-message-command.ts` | New | Channel-agnostic input type |
| `inbound-gate/domain/profile-to-usecase.ts` | New | Pure mapping function |
| `inbound-gate/application/use-cases/process-channel-inbound-message.ts` | New | Channel pipeline use case |
| `inbound-gate/domain/channel-inbound-result.ts` | New | Structured response type |
| `bootstrap/create-in-memory-pipeline.ts` | Modified | Add AiGuideService wiring |
| `bootstrap/server.ts` | Modified | Optional simulation handler param + route |
| `bootstrap/simulation-handler.ts` | New | HTTP handler |
| `config/env.ts` | Modified | Add `ENABLE_SIMULATION_ENDPOINTS` |
| `server.ts` | Modified | Wire simulation handler |
| `inbound-gate/tests/` | New | Unit tests |
| `bootstrap/tests/simulation-endpoint.test.ts` | New | Integration tests |
| `docs/simulation-api.md` | New | API documentation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `clarify` throws `NotImplementedError` | High | Handler catches, returns structured error |
| `createHttpServer` signature change | Low | Only `server.ts` calls it; param optional |
| Cross-module import boundary | Medium | Pure function only; documented |
| MockLlmProvider determinism | Medium | Documented |

## Rollback Plan

Remove `ENABLE_SIMULATION_ENDPOINTS`, revert `server.ts` and `createHttpServer`, delete all new files (handler, types, use case, tests, docs), revert `create-in-memory-pipeline.ts`. No DB migrations.

## Dependencies

- T19 (AiGuideService) must be merged first

## Success Criteria

- [ ] 404 when `ENABLE_SIMULATION_ENDPOINTS` not set
- [ ] 200 with full trace on valid payload
- [ ] 400 with field errors on invalid payload
- [ ] Blocked sender → discard; conversation → success + guideResult
- [ ] Clarification → structured error (not 500)
- [ ] Existing `/internal/pipeline/process` unchanged
- [ ] All tests pass; `npm run check` clean
