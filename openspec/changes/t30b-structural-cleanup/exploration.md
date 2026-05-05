# Exploration: T30B — Structural Cleanup

## Current State

The codebase has two structural issues:

1. **Duplicated contracts**: `PipelineResult` (8 variants) and `PipelineInput` are defined in `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` and copied verbatim to `apps/gateway-wa/src/domain/pipeline-result.ts`. The gateway copy has a header comment: "COPIED from... DO NOT modify without updating the corresponding source." This is a maintenance burden — any contract change requires manual sync.

2. **Misplaced use case**: `ProcessChannelInboundMessage` lives in `inbound-gate` module but is channel-agnostic (accepts any `InboundChannel`). The module name `inbound-gate` suggests WhatsApp-gate responsibility, but this use case orchestrates the full pipeline for any channel. Similarly, `ResolvedInboundActor` is in `inbound-gate/application/results/` but is a cross-cutting identity type.

## Affected Areas

### Contracts duplication
- `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` — source of truth
- `apps/gateway-wa/src/domain/pipeline-result.ts` — verbatim copy
- `apps/gateway-wa/src/application/call-serena-core.ts` — imports from gateway copy
- `apps/gateway-wa/src/application/map-pipeline-result.ts` — imports from gateway copy
- `apps/gateway-wa/src/application/run-dry-gateway-event.ts` — imports from gateway copy
- `apps/gateway-wa/src/tests/dry-run-gateway.test.ts` — imports from gateway copy
- `apps/gateway-wa/src/application/call-serena-core.test.ts` — imports from gateway copy

### ProcessChannelInboundMessage move
- `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` — source file (303 lines)
- `apps/core/src/modules/inbound-gate/application/results/resolved-inbound-actor.ts` — type to move (35 lines)
- `apps/core/src/server.ts` — imports and instantiates
- `apps/core/src/bootstrap/simulation-handler.ts` — type import
- `apps/core/src/bootstrap/scenario-runner.ts` — type import
- `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — imports `ResolvedInboundActor`
- `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` — imports `ResolvedInboundActor`
- `apps/core/src/modules/inbound-gate/application/ports/external-identity-resolver.ts` — imports `ResolvedInboundActor`
- `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` — imports `ResolvedInboundActor`
- `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` — imports both
- `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` — imports `ProcessChannelInboundMessage`
- `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts` — imports `ProcessChannelInboundMessage`

## Approaches

### Approach 1: Create `packages/contracts` + move files (RECOMMENDED)
Create `@serena/contracts` package exporting `PipelineResult` variants and `PipelineInput`. Keep core source as the canonical definition, add re-exports in core and gateway. Move `ProcessChannelInboundMessage` to new `channel-inbound` module with `ResolvedInboundActor`.

- **Pros**: Single source of truth for contracts, eliminates copy-paste risk, proper module naming
- **Cons**: Requires new package setup, many import updates
- **Effort**: Medium

### Approach 2: Re-export from core only (contracts only, no move)
Keep everything in place but add re-export barrel files so gateway imports from core via workspace reference.

- **Pros**: Minimal file movement, quick
- **Cons**: Does not address `ProcessChannelInboundMessage` misplacement, module naming still wrong
- **Effort**: Low

### Approach 3: Move only, no shared contracts package
Move files to correct locations but keep duplication pattern.

- **Pros**: Addresses module naming
- **Cons**: Does not solve contract duplication problem
- **Effort**: Medium

## Recommendation

**Approach 1** — full structural cleanup:

1. Create `packages/contracts` with `package.json` (`@serena/contracts`), `tsconfig.json`, and `src/index.ts`
2. Export `PipelineInput` and all `PipelineResult` variants from `@serena/contracts`
3. Update core's `pipeline-result.ts` to re-export from `@serena/contracts`
4. Update gateway's `pipeline-result.ts` to re-export from `@serena/contracts`
5. Create `apps/core/src/modules/channel-inbound/` directory structure
6. Move `process-channel-inbound-message.ts` to `channel-inbound/application/use-cases/`
7. Move `resolved-inbound-actor.ts` to `channel-inbound/application/results/`
8. Update all imports across core, tests, and bootstrap files
9. Update OpenSpec specs referencing old paths

### Implementation plan detail:

**packages/contracts structure:**
```
packages/contracts/
  package.json        # name: "@serena/contracts", main: "src/index.ts"
  tsconfig.json       # extends ../../tsconfig.base.json
  src/
    index.ts          # re-exports from orchestrator domain
```

**Re-export pattern in core:**
```ts
// apps/core/src/modules/orchestrator/domain/pipeline-result.ts
// Replace inline types with re-exports:
export { PipelineResult, PipelineInput, ...all variants } from "@serena/contracts";
```

**Re-export pattern in gateway:**
```ts
// apps/gateway-wa/src/domain/pipeline-result.ts
// Replace entire file with:
export { PipelineResult, PipelineInput, ...all variants } from "@serena/contracts";
```

**channel-inbound module structure:**
```
apps/core/src/modules/channel-inbound/
  application/
    use-cases/
      process-channel-inbound-message.ts  (moved)
    results/
      resolved-inbound-actor.ts  (moved)
```

**Import updates needed (estimated 12-15 files):**
- All files importing from `inbound-gate/.../process-channel-inbound-message` → `channel-inbound/.../process-channel-inbound-message`
- All files importing `ResolvedInboundActor` from `inbound-gate/.../resolved-inbound-actor` → `channel-inbound/.../resolved-inbound-actor`
- Gateway files importing from local `pipeline-result.ts` → `@serena/contracts`
- Core files importing from local `pipeline-result.ts` → `@serena/contracts` (or keep local re-export)

## Risks

1. **Circular dependency risk**: If `@serena/contracts` imports from core or gateway, workspace resolution breaks. The contracts package must be pure types with no runtime imports from other workspace packages.
2. **Import path churn**: ~15 files need import updates. Each must be verified to avoid typos.
3. **Test breakage**: All 578 tests must still pass. The `process-channel-inbound-message.test.ts` file (large, ~2000+ lines) will need import updates.
4. **OpenSpec spec drift**: Specs reference old paths (`inbound-gate/...`). These must be updated or the verify phase will fail.
5. **tsconfig path resolution**: The new `packages/contracts` needs to be resolvable by both core and gateway tsconfigs. Since this is a workspace monorepo, npm workspaces handles module resolution — no path aliases needed.

## Ready for Proposal

**Yes.** The scope is well-understood, the approach is clear, and the risks are manageable. The orchestrator should proceed to `/sdd-propose` with Approach 1.
