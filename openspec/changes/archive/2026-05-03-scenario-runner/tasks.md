# Tasks: Scenario Runner for Multi-Step Conversations

**Change**: `scenario-runner`  
**Created**: 2026-05-03  
**Status**: ✅ complete

---

## Group 1: Core types and runner (`scenario-runner.ts`)

- [x] **T1**: Define scenario types — S
- [x] **T2**: Implement `SimulationScenarioRunner` class — M
- [x] **T3**: Implement `calculateSummary()` pure function — S
- [x] **T4**: Implement step execution loop with stopOnError — S

---

## Group 2: HTTP handler (`scenario-handler.ts`)

- [x] **T5**: Implement `validateScenarioRequest()` — M
- [x] **T6**: Implement `createScenarioHandler()` factory — S
- [x] **T7**: Handle error responses (400, 405, 500) — S

---

## Group 3: Server routing (`server.ts`)

- [x] **T8**: Add `scenarioHandler?` 5th param to `createHttpServer()` — XS
- [x] **T9**: Add route `POST /dev/simulate/scenario` — S

---

## Group 4: Wiring (`server.ts` entry point)

- [x] **T10**: Create `SimulationScenarioRunner` instance — XS
- [x] **T11**: Wire scenario handler when `ENABLE_SIMULATION_ENDPOINTS=true` — XS
- [x] **T12**: Add console log for new endpoint — XS

---

## Group 5: Documentation

- [x] **T13**: Document `POST /dev/simulate/scenario` in `docs/simulation-api.md` — S
- [x] **T14**: Add curl examples — S
- [x] **T15**: Document summary and limitations — XS

---

## Group 6: Tests (`scenario-endpoint.test.ts`)

- [x] **T16**: Test endpoint disabled returns 404 — XS
- [x] **T17**: Test method enforcement (GET → 405) — XS
- [x] **T18**: Test invalid payloads — M
- [x] **T19**: Test conversational scenario (3 steps, all success) — M
- [x] **T20**: Test mediation scenario — S
- [x] **T21**: Test risk scenario — S
- [x] **T22**: Test unknown sender scenario — S
- [x] **T23**: Test blocked sender scenario — S
- [x] **T24**: Test stopOnError=true (breaks on error) — S
- [x] **T25**: Test stopOnError=false (continues past error) — S
- [x] **T26**: Test ai-guide failed → step marked as failed — S
- [x] **T27**: Test multi-actor scenario (step overrides) — S
- [x] **T28**: Test runner uses `ProcessChannelInboundMessage` (no duplicated logic) — XS
- [x] **T29**: Test summary accuracy (counts verified) — S

---

## Group 7: Validation

- [x] **T30**: Run `npm run check` — XS
- [x] **T31**: Run `npm run test` — XS

---

## Summary

| Group | Tasks | Status |
|-------|-------|--------|
| 1. Core types and runner | T1-T4 | ✅ |
| 2. HTTP handler | T5-T7 | ✅ |
| 3. Server routing | T8-T9 | ✅ |
| 4. Wiring | T10-T12 | ✅ |
| 5. Documentation | T13-T15 | ✅ |
| 6. Tests | T16-T29 | ✅ |
| 7. Validation | T30-T31 | ✅ |

**Total**: 31/31 tasks complete ✅
