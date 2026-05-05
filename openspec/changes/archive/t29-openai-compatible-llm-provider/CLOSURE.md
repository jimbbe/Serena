# T29 Closure — OpenAI-Compatible LLM Provider

## Status: CLOSED (T30A archive)

**Date archived**: 2026-05-05
**Archive task**: T30A — Post-T29 local readiness + docs/spec sync

## Verdict

**PASS WITH WARNINGS** (83% fully compliant, 548 tests passing — 510 core + 38 gateway-wa).

## Completion Summary

| Item | Status |
|------|--------|
| T29-01 to T29-16 (implementation tasks) | ✅ Complete |
| T29-17 (Commit & PR) | 🔲 PENDING HUMAN ACTION |
| `npm run check` | ✅ Passes |
| `npm test` | ✅ 548 tests pass |
| TypeScript typecheck | ✅ Clean across all projects |

## Implementation

- `OpenAICompatibleLlmProvider` in `apps/core/src/modules/ai-guide/infrastructure/openai/` implementing `LlmProvider` port.
- Factory `createLlmProvider(env)` in `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts`.
- `AppEnv` expanded in `apps/core/src/config/env.ts` with `aiProvider`, `aiBaseUrl`, `aiApiKey`, `aiModel`, `aiTimeoutMs`.
- Default stays `mock` (`AI_PROVIDER=mock`).
- Production config: `AI_PROVIDER=openai-compatible` with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- Zero npm dependencies — native `fetch`, `AbortSignal.timeout()`.

## Warnings (from verify report)

1. **Developer prompt uses `system` role instead of `developer`** — Documented compatibility decision. OpenAI supports `developer` role but not all compatible APIs do.
2. **No explicit test for "no developerPrompt" scenario** — Implicitly covered by existing tests.
3. **Simulation works with openai-compatible provider is UNTESTED** — Future edge case.
4. **AI_PROVIDER=invalid without AI env vars produces different error** — Non-critical.
5. **Spec says `LlmProvider` exposes `name` but port does not** — Metadata handled via constructor params.
6. **Consider updating spec for developer role decision** — Docs only.
7. **Consider adding simulation test with openai-compatible provider** — Future task.

## Important Note

**T29-17 (Commit & PR) is PENDING HUMAN ACTION.** This archive does NOT assert that the PR was merged. It documents the change as functionally complete for specification purposes. The PR must be reviewed and merged by Marco before considering T29 fully delivered.
