# Design: T30B — Structural Cleanup

## Technical Approach

Three independent, zero-risk structural moves sharing no runtime coupling:

1. **Extract duplicated types** into `@serena/contracts` — a workspace-internal pure-types package.
2. **Replace** both core and gateway copies with barrel re-exports from `@serena/contracts`.
3. **Move** `ProcessChannelInboundMessage` + `ResolvedInboundActor` to a correctly-named `channel-inbound` module.

All changes are type-level re-exports, file moves, or import-path updates. Zero logic changes. Zero test expectation changes.

---

## Architecture Decisions

| # | Choice | Alternative | Rationale |
|---|--------|------------|-----------|
| 1 | `packages/contracts/` as pure-types workspace package | Inject types into existing `packages/shared/` | `shared` is empty — co-locating contracts would blur the boundary. Separate package gives clear ownership and prevents accidental runtime coupling. |
| 2 | Barrel re-export in core/gateway (not direct import) | Force all 15+ consumers to import from `@serena/contracts` directly | Re-exports preserve every existing import path. Zero consumer file changes for pipeline-result imports. Minimal churn. |
| 3 | Gateway file becomes identical re-export (not deleted) | Remove gateway file and update all 7 consumers | Same rationale as #2 — preserves backward compatibility. The file shrinks from 104 lines to ~13. |
| 4 | Test file stays in `inbound-gate/tests/` | Move test to `channel-inbound/tests/` | The test is an integration test for the full Pipeline — it imports from ai-guide, conversation-store, contact-directory. Moving it to channel-inbound would create misleading module coupling. File stays, imports update. |
| 5 | `channel-inbound` uses `application/use-cases/` + `application/results/` only | Add `domain/` or `infrastructure/` | `ProcessChannelInboundMessage` is a use case (application). `ResolvedInboundActor` is an application DTO. No domain entities exist for this module. |
| 6 | `tsconfig.json` for contracts uses `noEmit` + `allowImportingTsExtensions` | Compile to `.js` output | Both consuming apps use `--experimental-strip-types` with Node.js 22.6+. No compilation needed — types are consumed as `.ts` sources. |

---

## Data Flow (unchanged)

```
InboundMessageCommand ──→ ProcessChannelInboundMessage ──→ ChannelInboundResult
         │                          │
    ResolvedInboundActor        PipelineResult (from @serena/contracts)
```

The re-export chain: `consumer.ts` → `pipeline-result.ts` (re-export) → `@serena/contracts` (source types).

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/package.json` | Create | `"name": "@serena/contracts"`, `"main": "src/index.ts"`, `"type": "module"` |
| `packages/contracts/tsconfig.json` | Create | Extends `../../tsconfig.base.json`, `noEmit`, `allowImportingTsExtensions` |
| `packages/contracts/src/index.ts` | Create | All 8 PipelineResult variants + PipelineInput + PipelineResult union |
| `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` | Modify | Replace type definitions with barrel re-export from `@serena/contracts` |
| `apps/gateway-wa/src/domain/pipeline-result.ts` | Modify | Replace copied definitions + "COPIED from" header with identical re-export |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Create | Moved from `inbound-gate/application/use-cases/` — class body unchanged |
| `apps/core/src/modules/channel-inbound/application/results/resolved-inbound-actor.ts` | Create | Moved from `inbound-gate/application/results/` — byte-for-byte copy |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Delete | Moved to channel-inbound |
| `apps/core/src/modules/inbound-gate/application/results/resolved-inbound-actor.ts` | Delete | Moved to channel-inbound |
| ~15 import-update files | Modify | Update relative import paths only (see tables in spec) |

---

## Contracts Package Layout

```
packages/contracts/
  package.json       # name: @serena/contracts, main: src/index.ts, type: module, no deps
  tsconfig.json      # extends ../../tsconfig.base.json, noEmit, allowImportingTsExtensions
  src/
    index.ts         # all type definitions (10 exports total)
```

Root `package.json` already has `"packages/*"` in workspaces — npm auto-links without additional config.

---

## Behavior Preservation Guarantee

This change is **structurally zero-risk** because:

1. **Types are byte-for-byte identical** — same names, fields, discriminators, `readonly` modifiers.
2. **Re-exports preserve type identity** — TypeScript unions resolve identically.
3. **File moves preserve class body** — `ProcessChannelInboundMessage` implementation is not modified.
4. **Import path updates are mechanical** — same symbols reachable via new paths.
5. **No runtime code changes** — `process-channel-inbound-message.ts` internal logic, methods, and dependencies are untouched.

---

## Validation Plan

| Step | Command | Expected |
|------|---------|----------|
| Typecheck | `npm run typecheck` (core + gateway-wa) | Exit 0, no errors |
| Structure check | `npm run check:structure` | Exit 0 |
| Full tests | `npm test` | 578 passing (519 core + 59 gateway-wa) |
| Residual search | `rg "COPIED from" apps/gateway-wa/src/domain/pipeline-result.ts` | 0 matches |
| Residual search | `rg "inbound-gate.*process-channel-inbound-message" apps/core/src/` | 0 matches |
| Residual search | `rg "inbound-gate.*resolved-inbound-actor" apps/core/src/` | 0 matches |

---

## Open Questions

None. All technical decisions are resolved. No blockers.
