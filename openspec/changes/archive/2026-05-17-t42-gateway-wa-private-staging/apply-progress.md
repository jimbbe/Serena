# Apply Progress — t42-gateway-wa-private-staging

## Mode

- Strict TDD (from `openspec/config.yaml`)

## Completed Tasks

- [x] 1.1 handler unit tests updated with safe-shape + credential absence assertions
- [x] 1.2 integration tests updated to enforce safe-shape + credential absence assertions
- [x] 1.3 API contract docs updated to safe response shape
- [x] 2.1 removed `apiKey` from `POST /instances` success serialization
- [x] 2.2 handler compatibility kept (`appKey` param remains, not serialized)
- [x] 3.1 runbook updated with T42 guardrails + evidence requirements
- [x] 3.2 project status updated with T42 hardening status
- [x] 3.3 smoke + compose comments tightened for private-only/non-destructive boundaries
- [x] 3.4 evidence file created with explicit deferral rationale and non-actions
- [x] 4.1 validations executed (`gateway-wa` tests + `npm run check`)
- [ ] 4.2 conditional live rollout validation (not run; rollout deferred)

## TDD Cycle Evidence

| Task | RED (test first) | GREEN (implementation) | REFACTOR | Result |
|---|---|---|---|---|
| 1.1 | Added absence assertions before handler code change | Passed after handler serialization change | N/A | ✅ |
| 1.2 | Added integration absence assertions before handler code change | Passed after handler serialization change | N/A | ✅ |
| 1.3 | Doc contract updated during RED phase | N/A | N/A | ✅ |
| 2.1 | Covered by 1.1 + 1.2 failing expectations | Implemented minimal serialization removal | Kept signature compatibility | ✅ |
| 2.2 | N/A | `appKey` preserved and explicitly unused | N/A | ✅ |
| 3.1 | N/A | Implemented guardrails in runbook | Clarified evidence contract | ✅ |
| 3.2 | N/A | Updated status doc | N/A | ✅ |
| 3.3 | N/A | Added private URL fail-closed guard + private topology comments | Fixed wording to preserve T41 validation expectations | ✅ |
| 3.4 | N/A | Evidence file created with deferral and non-actions | N/A | ✅ |
| 4.1 | N/A | Ran test and check commands successfully | N/A | ✅ |
| 4.2 | N/A | Not executed (no operator-approved live VPS mutation context) | N/A | ⏸️ Deferred |

## Validation Evidence

- `npm run -w @serena/gateway-wa test` ✅
- `npm run check` ✅

## Deviations / Notes

- Live VPS mutation was intentionally deferred for safety and scope control in this repository-only execution context.
- No Caddy/DNS/public admin changes, no WhatsApp pairing, no real sends, no volume deletion, no secret exposure.
