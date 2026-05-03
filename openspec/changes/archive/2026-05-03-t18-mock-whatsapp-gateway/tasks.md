# Tasks: Mock WhatsApp Gateway / Dry-Run Adapter

## Phase 1: Workspace Setup

- [x] 1.1 Create `apps/gateway-wa/package.json` — workspace `@serena/gateway-wa`, type module, `test` script (`node --experimental-strip-types --test src/tests/*.test.ts`), `typecheck` script (`tsc --noEmit`)
- [x] 1.2 Create `apps/gateway-wa/tsconfig.json` — extends `../../tsconfig.base.json`, references domain + application + test sources
- [x] 1.3 Delete `apps/gateway-wa/src/.gitkeep` — no longer needed
- [x] 1.4 Update root `package.json` — add `typecheck:gateway-wa` to `typecheck` script, add `test:gateway-wa` to `test` script

## Phase 2: Domain Types (copied from core + new)

- [x] 2.1 Create `apps/gateway-wa/src/domain/pipeline-result.ts` — copy `PipelineResult` + `PipelineInput` from `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` with source-version comment
- [x] 2.2 Create `apps/gateway-wa/src/domain/gateway-action.ts` — copy `WhatsAppGatewayAction` from `apps/core/src/modules/whatsapp-gateway/domain/gateway-action.ts` with source-version comment
- [x] 2.3 Create `apps/gateway-wa/src/domain/normalized-inbound-message.ts` — copy `NormalizedWhatsAppInboundMessage` from `apps/core/src/modules/whatsapp-gateway/domain/normalized-inbound-message.ts` with source-version comment
- [x] 2.4 Create `apps/gateway-wa/src/domain/mock-whatsapp-event.ts` — new `MockWhatsAppEvent` type (`provider`, `instanceId`, `messageId`, `from`, `text`, `timestamp`, `raw?`)
- [x] 2.5 Create `apps/gateway-wa/src/domain/dry-run-result.ts` — new `DryRunResult` type (`mode`, `sent`, `inputEvent`, `normalizedPayload`, `pipelineResult`, `gatewayAction`, `wouldSend?`, `error?`)

## Phase 3: Application Logic

- [x] 3.1 Create `apps/gateway-wa/src/application/normalize-mock-event.ts` — `normalizeMockWhatsAppEvent()`: validates `messageId`/`from`/`text` non-empty, trims, maps to `PipelineInput`; returns `{ ok, value? } | { ok, error }`
- [x] 3.2 Create `apps/gateway-wa/src/application/map-pipeline-result.ts` — copy `mapPipelineResultToGatewayAction()` from `apps/core/src/modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts` with source-version comment
- [x] 3.3 Create `apps/gateway-wa/src/application/call-serena-core.ts` — `callSerenaCore()`: validates `SERENA_CORE_URL` + `SERENA_INTERNAL_TOKEN`, POST to `/internal/pipeline/process` with `X-Serena-Internal-Token` header, throws on HTTP/network error
- [x] 3.4 Create `apps/gateway-wa/src/application/run-dry-gateway-event.ts` — `runDryGatewayEvent()`: orchestrates validate → normalize → callSerenaCore → mapPipelineResult → build `DryRunResult` with `wouldSend` extraction for `draft_ready` actions

## Phase 4: Tests

- [x] 4.1 Create `apps/gateway-wa/src/tests/dry-run-gateway.test.ts` — 10+ tests covering: valid normalization, whitespace trimming, missing field validation (messageId/from/text), config errors (missing URL/token), all 8 PipelineResult variants via fake fetch, HTTP error propagation, `wouldSend` populated for draft_ready only, `sent` always false

## Phase 5: Documentation

- [x] 5.1 Update `apps/gateway-wa/README.md` — document mock gateway purpose, dry-run usage, configuration env vars, test command
- [x] 5.2 Create `docs/t18-mock-whatsapp-gateway.md` — T18 documentation with architecture overview, data flow, type reference, usage examples
- [x] 5.3 Update `docs/project-status.md` — add T18 section with status and description
- [x] 5.4 Update `README.md` (root) — add T18 to project status references

## Phase 6: Integration Validation

- [x] 6.1 Update `scripts/check-structure.ts` if needed — ensure gateway-wa workspace is recognized by structural checks
- [x] 6.2 Run `npm run check` — verify structure + typecheck passes for all workspaces including gateway-wa
- [x] 6.3 Run `npm test` — verify all tests pass (core + gateway-wa)
