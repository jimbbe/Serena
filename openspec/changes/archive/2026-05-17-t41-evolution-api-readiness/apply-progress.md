## Implementation Progress

**Change**: t41-evolution-api-readiness  
**Mode**: Strict TDD

### Follow-up Scope (warnings only)
- Tighten strict-TDD evidence format for explicit **Safety Net / RED / GREEN / TRIANGULATE / REFACTOR** auditability.
- Add dedicated T41 assertions for:
  - Core boundary: Core source never embeds direct Evolution endpoint/config usage.
  - Restart limitation: in-memory instance tracking limitation is explicit in canonical project docs.

### Files Changed
- `scripts/tests/t41-evolution-api-readiness.test.ts` (modified)
- `sdd/t41-evolution-api-readiness/apply-progress` (modified, merged cumulative progress)

### TDD Evidence (follow-up batch)
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| warning-1 + warning-2 | `scripts/tests/t41-evolution-api-readiness.test.ts` | Unit/static | ✅ `node --experimental-strip-types --test scripts/tests/t41-evolution-api-readiness.test.ts` baseline passed before edits | ✅ Added dedicated failing assertions first | ✅ Focused suite passed 6/6; `npm run check` passed | ✅ Two independent added behaviors (boundary + restart limitation) | ➖ None needed (assertion/documentation hardening only) |

### Status
- Tasks remain complete: 11/11 (no task scope expansion).
- Warning follow-up implemented and ready for re-verify.
