# Tasks: T30B — Structural Cleanup

## Phase 1: Foundation — `@serena/contracts` Package

- [x] 1.1 Create `packages/contracts/package.json` with `name: "@serena/contracts"`, `main: "src/index.ts"`, `type: "module"`, no dependencies
- [x] 1.2 Create `packages/contracts/tsconfig.json` extending `../../tsconfig.base.json` with `noEmit` and `allowImportingTsExtensions`
- [x] 1.3 Create `packages/contracts/src/index.ts` with byte-for-byte identical type definitions: `PipelineResult` union, all 8 variants (`DiscardResult` through `AmbiguousActiveSessionResult`), and `PipelineInput` — copied from `apps/core/src/modules/orchestrator/domain/pipeline-result.ts`

## Phase 2: Core Re-export

- [x] 2.1 Replace `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` with barrel re-export of all 10 types from `@serena/contracts` (remove all inline type definitions, keep no comments needed)

## Phase 3: Gateway Re-export

- [x] 3.1 Replace `apps/gateway-wa/src/domain/pipeline-result.ts` with identical barrel re-export from `@serena/contracts` (remove "COPIED from" header and all inline type definitions)

## Phase 4: Channel-inbound Module — Move Files

- [x] 4.1 Create directory structure: `apps/core/src/modules/channel-inbound/application/use-cases/` and `apps/core/src/modules/channel-inbound/application/results/`
- [x] 4.2 Copy `process-channel-inbound-message.ts` from `inbound-gate/application/use-cases/` to `channel-inbound/application/use-cases/` — update relative imports to `inbound-gate/` modules (add one `../` level: `../../inbound-gate/...`)
- [x] 4.3 Copy `resolved-inbound-actor.ts` from `inbound-gate/application/results/` to `channel-inbound/application/results/` — byte-for-byte identical, no import changes needed
- [x] 4.4 Delete original files from `inbound-gate/application/use-cases/process-channel-inbound-message.ts` and `inbound-gate/application/results/resolved-inbound-actor.ts`

## Phase 5: Import Path Updates — Core Consumers

- [x] 5.1 Update `apps/core/src/server.ts`: change `inbound-gate/application/use-cases/process-channel-inbound-message` → `channel-inbound/application/use-cases/process-channel-inbound-message`
- [x] 5.2 Update `apps/core/src/bootstrap/scenario-runner.ts`: same import path change
- [x] 5.3 Update `apps/core/src/bootstrap/simulation-handler.ts`: same import path change
- [x] 5.4 Update `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts`: same import path change
- [x] 5.5 Update `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts`: same import path change
- [x] 5.6 Update `apps/core/src/bootstrap/create-in-memory-pipeline.ts`: change `inbound-gate/application/results/resolved-inbound-actor` → `channel-inbound/application/results/resolved-inbound-actor`
- [x] 5.7 Update `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts`: change `./resolved-inbound-actor` → `../../../channel-inbound/application/results/resolved-inbound-actor`
- [x] 5.8 Update `apps/core/src/modules/inbound-gate/application/ports/external-identity-resolver.ts`: change `../results/resolved-inbound-actor` → `../../../channel-inbound/application/results/resolved-inbound-actor`
- [x] 5.9 Update `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts`: change `../../application/results/resolved-inbound-actor` → `../../../channel-inbound/application/results/resolved-inbound-actor`

## Phase 6: Test Import Updates

- [x] 6.1 Update `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts`: change `../application/use-cases/process-channel-inbound-message` → `../../channel-inbound/application/use-cases/process-channel-inbound-message` and `../application/results/resolved-inbound-actor` → `../../channel-inbound/application/results/resolved-inbound-actor`

## Phase 7: Validation

- [x] 7.1 Run `npm run check:structure` — must exit 0
- [x] 7.2 Run `npm run typecheck` — both core and gateway-wa must exit 0
- [x] 7.3 Run `npm test` — 578 tests passing (519 core + 59 gateway-wa), 0 failures
- [x] 7.4 Control search: `rg "inbound-gate.*process-channel-inbound-message" apps/core/src/` → 0 matches
- [x] 7.5 Control search: `rg "inbound-gate.*resolved-inbound-actor" apps/core/src/` → 0 matches
- [x] 7.6 Control search: `rg "COPIED from" apps/gateway-wa/src/domain/pipeline-result.ts` → 0 matches

## Phase 8: PR Readiness

- [ ] 8.1 Run `git status` — verify all changes staged, no unintended files
- [ ] 8.2 Commit with message: `feat: T30B structural cleanup — shared contracts + channel-inbound module`
- [ ] 8.3 Push branch `feat/t30b-structural-cleanup` to remote
- [ ] 8.4 Create PR with body summarizing: shared contracts package, re-exports, module move, zero behavior changes, validation results
