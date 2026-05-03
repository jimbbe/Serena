# Archive Report — refactor-inbound-identity-resolution

**Archived**: 2026-05-03
**Verdict**: PASS WITH WARNINGS (resolved during archive)
**Mode**: Hybrid (openspec + engram)

---

## Overview

Added an external identity resolution layer to the Serena inbound pipeline. The `ExternalIdentityResolver` port translates external channel sender identifiers (`tenantId + channel + externalSenderId`) into internal domain identity (`personId`, `role`, `displayName`, `authorized`, `status`), fixing the bug where `externalSenderId` was mapped directly to `senderId`.

## Files Created (4)

| File | Purpose |
|------|---------|
| `apps/core/src/modules/inbound-gate/application/results/resolved-inbound-actor.ts` | `ResolvedInboundActor` type with fields: status, tenantId, channel, externalSenderId, personId?, actorId?, role?, displayName?, authorized, reason? |
| `apps/core/src/modules/inbound-gate/application/ports/external-identity-resolver.ts` | `ExternalIdentityResolver` port interface with single `resolve(cmd)` method |
| `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | `InMemoryExternalIdentityResolver` — Map-based implementation with demo seed data (Marta on 3 channels + blocked sender) |
| `apps/core/src/modules/inbound-gate/tests/in-memory-external-identity-resolver.test.ts` | 8 unit tests covering all resolver scenarios |

## Files Modified (8)

| File | Changes |
|------|---------|
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Added optional `identity?: ResolvedInboundActor` field after `simulatedOutbound` |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-inbound-message.ts` | Added optional `personId?: string` to `ProcessInboundMessageInput` |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Added `identityResolver` dependency, resolve-first flow, blocked/unknown/resolved branching, adaptInput uses personId |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Creates `InMemoryExternalIdentityResolver`, wires into `ProcessChannelInboundMessage`, returns `identityResolver` |
| `apps/core/src/bootstrap/server.ts` | Destructures `identityResolver` from pipeline, passes to `ProcessChannelInboundMessage` |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Added resolver mock to all 17 existing tests + 4 new identity scenario tests |
| `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` | Updated with identity assertions for all pipeline senders |
| `docs/simulation-api.md` | New Identity Resolution section with field docs, response examples, demo identities table |

## Tests

| Suite | Passed | Notes |
|-------|--------|-------|
| Core (unit + integration) | 256 | All pass (including 12 new identity tests) |
| Gateway-wa (integration) | 38 | All pass (no change) |
| **Total** | **294** | **0 failures, 0 skipped** |

**New tests added**: 12
- 8 resolver unit tests (`in-memory-external-identity-resolver.test.ts`)
- 4 pipeline identity scenario tests (`process-channel-inbound-message.test.ts`)

**Updated tests**: 17 existing pipeline tests + 4 simulation endpoint tests

## Validation

| Check | Result |
|-------|--------|
| `npm run check` (structure + typecheck) | ✅ Pass |
| `npm run test` | ✅ 294 passed |

## Spec Synced

| Domain | Action | Details |
|--------|--------|---------|
| `external-identity-resolution` | **Created** (new) | Full main spec at `openspec/specs/external-identity-resolution/spec.md` |
| `inbound-simulation-usecase` | **Updated** | Added identity resolver dependency, identity resolution phase, updated adaptInput |
| `inbound-simulation-endpoint` | **Updated** | Response body includes `identity` field |
| `inbound-simulation-tests` | **Updated** | Added identity resolution test requirements for all test layers |

### Spec Divergences Resolved During Archive

| Issue | Spec (before) | Implementation | Resolution |
|-------|---------------|---------------|------------|
| Unknown identity flow | Short-circuit pipeline | Continue to gate (gate decides) | Spec updated to match implementation — continuing to gate is safer |
| IdentityRole | `"caregiver" \| "unknown"` | `"system"` | Spec updated to `"elder" \| "contact" \| "system"` (design decision) |
| tenantId default | `"default"` | `"demo"` | Spec updated to `"demo"` |
| Field optionality | personId, role, etc listed as required | Optional (correct for unknown/blocked) | Spec updated with optional markers |
| Demo data values | Abstract (`whatsapp_marta_001`) | Realistic (`+5492600000000`) | Spec updated to match real values |
| Test file name | `external-identity-resolver.test.ts` | `in-memory-external-identity-resolver.test.ts` | Spec updated (more precise naming) |
| Blocked reason | `"identity_blocked"` | `"unknown_sender"` | Spec updated (matches existing `InboundDecisionReason` union) |

## Architecture Decisions Persisted

| Decision | Value |
|----------|-------|
| `ResolvedInboundActor` location | `application/results/` (couples channel + identity concepts) |
| Resolver port shape | Full `InboundMessageCommand` (not tuple) |
| Resolver failure behavior | Degrade to unknown with warning (never crash) |
| Key format | `tenantId:channel:externalSenderId` (tenant-aware) |
| Unknown identity flow | Continue to gate (gate has own contact directory check) |
| Blocked identity flow | Short-circuit (no pipeline, no AI guide) |

## Archive Contents

- `proposal.md` ✅
- `spec.md` ✅ (updated to match implementation)
- `design.md` ✅
- `tasks.md` ✅ (12/12 tasks complete)
- `verify-report.md` ✅
- `archive-report.md` ✅ (this file)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
