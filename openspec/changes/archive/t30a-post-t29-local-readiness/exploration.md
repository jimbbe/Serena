# Exploration: T30A — Post-T29 Local Readiness + Docs/Spec Sync

## Current State

### T29 Closure Status
- T29 (`t29-openai-compatible-llm-provider`) has a **verify-report.md** showing PASS WITH WARNINGS (83% fully compliant, 548 tests passing).
- The change folder **has NOT been archived** — it still lives in `openspec/changes/t29-openai-compatible-llm-provider/` and has not been moved to `openspec/changes/archive/`.
- Task T29-17 (Commit & PR) is marked as pending human action.
- The verify report lists 7 warnings (partial compliance) and 1 untested scenario — all non-critical.

### `receivedAt` Validation in `/internal/pipeline/process`
- File: `apps/core/src/bootstrap/internal-pipeline-handler.ts` (lines 82-90).
- Current behavior: if `receivedAt` is present, it only checks `typeof obj.receivedAt === "string"`. It does **NOT** validate that the string is a valid ISO 8601 date.
- Any string passes: `"not-a-date"`, `"abc"`, `""` would all be accepted and forwarded to the pipeline.
- Downstream, `process-incoming-whatsapp-message.ts` does `new Date(input.receivedAt)` which produces `Invalid Date` for bad strings — silent failure.
- Tests always pass valid ISO strings, so this gap is untested.

### Timeout in `apps/gateway-wa`
- File: `apps/gateway-wa/src/application/call-serena-core.ts` (line 55).
- The `fetch()` call has **no timeout** — no `AbortSignal`, no `signal` option.
- If Serena Core is down or unresponsive, the gateway-wa call will hang indefinitely (Node.js fetch default timeout is effectively infinite).
- The spec (`openspec/specs/gateway-wa/spec.md`) mentions "Network errors (timeout, connection refused) → propagate with descriptive error message" but there is **no explicit timeout configuration**.
- No `GATEWAY_CORE_TIMEOUT_MS` env var exists in gateway-wa.

### Strong Validation in `apps/gateway-wa`
- File: `apps/gateway-wa/src/application/normalize-mock-event.ts`.
- Validates `messageId`, `from`, `text` — all good.
- Does **NOT** validate `timestamp` (the `receivedAt` equivalent). An invalid or empty timestamp passes through silently.
- `MockWhatsAppEvent.timestamp` is typed as `string` with no format constraint.

### Token Local in Compose/Env Docs
- `docker-compose.yml`: `serena-core` service has no `SERENA_INTERNAL_TOKEN` env var — it relies on the container's own env or defaults.
- `.env.example` line 31: `SERENA_INTERNAL_TOKEN=` (empty). No guidance on how to generate a local token.
- No `.env` file exists in the repo (correct — secrets should not be committed).
- Documentation does not explain the local dev flow for setting up the internal token.

### Specs vs Docs Sync
- `openspec/specs/` has 23 spec files. No spec exists for T29 capabilities (openai-compatible provider, provider selection, env validation).
- `docs/project-status.md` has a T29 section (lines 234-247) but the "Expected Next Task" section (line 250) still says "Next: T29 or subsequent task" — stale.
- `docs/open-questions.md` line 55 marks "LLM provider real?" as resolved by T29 — correct.
- `docs/simulation-api.md` line 115 mentions "Real AI can be configured via `AI_PROVIDER=openai-compatible`" — correct and up to date.

## Affected Areas

- `openspec/changes/t29-openai-compatible-llm-provider/` — needs archival or closure decision
- `openspec/specs/` — missing specs for T29 capabilities
- `docs/project-status.md` — stale "Expected Next Task" section
- `apps/core/src/bootstrap/internal-pipeline-handler.ts` — weak `receivedAt` validation
- `apps/gateway-wa/src/application/call-serena-core.ts` — no timeout on fetch
- `apps/gateway-wa/src/application/normalize-mock-event.ts` — no timestamp validation
- `apps/gateway-wa/src/domain/mock-whatsapp-event.ts` — timestamp field has no format constraint
- `.env.example` — token guidance missing
- `docker-compose.yml` — no `SERENA_INTERNAL_TOKEN` env mapping

## Approaches

### 1. Minimal Local Readiness (Recommended)
Focus on what's needed for local testing: fix `receivedAt` validation, add timeout to gateway-wa, add timestamp validation, document token setup, archive T29, sync docs.

- **Pros**: Small scope, unblocks local testing, addresses real gaps
- **Cons**: Doesn't address all verify-report warnings
- **Effort**: Low

### 2. Full T29 Cleanup + Local Readiness
Archive T29, fix all 7 partial-compliance warnings from verify report, plus local readiness items.

- **Pros**: Clean slate after T29
- **Cons**: Larger scope, includes non-critical test gaps
- **Effort**: Medium

### 3. Local Readiness Only (Defer T29 Archive)
Only fix the local testing gaps; leave T29 archival for a separate task.

- **Pros**: Fastest path to local testing readiness
- **Cons**: Leaves T29 in limbo, specs stay out of sync
- **Effort**: Low

## Recommendation

**Approach 1** — Minimal Local Readiness. The user explicitly scoped this task to local testing preparation. The scope includes:

1. **Archive/close T29** — Move change folder to archive, update docs references
2. **Fix `receivedAt` validation** in `internal-pipeline-handler.ts` — validate ISO 8601 format, reject invalid strings with clear 400 error
3. **Add timeout** to `call-serena-core.ts` — configurable via `GATEWAY_CORE_TIMEOUT_MS` env var, default 30s, using `AbortSignal.timeout()`
4. **Add timestamp validation** in `normalize-mock-event.ts` — reject empty/invalid timestamps
5. **Document token local setup** — add guidance to `.env.example` and `docker-compose.yml` for `SERENA_INTERNAL_TOKEN`
6. **Sync specs** — create or update specs for T29 capabilities (openai-compatible provider, provider selection)
7. **Update `docs/project-status.md`** — fix stale "Expected Next Task" section

### Explicitly Excluded (per user request)
- Hardening producción/VPS
- Auth extra para simulation endpoints
- Body size limits
- Repo privado
- Mover `ProcessChannelInboundMessage`
- Extraer contratos compartidos

## Risks

1. **`receivedAt` validation tightening could break existing tests** — Tests that pass non-ISO strings would need updating. However, all existing tests use valid ISO strings, so risk is low.
2. **Timeout default choice** — 30s matches the core's `AI_TIMEOUT_MS` default. If gateway-wa calls take longer (large payloads, slow core), 30s might be too aggressive. Should be configurable.
3. **Spec creation for T29** — Creating new specs post-implementation is retroactive. Better to create them as "current state" specs rather than delta specs.
4. **T29 archive without PR merge** — T29-17 (PR) is pending. Archiving without a merged PR could create confusion. Recommendation: note in archive that PR is pending human action.

## Ready for Proposal

**Yes** — The scope is well-defined, the gaps are concrete, and the recommendation aligns with the user's explicit inclusion/exclusion list. The orchestrator should proceed to `/sdd-propose` with the scope defined above.
