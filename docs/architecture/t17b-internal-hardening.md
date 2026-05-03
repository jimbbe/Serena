# T17B — Internal Hardening

Internal security and reliability hardening for the `POST /internal/pipeline/process` endpoint.

## Security: Internal Token Authentication

All requests to `/internal/*` endpoints must include the `X-Serena-Internal-Token` header.

| Env var | Purpose |
|----------|---------|
| `SERENA_INTERNAL_TOKEN` | Shared secret that internal callers must present |

### Response codes

| Status | Condition |
|--------|-----------|
| 500 | `SERENA_INTERNAL_TOKEN` is not set on the server (`internal_token_not_configured`) |
| 401 | `X-Serena-Internal-Token` header is missing (`missing_token`) |
| 403 | Header value does not match the configured token (`invalid_token`) |
| 200 | Token valid, request processed normally |

### Important design details

- Token is checked **before** body parsing — unauthorized requests never consume the body stream.
- `GET /health` is always public (no token required).
- `GET /internal/pipeline/process` (405) does NOT check the token.
- Unknown routes (404) do NOT check the token.

## Idempotency: Duplicate Message Detection

The pipeline uses `messageId` for idempotency: if the same `messageId` is received more than once, the pipeline returns the cached result without re-executing.

### messageId field

- **Required** in the JSON payload body.
- Must be a non-empty string (whitespace-only strings are rejected with 400).
- Missing, empty, or whitespace → 400 `invalid_payload`.

### ProcessedMessageStore

| Component | Location |
|-----------|----------|
| Port (domain interface) | `apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts` |
| Adapter (in-memory) | `apps/core/src/modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts` |

The adapter uses `Map<string, PipelineResult>` for in-memory storage.

### Duplicate response

When a duplicate `messageId` is received, the response wraps the cached `PipelineResult` with an additional `duplicate: true` flag:

```json
{
  "type": "mediation_started",
  "sessionId": "...",
  ...,
  "duplicate": true
}
```

The `PipelineResult` discriminated union type is **not** modified — `duplicate` is added only at the HTTP response level.

### Known limitation

Idempotency data is stored in-memory and is **lost on process restart**. After a restart, the same `messageId` will execute the pipeline again normally. This is acceptable for the current phase; a future T19 task will add PostgreSQL-backed persistence.

## CI Pipeline

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | GitHub Actions workflow |

### Triggers

- `pull_request` to `main`
- `push` to `main`

### Jobs

Single job on `ubuntu-latest` with Node.js 22:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 22)
3. `npm ci` (clean install from lockfile)
4. `npm run check` (structure + typecheck)
5. `npm test`

## Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/config/env.ts` | Modified | Added `internalToken` field to `AppEnv` |
| `.env.example` | Modified | Added `SERENA_INTERNAL_TOKEN=` |
| `apps/core/src/modules/internal-pipeline/domain/processed-message-store.ts` | Created | Port type |
| `apps/core/src/modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts` | Created | In-memory adapter |
| `.github/workflows/ci.yml` | Created | CI workflow |
| `apps/core/src/bootstrap/server.ts` | Modified | Added `internalToken` parameter + auth checks |
| `apps/core/src/server.ts` | Modified | Wired token + processedMessageStore |
| `apps/core/src/bootstrap/internal-pipeline-handler.ts` | Modified | Added messageId validation + idempotency |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Creates + returns InMemoryProcessedMessageStore |
| `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts` | Modified | Added auth + idempotency tests (24 total) |

## Test Results

- **165 tests passing** (was 155)
- 24 HTTP pipeline tests (was 14): includes 5 auth tests + 5 idempotency tests
- All existing orchestration, module, and contract tests continue to pass

## Verification

```sh
npm run check   # ✅ passes
npm test        # ✅ 165 tests, 0 failures
```
