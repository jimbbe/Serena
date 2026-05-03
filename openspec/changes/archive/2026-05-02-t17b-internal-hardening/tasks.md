# Tasks: T17B — Internal Hardening

## Phase 1: Foundation (config, domain port, infra adapter, CI)

- [x] 1.1 Add `internalToken: string | undefined` to `AppEnv` type in `apps/core/src/config/env.ts`; read `SERENA_INTERNAL_TOKEN` from env (no validation — undefined means misconfigured)
- [x] 1.2 Add `SERENA_INTERNAL_TOKEN=` to `.env.example` with comment explaining shared-secret auth
- [x] 1.3 Create port type `ProcessedMessageStore` at `apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts` with `has()`, `get()`, `save()` methods; imports `PipelineResult` from orchestrator domain
- [x] 1.4 Create `InMemoryProcessedMessageStore` adapter at `apps/core/src/modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts` using `Map<string, PipelineResult>`; implements `ProcessedMessageStore`
- [x] 1.5 Create `.github/workflows/ci.yml` with triggers `pull_request: [main]` + `push: [main]`; single job on `ubuntu-latest`, Node 22; steps: checkout → setup-node → npm ci → npm run check → npm test

## Phase 2: Security (token auth at routing layer)

- [x] 2.1 Update `createHttpServer` in `apps/core/src/bootstrap/server.ts` to accept optional `internalToken?: string` parameter; add token check before pipeline dispatch: missing → 401 `{error:"missing_token"}`, mismatch → 403 `{error:"invalid_token"}`; check happens BEFORE body parsing; GET /health stays public
- [x] 2.2 Update `apps/core/src/server.ts` to pass `env.internalToken` to `createHttpServer()`; add log line for internal endpoint

## Phase 3: Idempotency (messageId validation + store wiring)

- [x] 3.1 Add `messageId` validation to `validatePipelineInput()` in `apps/core/src/bootstrap/internal-pipeline-handler.ts`: required non-empty string; missing/empty/whitespace → add validation error
- [x] 3.2 Update `createPipelineHandler` signature to accept optional `ProcessedMessageStore`; add idempotency wrapper: if `store.has(messageId)` → return `{...cachedResult, duplicate: true}`; else execute + `store.save(messageId, result)`
- [x] 3.3 Update `createInMemoryPipeline()` in `apps/core/src/bootstrap/create-in-memory-pipeline.ts` to create `InMemoryProcessedMessageStore` and return it alongside orchestrator + bridgeStore
- [x] 3.4 Wire `processedMessageStore` through `apps/core/src/server.ts`: pass to `createPipelineHandler()` alongside orchestrator

## Phase 4: Tests (auth, idempotency, regression)

- [x] 4.1 Update test fixture in `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts`: set `process.env.SERENA_INTERNAL_TOKEN = "test-token"` in `before()`; update `request()` helper to accept optional `token` header; add token `test-token` to all existing pipeline requests
- [x] 4.2 Add auth tests: health public (no token → 200), missing token → 401, wrong token → 403, valid token → 200, misconfigured env (no token set) → 500
- [x] 4.3 Add idempotency tests: missing messageId → 400, empty messageId → 400, whitespace messageId → 400, duplicate messageId returns `duplicate: true` with cached result, different messageIds execute independently
- [x] 4.4 Run `npm test` — verify all 14 existing tests pass with token + new auth/idempotency tests (target: 22+ tests total)

## Phase 5: Documentation

- [x] 5.1 Create `docs/t17b-internal-hardening.md` covering: auth token setup, idempotency behavior, in-memory limitation, CI workflow
- [x] 5.2 Update `README.md`: add T17B to completed tasks section
- [x] 5.3 Update `docs/project-status.md`: add T17B section with capabilities delivered
