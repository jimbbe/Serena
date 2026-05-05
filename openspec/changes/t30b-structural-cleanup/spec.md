# Delta Spec: T30B — Structural Cleanup

## Change: t30b-structural-cleanup

## Purpose

Eliminate duplicated `PipelineInput`/`PipelineResult` contracts between core and gateway-wa by introducing `@serena/contracts` as the single source of truth. Move `ProcessChannelInboundMessage` and `ResolvedInboundActor` from the misnamed `inbound-gate` module to a new `channel-inbound` module that reflects their channel-agnostic nature. Zero behavior changes — pure structural reorganization.

---

## Capability: shared-contracts

### Requirement: `@serena/contracts` Package Exists

The system SHALL define a new workspace package `@serena/contracts` at `packages/contracts/` with the following structure:

```
packages/contracts/
  package.json        # name: "@serena/contracts", main: "src/index.ts"
  tsconfig.json       # extends ../../tsconfig.base.json (or equivalent)
  src/
    index.ts          # barrel export of all contracts
```

The package SHALL be included in the root `package.json` workspaces array (already covered by `"packages/*"` pattern).

#### Scenario: Package resolves via npm workspaces

- GIVEN the root `package.json` has `"workspaces": ["apps/*", "packages/*"]`
- WHEN `packages/contracts/package.json` exists with `"name": "@serena/contracts"`
- THEN both `@serena/core` and `@serena/gateway-wa` can import from `@serena/contracts` without path aliases

#### Scenario: Package contains no runtime imports from workspace packages

- GIVEN `packages/contracts/src/index.ts` is inspected
- THEN it contains only `export` statements for pure TypeScript types
- AND it has NO `import` statements from `@serena/core`, `@serena/gateway-wa`, or any other workspace package

---

### Requirement: PipelineResult Variants Exported from `@serena/contracts`

The `@serena/contracts` package SHALL export the following types with identical names, field shapes, and discriminated `type` values as the current definitions in `apps/core/src/modules/orchestrator/domain/pipeline-result.ts`:

| Exported Type | Discriminator | Required Fields |
|---|---|---|
| `PipelineResult` | (union) | Union of all 8 variants below |
| `DiscardResult` | `type: "discard"` | `reason: string` |
| `ConversationPendingResult` | `type: "conversation_pending"` | `senderId: string` |
| `RiskReviewRequiredResult` | `type: "risk_review_required"` | `senderId: string`, `matchedSignals: readonly string[]` |
| `MediationNotUnderstoodResult` | `type: "mediation_not_understood"` | `senderId: string` |
| `RecipientNotFoundResult` | `type: "recipient_not_found"` | `senderId: string`, `recipientName: string` |
| `MediationStartedResult` | `type: "mediation_started"` | `sessionId`, `requesterId`, `requesterDisplayName`, `recipientId`, `recipientDisplayName`, `rewordedText` (all `string`) |
| `MediationReplyRecordedResult` | `type: "mediation_reply_recorded"` | `sessionId`, `fromParticipantId`, `fromDisplayName`, `toParticipantId`, `toDisplayName`, `rewordedText` (all `string`) |
| `AmbiguousActiveSessionResult` | `type: "ambiguous_active_session"` | `senderId: string`, `activeSessionIds: readonly string[]` |
| `PipelineInput` | N/A | `senderWhatsAppId: string`, `messageText: string`, `receivedAt: string` |

The type definitions SHALL be byte-for-byte equivalent to the current source (same field names, same types, same `readonly` modifiers on arrays).

#### Scenario: All 8 PipelineResult variants are exported

- GIVEN `@serena/contracts` is imported
- THEN all 8 variant types plus `PipelineResult` union and `PipelineInput` are accessible

#### Scenario: Type discriminator values are unchanged

- GIVEN each variant type is inspected
- THEN the `type` field literal values match the existing definitions exactly (e.g., `"discard"`, `"conversation_pending"`, etc.)

---

## Capability: core-re-export

### Requirement: Core Re-exports Pipeline Contracts from `@serena/contracts`

The file `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` SHALL be replaced with a re-export barrel that re-exports all types from `@serena/contracts`:

```typescript
export {
  PipelineResult,
  PipelineInput,
  DiscardResult,
  ConversationPendingResult,
  RiskReviewRequiredResult,
  MediationNotUnderstoodResult,
  RecipientNotFoundResult,
  MediationStartedResult,
  MediationReplyRecordedResult,
  AmbiguousActiveSessionResult,
} from "@serena/contracts";
```

All existing consumers within `@serena/core` that import from this file SHALL continue to work without changing their import paths. The re-export preserves backward compatibility.

#### Scenario: Core consumers still import from orchestrator domain path

- GIVEN `internal-pipeline-handler.ts` imports from `../modules/orchestrator/domain/pipeline-result.ts`
- WHEN the file is replaced with re-exports
- THEN the import resolves correctly and types are identical

#### Scenario: All 5 core files importing pipeline-result.ts still compile

- GIVEN the following files import from `orchestrator/domain/pipeline-result.ts`:
  - `bootstrap/internal-pipeline-handler.ts`
  - `modules/whatsapp-gateway/application/map-pipeline-result-to-gateway-action.ts`
  - `modules/whatsapp-gateway/tests/map-pipeline-result-to-gateway-action.test.ts`
  - `modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts`
  - `modules/internal-pipeline/domain/processed-message-store.ts`
- WHEN `npm run typecheck:core` runs
- THEN all 5 files type-check without errors

---

## Capability: gateway-re-export

### Requirement: Gateway Re-exports Pipeline Contracts from `@serena/contracts`

The file `apps/gateway-wa/src/domain/pipeline-result.ts` SHALL be replaced with a re-export barrel identical to the core pattern:

```typescript
export {
  PipelineResult,
  PipelineInput,
  DiscardResult,
  ConversationPendingResult,
  RiskReviewRequiredResult,
  MediationNotUnderstoodResult,
  RecipientNotFoundResult,
  MediationStartedResult,
  MediationReplyRecordedResult,
  AmbiguousActiveSessionResult,
} from "@serena/contracts";
```

The file SHALL NOT contain the "COPIED from..." header comment or any inline type definitions.

#### Scenario: Gateway file has no copied type definitions

- GIVEN `apps/gateway-wa/src/domain/pipeline-result.ts` is inspected
- THEN it contains ONLY re-export statements from `@serena/contracts`
- AND it does NOT contain the string "COPIED from"

#### Scenario: All 6 gateway files importing pipeline-result.ts still compile

- GIVEN the following files import from `../domain/pipeline-result.ts` or `./pipeline-result.ts`:
  - `application/call-serena-core.ts`
  - `application/call-serena-core.test.ts`
  - `application/normalize-mock-event.ts`
  - `application/run-dry-gateway-event.ts`
  - `application/map-pipeline-result.ts`
  - `domain/dry-run-result.ts`
  - `tests/dry-run-gateway.test.ts`
- WHEN `npm run typecheck:gateway-wa` runs
- THEN all files type-check without errors

---

## Capability: channel-inbound-module

### Requirement: `channel-inbound` Module Created

The system SHALL create a new module at `apps/core/src/modules/channel-inbound/` with the following structure:

```
apps/core/src/modules/channel-inbound/
  application/
    use-cases/
      process-channel-inbound-message.ts  (moved from inbound-gate)
    results/
      resolved-inbound-actor.ts  (moved from inbound-gate)
```

The module SHALL NOT contain any files from `inbound-gate` other than the two explicitly moved. The `inbound-gate` module SHALL retain all its other files (domain types, ports, infrastructure, other use cases, tests that remain in inbound-gate).

#### Scenario: channel-inbound directory structure exists

- GIVEN the filesystem is inspected
- THEN `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` exists
- AND `apps/core/src/modules/channel-inbound/application/results/resolved-inbound-actor.ts` exists

#### Scenario: inbound-gate no longer contains moved files

- GIVEN `apps/core/src/modules/inbound-gate/` is inspected
- THEN `application/use-cases/process-channel-inbound-message.ts` does NOT exist
- AND `application/results/resolved-inbound-actor.ts` does NOT exist
- AND all other inbound-gate files remain intact

---

### Requirement: `ProcessChannelInboundMessage` File Content Unchanged (Except Internal Imports)

The moved file `channel-inbound/application/use-cases/process-channel-inbound-message.ts` SHALL preserve its exact class implementation, methods, and behavior. Only internal relative imports SHALL be updated to reflect the new file location:

- Import of `ResolvedInboundActor` SHALL change from `../results/resolved-inbound-actor.ts` to `../results/resolved-inbound-actor.ts` (same relative path since both move together — no change needed)
- All other imports (to `inbound-gate`, `ai-guide`, `conversation-store`, `contact-directory`) SHALL be updated with correct relative paths from the new location (one level deeper in the module tree)

#### Scenario: Class implementation is byte-for-byte identical

- GIVEN the old and new `process-channel-inbound-message.ts` files are compared (excluding import paths)
- THEN the class body, methods, and logic are identical

#### Scenario: Relative imports resolve correctly from new location

- GIVEN the file is at `channel-inbound/application/use-cases/`
- WHEN relative imports to `../../inbound-gate/...` are resolved
- THEN they point to the correct files in the `inbound-gate` module

---

### Requirement: `ResolvedInboundActor` File Content Unchanged

The moved file `channel-inbound/application/results/resolved-inbound-actor.ts` SHALL be an exact copy of the original with no changes to types, fields, or comments.

#### Scenario: ResolvedInboundActor type is unchanged

- GIVEN the old and new files are compared
- THEN they are byte-for-byte identical

---

### Requirement: All Import Paths Updated

All files that previously imported from the old locations SHALL be updated to import from the new `channel-inbound` module paths:

**ProcessChannelInboundMessage imports (5 files):**

| File | Old Import Path | New Import Path |
|---|---|---|
| `server.ts` | `./modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | `./modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` |
| `bootstrap/scenario-runner.ts` | `../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | `../modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` |
| `bootstrap/simulation-handler.ts` | `../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | `../modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` |
| `bootstrap/tests/simulation-endpoint.test.ts` | `../../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | `../../modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` |
| `bootstrap/tests/scenario-endpoint.test.ts` | `../../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | `../../modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` |

**ResolvedInboundActor imports (4 files):**

| File | Old Import Path | New Import Path |
|---|---|---|
| `bootstrap/create-in-memory-pipeline.ts` | `../modules/inbound-gate/application/results/resolved-inbound-actor.ts` | `../modules/channel-inbound/application/results/resolved-inbound-actor.ts` |
| `inbound-gate/application/results/channel-inbound-result.ts` | `./resolved-inbound-actor.ts` | `../../../channel-inbound/application/results/resolved-inbound-actor.ts` |
| `inbound-gate/application/ports/external-identity-resolver.ts` | `../results/resolved-inbound-actor.ts` | `../../../channel-inbound/application/results/resolved-inbound-actor.ts` |
| `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | `../../application/results/resolved-inbound-actor.ts` | `../../../channel-inbound/application/results/resolved-inbound-actor.ts` |

**Test file imports:**

| File | Change |
|---|---|
| `inbound-gate/tests/process-channel-inbound-message.test.ts` | Update imports for both `ProcessChannelInboundMessage` and `ResolvedInboundActor` to new paths |

#### Scenario: All import paths resolve correctly

- GIVEN all 10+ files listed above have updated imports
- WHEN `npm run typecheck:core` runs
- THEN no "cannot find module" or "file not found" errors occur

---

## Capability: validation

### Requirement: npm run check Passes

After all structural changes, the command `npm run check` (which runs `check:structure` and `typecheck`) SHALL exit with code 0 and no errors.

#### Scenario: Structure check passes

- GIVEN all files are in their new locations
- WHEN `npm run check:structure` runs
- THEN it exits with code 0

#### Scenario: Type-check passes for both workspaces

- GIVEN all imports are updated
- WHEN `npm run typecheck` runs
- THEN both `typecheck:core` and `typecheck:gateway-wa` exit with code 0

---

### Requirement: npm test Passes Without Regression

After all structural changes, the command `npm test` SHALL pass with the same number of tests as baseline (578 total: 519 core + 59 gateway-wa) with zero failures.

#### Scenario: All core tests pass

- GIVEN `npm run test:core` runs
- THEN 519 tests pass with 0 failures

#### Scenario: All gateway-wa tests pass

- GIVEN `npm run test:gateway-wa` runs
- THEN 59 tests pass with 0 failures

---

### Requirement: No Residual References to Old Paths

After all changes, the following searches SHALL return zero results:

1. `rg "inbound-gate.*process-channel-inbound-message"` in `apps/core/src/` → 0 results (no remaining imports from old path)
2. `rg "inbound-gate.*resolved-inbound-actor"` in `apps/core/src/` → 0 results (no remaining imports from old path)
3. `rg "COPIED from"` in `apps/gateway-wa/src/domain/pipeline-result.ts` → 0 results (copied header removed)

#### Scenario: No old imports remain for ProcessChannelInboundMessage

- GIVEN the core source tree is searched
- WHEN `rg "inbound-gate.*process-channel-inbound-message"` runs
- THEN zero matches are found

#### Scenario: No old imports remain for ResolvedInboundActor

- GIVEN the core source tree is searched
- WHEN `rg "inbound-gate.*resolved-inbound-actor"` runs
- THEN zero matches are found

#### Scenario: Gateway pipeline-result.ts has no copied header

- GIVEN `apps/gateway-wa/src/domain/pipeline-result.ts` is searched
- WHEN `rg "COPIED from"` runs on that file
- THEN zero matches are found

---

## Constraints

1. **Zero behavior changes**: No logic, no algorithms, no runtime behavior changes. Only file moves, re-exports, and import path updates.
2. **No new dependencies**: `@serena/contracts` is a workspace-internal package with no external dependencies.
3. **No feature additions**: No simulation playbook, manual console, real WhatsApp, Evolution API, PostgreSQL, prompt/policy/provider changes, or public API changes.
4. **Clean Architecture preserved**: Module boundaries remain clean. `channel-inbound` follows the same `application/use-cases/` and `application/results/` layering pattern.
5. **TypeScript strict mode**: All types must be correct — no `any`, no implicit `any`.
6. **Re-export preference**: Core and gateway SHALL use re-exports (not direct imports from `@serena/contracts`) to preserve existing import paths for internal consumers and minimize churn.
