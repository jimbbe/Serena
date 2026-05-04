# Archive Report: Scenario Runner for Multi-Step Conversations

**Change**: `scenario-runner`  
**Date**: 2026-05-03  
**Mode**: Hybrid (engram + openspec)

---

## Change Summary

Built a multi-step conversation simulation endpoint (`POST /dev/simulate/scenario`) that executes sequential message steps against the same `ProcessChannelInboundMessage` pipeline instance, enabling developers to test full conversational flows (mediation, risk, unknown sender) in a single HTTP request. All 31 tasks complete, 331/331 tests passing, 37/37 spec scenarios compliant.

---

## Engram Artifacts (Observation IDs)

| Artifact | ID | Type |
|----------|----|------|
| `sdd/scenario-runner/explore` | #542 | architecture |
| `sdd/scenario-runner/proposal` | #543 | architecture |
| `sdd/scenario-runner/spec` | #544 | architecture |
| `sdd/scenario-runner/design` | #545 | architecture |
| `sdd/scenario-runner/tasks` | #546 | architecture |
| `sdd/scenario-runner/apply-progress` | #547 | architecture |
| `sdd/scenario-runner/verify-report` | #551 | architecture |

---

## Artifacts (Filesystem)

- **Files created**:
  - `apps/core/src/bootstrap/scenario-runner.ts` — `SimulationScenarioRunner` class + `calculateSummary` pure function + all scenario types
  - `apps/core/src/bootstrap/scenario-handler.ts` — `createScenarioHandler(runner)` HTTP handler factory
  - `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts` — 28 integration/unit tests

- **Files modified**:
  - `apps/core/src/bootstrap/server.ts` — added 5th optional `scenarioHandler` param + `POST /dev/simulate/scenario` route
  - `apps/core/src/server.ts` — wired runner and handler in simulation-enabled block
  - `docs/simulation-api.md` — appended full scenario endpoint documentation with curl examples

- **Delta specs synced to main**:
  - `openspec/specs/inbound-simulation-endpoint/spec.md` — merged (2 ADDED requirements, 1 MODIFIED requirement)
  - `openspec/specs/scenario-simulation/spec.md` — created (NEW standalone spec)

---

## Verification

**PASS** ✅

| Metric | Value |
|--------|-------|
| Tasks complete | 31/31 |
| Tests passing | 331/331 (core: 293, gateway-wa: 38) |
| Spec scenarios compliant | 37/37 |
| Critical issues | 0 |
| Warnings | 2 (field naming divergence, externalSenderId validation scope) |
| Suggestions | 3 (missing channel test, HTTP blocked test, docs clarification) |

---

## Key Decisions

1. **Runner in bootstrap/ layer** — Dev-tool orchestrator that reuses existing use cases, no domain logic duplication
2. **Types inline in runner** — Follows existing `server.ts` pattern; types are single-consumer (~30 lines)
3. **5th positional param for `createHttpServer`** — Matches existing pattern; config object refactor deferred
4. **`calculateSummary` as pure function** — No state needed, testable in isolation, named export
5. **Dedicated `validateScenarioRequest`** — Different shape (steps[] array, stopOnError, defaults) warrants separate validator
6. **`stopOnError` breaks on throw only** — AI failures treated as "failed step" in summary but don't break the loop

---

## Learnings

- `exactOptionalPropertyTypes=true` prevents setting optional properties to `undefined` explicitly — use conditional spreads
- `ChannelInboundResult.guideResult` is `GuideResult | undefined`, not `GuideResult?` — must always be present in object literals
- Unknown/blocked senders are NOT "failed steps" — the pipeline successfully processes and correctly blocks them
- Sequential steps with shared in-memory state can cause cascade effects (mediation session affects subsequent steps)
- `calculateSummary` correctly separates step failure (pipeline errors) from event counts (gate decisions)

---

## Future Work

1. **Config object refactor for `createHttpServer`** — 5 positional params is getting unwieldy; consider refactoring to config object
2. **Coverage tooling** — No coverage configured; would be valuable for confidence in future changes
3. **Channel validation test at scenario level** — Currently tests invalid channel but not completely omitted channel
4. **HTTP-level test for `identity.status === "blocked"`** — Currently only tested in `calculateSummary` unit test
5. **`stopOnError` docs clarification** — Explicitly state it only stops on thrown exceptions, not AI result failures
