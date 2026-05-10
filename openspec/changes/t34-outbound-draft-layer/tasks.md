# Tasks: T34 — Outbound Draft Layer

## Phase 1: Domain & Port — outbound-draft module foundation

- [x] T1 Create `apps/core/src/modules/outbound-draft/domain/outbound-draft.ts` — export `OutboundDraftStatus` union type with all 7 literal values (`"confirmed_pending_delivery"`, `"needs_recipient_resolution"`, `"needs_recipient_disambiguation"`, `"cancelled"`, `"delivery_requested"`, `"delivered"`, `"failed"`), `OutboundDraft` type with all 16 fields per spec DR1, and `validateOutboundDraft(draft: OutboundDraft): string[]` that checks `messageText`, `requesterPersonId`, `conversationId`, `recipientHint` are non-empty (trimmed)
- [x] T2 Create `apps/core/src/modules/outbound-draft/domain/index.ts` — barrel re-export from `outbound-draft.ts`
- [x] T3 Create `apps/core/src/modules/outbound-draft/port/outbound-draft-store.ts` — export `OutboundDraftStore` type alias with 8 methods: `create`, `findById`, `findByConversationId`, `findPendingDelivery`, `markDeliveryRequested`, `markDelivered`, `markFailed`, `cancel` (all returning `Promise<OutboundDraft>` or `Promise<OutboundDraft[]>`)
- [x] T4 Create `apps/core/src/modules/outbound-draft/port/index.ts` — barrel re-export from `outbound-draft-store.ts`

## Phase 2: Adapter — in-memory store

- [x] T5 Create `apps/core/src/modules/outbound-draft/adapter/in-memory-outbound-draft-store.ts` — `InMemoryOutboundDraftStore` class implementing `OutboundDraftStore` using `Map<string, OutboundDraft>`, all 8 operations, status transitions update `updatedAt`, `findPendingDelivery` filters by `confirmed_pending_delivery` only
- [x] T6 Create `apps/core/src/modules/outbound-draft/adapter/index.ts` — barrel re-export from `in-memory-outbound-draft-store.ts`

## Phase 3: Application — recipient resolution & use case

- [x] T7 Create `apps/core/src/modules/outbound-draft/application/resolve-outbound-recipient.ts` — export `RecipientResolution` discriminated union (`resolved` | `not_found` | `ambiguous` per spec DR3) and `resolveOutboundRecipient(hint: string, contactDirectory: ContactDirectory): RecipientResolution` that uses `contactDirectory.findAll()`, trims hint, case-insensitive match on `displayName`, returns `resolved` for exactly 1 match, `ambiguous` for 2+ matches, `not_found` for 0 matches; for `resolved`, extract WhatsApp binding from `externalBindings` (fallback to `whatsappId`)
- [x] T8 Create `apps/core/src/modules/outbound-draft/application/use-cases/create-outbound-draft-from-mediation.ts` — `CreateOutboundDraftFromMediation` class with `execute({ flowState, identity, recipientResolution, store })` that validates flowState.draft not null, recipientHint non-empty, messageDraft non-empty, conversationId present; maps `RecipientResolution` to draft fields and initial status per spec DR6 (resolved → `confirmed_pending_delivery`, not_found → `needs_recipient_resolution`, ambiguous → `needs_recipient_disambiguation`); generates UUID with `od_` prefix; sets `createdAt`/`updatedAt`; stores via `OutboundDraftStore`; returns created `OutboundDraft`; throws on validation failures
- [x] T9 Create `apps/core/src/modules/outbound-draft/application/use-cases/index.ts` — barrel re-export
- [x] T10 Create `apps/core/src/modules/outbound-draft/application/index.ts` — barrel re-export
- [x] T11 Create `apps/core/src/modules/outbound-draft/index.ts` — top-level barrel re-export for domain, port, adapter, application

## Phase 4: Integration — extend result types & confirmation flow

- [x] T12 Modify `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` — add `PreparedOutbound` type with fields: `id`, `status` (OutboundDraftStatus), `recipientPersonId`, `recipientDisplayName`, `recipientChannel`, `recipientExternalId`, `messageText`, `deliveryReady` (boolean); add optional `preparedOutbound?: PreparedOutbound` field to `ChannelInboundResult`; import `OutboundDraftStatus` from outbound-draft domain
- [x] T13 Modify `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` — add `resolveOutboundRecipient`, `outboundDraftStore`, `createOutboundDraft` to `ProcessChannelInboundMessageDependencies` and constructor; in `handleConfirmingFlow` on `resolution.action === "confirm"`, after updating flow state, check preconditions per spec DR7.1 (draft exists, recipientHint non-empty trimmed, messageDraft non-empty trimmed, conversationId present, identity resolved, flow not paused); if all pass: call `resolveOutboundRecipient`, then `CreateOutboundDraftFromMediation.execute()`, build `PreparedOutbound` from result, attach to result via `preparedOutbound`; if preconditions fail: add warning, no draft created; on cancel/edit/risk: no draft created (existing behavior preserved)
- [x] T14 Update `buildFlowResult` in `process-channel-inbound-message.ts` — accept optional `preparedOutbound` parameter and attach to returned `ChannelInboundResult` when provided

## Phase 5: Bootstrap — wire dependencies

- [x] T15 Modify `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — import and instantiate `InMemoryOutboundDraftStore`, `resolveOutboundRecipient`, `CreateOutboundDraftFromMediation`; inject all three as new dependencies into `ProcessChannelInboundMessage` constructor call; export `outboundDraftStore` from factory return type so tests can access it

## Phase 6: Unit tests — outbound-draft module

- [x] T16 Create `apps/core/src/modules/outbound-draft/__tests__/outbound-draft.test.ts` — test valid `OutboundDraft` creation with all fields populated, `validateOutboundDraft` rejects empty `messageText`, rejects empty `recipientHint`, rejects missing `requesterPersonId`, rejects missing `conversationId`, accepts whitespace-only fields after trim check; use `node:test` + `assert/strict`
- [x] T17 Create `apps/core/src/modules/outbound-draft/__tests__/in-memory-outbound-draft-store.test.ts` — test `create` + `findById` round-trip, `findByConversationId` returns only matching drafts, `findPendingDelivery` returns only `confirmed_pending_delivery` drafts (excludes `delivered`/`cancelled`), `markDeliveryRequested` transitions to `delivery_requested`, `markDelivered` transitions to `delivered`, `markFailed` transitions to `failed`, `cancel` transitions to `cancelled`, each transition updates `updatedAt`
- [x] T18 Create `apps/core/src/modules/outbound-draft/__tests__/resolve-outbound-recipient.test.ts` — test `resolved` case (exact displayName match, case-insensitive), `not_found` case (no matching contact), `ambiguous` case (multiple contacts with same displayName), whitespace trimming of hint, channel extraction from WhatsApp binding
- [x] T19 Create `apps/core/src/modules/outbound-draft/__tests__/create-outbound-draft-from-mediation.test.ts` — test successful creation with resolved recipient (all fields populated, status `confirmed_pending_delivery`), creation with unknown recipient (status `needs_recipient_resolution`, null recipient fields), creation with ambiguous recipient (status `needs_recipient_disambiguation`), throws on null draft, throws on empty recipientHint, throws on empty messageDraft, throws on missing conversationId, draft stored in store, UUID has `od_` prefix

## Phase 7: Integration tests — T32+T34 combined scenarios

- [x] T20 Create `apps/core/src/modules/mediation-flow/__tests__/t34-integration.test.ts` (or extend existing mediation flow tests) — test spec scenarios S1-S10: (S1) confirm with known recipient → draft with `confirmed_pending_delivery` + `preparedOutbound.deliveryReady: true`, (S2) confirm with unknown recipient → draft with `needs_recipient_resolution` + `deliveryReady: false`, (S3) confirm with ambiguous recipient → draft with `needs_recipient_disambiguation`, (S4) cancel → no draft, no `preparedOutbound`, (S5) edit then confirm → draft with updated message, (S6) risk interrupt → no draft, flow paused, (S7) unknown sender → no confirming flow, no draft, (S8) empty messageText → warning, no draft, (S9) empty recipientHint → warning, no draft, (S10) voice device confirmation → draft created with channel "voice"

## Phase 8: Simulation API tests & docs

- [x] T21 Modify `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` — add assertions for `preparedOutbound` in confirmation scenarios (present with `deliveryReady: true` for known recipient, present with `deliveryReady: false` for unknown recipient); assert `preparedOutbound` absent in cancel, risk, unknown sender scenarios; verify existing `simulatedOutbound` behavior unchanged
- [x] T22 Modify `docs/simulation-api.md` — add `preparedOutbound` section documenting the new field in simulation response, its semantics (`deliveryReady`, status values), and an example request/response flow showing confirmation → draft creation

## Phase 9: Acceptance script (optional)

- [x] T23 Create `scripts/simulations/run-t34-outbound-draft-acceptance.ts` — standalone script using Simulation API with mock provider that exercises key scenarios: confirm with known recipient, confirm with unknown recipient, cancel, edit+confirm, risk interrupt; asserts expected `preparedOutbound` presence/absence and status values; exits 0 on all pass, non-zero on failure

## Phase 10: Validation & cleanup

- [x] T24 Run `npm run check` — TypeScript strict mode, no `any` types, all tests pass
- [x] T25 Verify no real WhatsApp/Evolution API/PostgreSQL calls in any new code (search for `evolution`, `whatsapp`, `pg`, `postgres` imports in outbound-draft module)
- [x] T26 Verify module isolation: `outbound-draft` imports only from `shared/`, `mediation-flow/domain` (read-only), and `contact-directory` — no imports from `channel-inbound`, `inbound-gate`, or `ai-guide`
- [x] T27 Create PR branch `feat/t34-outbound-draft-prepared-delivery`, commit all changes, push, and create PR #42 for Marco review
