# Design: T17B — Internal Hardening

## Technical Approach

Add three hardening layers to `POST /internal/pipeline/process`: (1) shared-token auth via `X-Serena-Internal-Token` header checked **before** body parsing, (2) `messageId` idempotency via in-memory `ProcessedMessageStore` wrapping the handler, (3) GitHub Actions CI. Follow Clean Architecture: domain port in `modules/internal-pipeline/domain/`, adapter in `infrastructure/memory/`, wired through the bootstrap factory.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Token check | server.ts routing layer | Fails fast, handler stays pure. Token becomes a `createHttpServer` parameter | **server.ts** |
| Store placement | domain port + infra adapter | Consistent with existing `ActiveSessionQuery` pattern. Adds `internal-pipeline` module directory | **domain + infrastructure** |
| messageId location | JSON payload body | Task spec authoritative; simpler validation reuse in existing `validatePipelineInput` | **payload body** |
| Duplicate response | HTTP-level `duplicate: true` flag | No `PipelineResult` type change (8 variants). Flag added only at response serialization | **response wrapper** |
| Idempotency boundary | Wrap handler, not orchestrator | Handler is HTTP concern boundary; orchestrator stays pure domain logic | **handler wrapper** |

## Data Flow

```
Request
  ↓
token header present? ──→ NO: 401 { error: "missing_token" }
  ↓ YES
token matches env? ──→ NO: 403 { error: "invalid_token" }
  ↓ YES
method is POST? ──→ NO: 405 { error: "method_not_allowed" }
  ↓ YES
body readable? ──→ NO: 400 { error: "failed_to_read_body" }
  ↓ YES
JSON valid? ──→ NO: 400 { error: "invalid_json" }
  ↓ YES
validatePipelineInput(messageId+payload) ──→ NO: 400 { error: "invalid_payload" }
  ↓ YES
store.has(messageId)? ──→ YES: 200 { ...cachedResult, duplicate: true }
  ↓ NO
orchestrator.execute(input) → store.save(messageId, result)
  ↓
200 { ...result }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/config/env.ts` | Modify | Add `internalToken` string field to `AppEnv` |
| `apps/core/src/bootstrap/server.ts` | Modify | `createHttpServer` accepts `internalToken`; auth check before pipeline dispatch |
| `apps/core/src/bootstrap/internal-pipeline-handler.ts` | Modify | Accept `ProcessedMessageStore`; add messageId validation; idempotency wrapper |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Create `InMemoryProcessedMessageStore`; return it alongside orchestrator & bridgeStore |
| `apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts` | **Create** | Port type |
| `apps/core/src/modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts` | **Create** | `Map<string, PipelineResult>` adapter |
| `apps/core/src/server.ts` | Modify | Pass `internalToken` + `processedMessageStore` to factories |
| `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts` | Modify | Inject test token in request(); 8+ new auth/idempotency tests |
| `.env.example` | Modify | Add `SERENA_INTERNAL_TOKEN=` |
| `.github/workflows/ci.yml` | **Create** | Checkout → setup-node 22 → npm ci → npm run check → npm test |
| `docs/t17b-internal-hardening.md` | **Create** | Task documentation |
| `README.md` | Modify | T17B status update |
| `docs/project-status.md` | Modify | T17B section |

## Interfaces / Contracts

```typescript
// Port — apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts
import type { PipelineResult } from "../../../orchestrator/domain/pipeline-result.ts";

type ProcessedMessageStore = {
  has(messageId: string): boolean;
  get(messageId: string): PipelineResult | undefined;
  save(messageId: string, result: PipelineResult): void;
};
```

Server factory signature:
```typescript
function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
  internalToken?: string          // NEW — undefined means misconfigured
): http.Server
```

Duplicate response: HTTP handler wraps cached `PipelineResult` as `{ ...result, duplicate: true }` — zero changes to the `PipelineResult` discriminated union.

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| HTTP integration | Auth: 401 missing, 403 wrong, 500 misconfigured, health public | Extend `request()` with optional token header; `before()` sets `SERENA_INTERNAL_TOKEN=test-token` |
| HTTP integration | Idempotency: duplicate cached, independent messageIds, messageId validation (missing/empty/whitespace → 400) | Two requests with same `messageId`; verify second returns `duplicate: true` and cached result |
| Regression | All 14 existing tests | Add `X-Serena-Internal-Token: test-token` header to all pipeline requests; health stays headerless |
| CI | `npm ci`, `npm run check`, `npm test` | Workflow triggers on `pull_request: main` and `push: main` |

## Migration / Rollout

No migration required — all storage is in-memory. Rollback: `git revert` the commit. CI file deletion has no runtime impact.

## Open Questions

None — all decisions resolved by the specs and proposal.
