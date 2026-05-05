# Exploration: T31A — Manual Simulation Readiness

## Current State

- Baseline is **green** on the current branch: `npm run check` passed and `npm test` passed (**578 tests**: 519 core + 59 gateway-wa).
- The runtime already supports both provider modes: `AI_PROVIDER=mock` by default, and `AI_PROVIDER=openai-compatible` with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS` validated in `apps/core/src/config/env.ts` and wired in `apps/core/src/server.ts` through `createLlmProvider()`.
- The Simulation API is already implemented and dev-gated by `ENABLE_SIMULATION_ENDPOINTS` in `apps/core/src/server.ts`, with handlers in `apps/core/src/bootstrap/simulation-handler.ts` and `apps/core/src/bootstrap/scenario-handler.ts`.
- The main readiness gap is NOT the Simulation API behavior. It is the **human startup path**:
  1. `docs/simulation-api.md` tells users to run `ENABLE_SIMULATION_ENDPOINTS=true npm start`, but the repo root `package.json` has **no** `start` script.
  2. `apps/core/package.json` has `start`, but it does **not** load `.env`.
  3. `.env.example` documents AI vars, but does **not** document `ENABLE_SIMULATION_ENDPOINTS`.
  4. `docker-compose.yml` maps `SERENA_INTERNAL_TOKEN`, but not `ENABLE_SIMULATION_ENDPOINTS` or the AI provider env vars, so Compose is not a complete Simulation API path.
- `docs/simulation-api.md` is also internally inconsistent: early sections say the endpoint works “without real LLM calls”, while later limitation notes correctly say the simulation endpoints use **whatever provider is configured at startup**.

## Affected Areas

- `package.json` — no repo-root start helper exists today.
- `apps/core/package.json` — existing `start` script is reusable, but currently assumes env vars are already present in the shell.
- `.env.example` — missing `ENABLE_SIMULATION_ENDPOINTS`; AI vars exist but are not connected to an executable local flow.
- `docker-compose.yml` — local Compose path does not expose Simulation API enablement or AI provider selection.
- `docs/simulation-api.md` — wrong startup command at repo root and mixed messaging about mock-only vs configured-provider behavior.
- `apps/core/src/config/env.ts` — already contains the required env contract; likely no behavior change needed.
- `apps/core/src/server.ts` — already wires the selected provider and simulation handlers; likely no behavior change needed.
- `apps/core/src/bootstrap/simulation-handler.ts` — current endpoint behavior is already correct for manual testing.
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — already supports injected/configured provider selection.
- `apps/core/src/modules/ai-guide/infrastructure/create-llm-provider.ts` — already provides the needed mock/OpenAI-compatible switch.

## Approaches

### 1. Docs-only correction
Fix `docs/simulation-api.md` to point to `npm run -w @serena/core start` and explain required env exports.

- **Pros**: Smallest diff, no runtime changes.
- **Cons**: Still fragile across shells/OSes; `.env.example` remains awkward because the app does not load it automatically.
- **Effort**: Low

### 2. Minimal dev-readiness path via env-file/script plumbing (**Recommended**)
Add a single canonical local-start path that loads `.env` without new dependencies, reuse existing core startup, and sync docs/examples around it.

- **Pros**: Small scope, keeps runtime behavior unchanged, works for mock and OpenAI-compatible providers, removes shell-specific startup friction.
- **Cons**: Requires light script/compose/docs touchpoints.
- **Effort**: Low

### 3. Compose-first readiness
Make Docker Compose the primary manual-testing path by mapping `ENABLE_SIMULATION_ENDPOINTS` and AI env vars, then update docs to use Compose.

- **Pros**: Good for operators already using Compose.
- **Cons**: Heavier than needed for simple local Simulation API testing; slower feedback loop; still leaves direct local-process ergonomics weaker.
- **Effort**: Medium

## Recommendation

**Approach 2** is the minimum safe change set.

Recommended scope:

1. Add **one canonical startup command** for local Simulation API testing that reuses the current core server instead of duplicating logic. Prefer a root helper that wraps the existing core start and loads `.env` via Node 22 built-in env-file support.
2. Update `.env.example` to include `ENABLE_SIMULATION_ENDPOINTS` and clarify the two valid local modes:
   - mock: `AI_PROVIDER=mock`
   - real/OpenAI-compatible: `AI_PROVIDER=openai-compatible` + `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL`
3. Update `docs/simulation-api.md` so it stops claiming the endpoint is effectively mock-only, fixes the broken repo-root `npm start` instruction, and documents the real manual flow.
4. Optionally map `ENABLE_SIMULATION_ENDPOINTS` and AI env vars in `docker-compose.yml` **only if** the proposal wants Compose to remain an equally supported manual-testing path. If not, document Compose as secondary.

## Reuse Instead of Duplicate

- Reuse `npm run check` and `npm test` from the repo root for validation.
- Reuse `apps/core` runtime entrypoint (`node --experimental-strip-types src/server.ts`) rather than creating a second server entrypoint.
- Reuse `createLlmProvider()` and existing `loadAppEnv()` validation instead of adding parallel provider-selection logic anywhere else.
- Reuse the existing Simulation API handlers and pipeline wiring; this task does **not** need runtime/product behavior changes.

## Risks

- If the startup helper is documented poorly, users may still try the broken repo-root `npm start` path.
- If `.env` loading and Compose support are both partially documented, the project will keep two confusing “almost working” startup paths.
- If docs keep saying “no real LLM” while startup can use `openai-compatible`, proposal/spec phases will encode the wrong operational model.

## Ready for Proposal

**Yes** — the code already supports manual Simulation API testing; the missing piece is a coherent dev-readiness path (scripts/env/docs) that makes that support usable and truthful.
