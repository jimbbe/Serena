# Design: T31A — Manual Simulation Readiness

## Technical Approach

Keep runtime behavior intact and make the existing core server manually usable from the repo root. Add a root-level simulation start script that loads `.env` only when present, expand safe local env examples, and tighten `docs/simulation-api.md` so both simulation endpoints share the same startup path and response-reading guidance.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonical startup | Add root `npm run start:simulation` using Node's `--env-file-if-exists=.env` and `apps/core/src/server.ts` | Keep `npm start` in docs; require `cd apps/core`; add dotenv dependency | Current root has no `start`; `apps/core` does not load `.env`. Node already supports optional env-file loading, so no dependency or app bootstrap change is needed. |
| Env source | Use `.env.example` as the safe template, copied to local `.env` | Add separate env files; commit real-ish provider values | Smallest change, matches repo convention, and keeps secrets out of Git. |
| Provider behavior | Document `AI_PROVIDER=mock` default and placeholder-only `openai-compatible` setup | Change provider factory or force mock in simulation | Existing `loadAppEnv()` and `createLlmProvider()` already enforce provider selection. Manual readiness should not alter product behavior. |
| Docker Compose | Do not make Compose the canonical manual path; only adjust if later required | Add full simulation provider passthrough to Compose now | Specs ask for one local startup path. Host-machine `npm run start:simulation` avoids PostgreSQL/container noise and is enough for manual Simulation API use. |

## Data Flow

```text
.env.example -> local .env -> npm run start:simulation
  -> node --env-file-if-exists=.env apps/core/src/server.ts
  -> loadAppEnv() -> createLlmProvider() -> simulation/scenario handlers
  -> curl /dev/simulate/* -> JSON trace for manual inspection
```

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json` | Modify | Add root `start:simulation` script for the canonical local path. |
| `.env.example` | Modify | Add `ENABLE_SIMULATION_ENDPOINTS=true` and safe mock/openai-compatible examples with placeholder secrets only. |
| `docs/simulation-api.md` | Modify | Replace broken `ENABLE_SIMULATION_ENDPOINTS=true npm start` guidance; add concise setup, response interpretation, and copy/paste curl examples for conversation, mediation, ambiguity, risk, unknown user, debug-only `conversationId`, and scenario summary inspection. |
| `docker-compose.yml` | No change planned | Not part of the canonical manual path; avoid extra config unless later verification proves it blocks the workflow. |
| `apps/core/src/*` | No change planned | Existing env parsing, provider factory, and handlers already support the required behavior. |

## Interfaces / Contracts

No API contract changes. The only new developer contract is the root script:

```sh
npm run start:simulation
```

This command expects a local `.env` copied from `.env.example`; if `.env` is absent, Node continues and the endpoint remains disabled unless env vars are supplied by the shell.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Script smoke | Root script starts with optional `.env` loading | Manual verification during apply: start server with mock env and request `/health` or a simulation endpoint. |
| Type/check | Package script JSON and docs edits do not break repo checks | Run `npm run check`. |
| Manual API | Curl examples match response fields | Follow documented mock flow; inspect `identity`, `inboundDecision`, `profileId`, `useCaseId`, `guideResult`, `conversation`, `steps[]`, and `summary`. |

## Migration / Rollout

No migration required. Rollback is reverting script/env/docs edits.

## Open Questions

- [ ] None blocking.
