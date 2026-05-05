# Archive Report — T31A: Manual Simulation Readiness

**Archived at**: 2026-05-05
**Source**: `openspec/changes/t31a-manual-simulation-readiness/` → `openspec/changes/archive/2026-05-05-t31a-manual-simulation-readiness/`
**Mode**: Hybrid (engram + openspec)
**SDD Cycle**: Complete ✓

## Summary

Made Serena manually testable through the Simulation API with a safe local setup for `mock` or `openai-compatible`, without changing product behavior. The task stayed scoped to startup/docs/env readiness and excluded WhatsApp, PostgreSQL, dependency, and prompt/policy changes.

## Engram Artifacts

| Artifact | ID | Type |
|----------|----|------|
| `sdd/t31a-manual-simulation-readiness/explore` | #664 | architecture |
| `sdd/t31a-manual-simulation-readiness/proposal` | #666 | architecture |
| `sdd/t31a-manual-simulation-readiness/spec` | #668 | architecture |
| `sdd/t31a-manual-simulation-readiness/design` | #671 | architecture |
| `sdd/t31a-manual-simulation-readiness/tasks` | #674 | architecture |
| `sdd/t31a-manual-simulation-readiness/validation` | #677 | discovery |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `inbound-simulation-endpoint` | Updated | Added manual readiness guide requirement and debug-only `conversationId` guidance |
| `scenario-simulation` | Updated | Added manual scenario readiness guide and response inspection guidance |
| `provider-selection-config` | Updated | Added safe local provider setup requirement with placeholder-only env examples |

## Archive Contents

- `exploration.md` ✅
- `proposal.md` ✅
- `spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅
- `specs/` ✅
- `archive-report.md` ✅

## Validation

- `npm run check` ✅
- `npm test` ✅ (578 tests, 0 failures)
- `npm run` ✅ (`start:simulation` listed)

## Source of Truth Updated

- `openspec/specs/provider-selection-config/spec.md`
- `openspec/specs/scenario-simulation/spec.md`
- `openspec/specs/inbound-simulation-endpoint/spec.md`
