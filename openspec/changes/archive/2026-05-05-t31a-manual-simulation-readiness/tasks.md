# Tasks: T31A — Manual Simulation Readiness

## Phase 1: Script + env readiness

- [ ] 1.1 Add root `start:simulation` to `package.json` with `node --env-file-if-exists=.env apps/core/src/server.ts`.
- [ ] 1.2 Update `.env.example` with `ENABLE_SIMULATION_ENDPOINTS=true` plus safe placeholder-only `mock` / `openai-compatible` examples and secret warnings.
- [ ] 1.3 Keep `docker-compose.yml` unchanged; do not introduce a compose-based manual path for this task.

## Phase 2: Docs / spec alignment

- [ ] 2.1 Rewrite `docs/simulation-api.md` prerequisites to use `npm run start:simulation` and the `.env` copy flow.
- [ ] 2.2 Add copy/paste examples for `/dev/simulate/inbound-message` and `/dev/simulate/scenario` covering conversation, mediation, ambiguity, risk, unknown user, and debug-only `conversationId` continuity.
- [ ] 2.3 Document the response fields to inspect for each flow: `identity`, `inboundDecision`, `profileId`, `useCaseId`, `guideResult`, `steps[]`, and `summary`.
- [ ] 2.4 Keep the guide scoped to manual Simulation API readiness only; exclude console tooling, WhatsApp/Evolution, PostgreSQL, dependencies, and business-logic changes.

## Phase 3: Validation

- [ ] 3.1 Run `npm run check`.
- [ ] 3.2 Run `npm test`.
- [ ] 3.3 Run `npm run` and confirm `start:simulation` is listed.
- [ ] 3.4 Smoke-test the documented startup path and both simulation endpoints with the safe local env.
