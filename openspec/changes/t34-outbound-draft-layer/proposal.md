# Proposal: T34 — Outbound Draft Layer

## Intent

After T32, when a user confirms a mediation, Serena transitions the flow to "resolved" but produces **no formal outbound artifact**. There is no "this message was confirmed and is ready for future delivery" object. The future WhatsApp module will need a contract to consume. T34 fills this gap.

## Scope

### In Scope
- New `outbound-draft` module (domain, port, in-memory adapter, use case)
- `OutboundDraft` domain type with status lifecycle
- `RecipientResolution` type (resolved / not_found / ambiguous)
- `OutboundDraftStore` port + `InMemoryOutboundDraftStore` adapter
- `CreateOutboundDraftFromMediation` use case
- `preparedOutbound` field added to `ChannelInboundResult`
- Integration: `handleConfirmingFlow` populates `preparedOutbound` on positive confirmation
- `ResolveContact` injected into `ProcessChannelInboundMessage`
- Unit tests for new types, store, use case, and integration

### Out of Scope
- Real WhatsApp/Evolution API integration
- PostgreSQL persistence adapter
- Delivery worker or queue
- Auto-sending confirmed drafts
- Italian localization
- Full outbound-draft module with persistent store (deferred)

## Capabilities

### New Capabilities
- `outbound-draft`: Domain type, store port, in-memory adapter, and creation use case for confirmed mediation drafts pending future delivery.

### Modified Capabilities
- `mediation-flow`: Confirmation path now produces a `preparedOutbound` result alongside flow state transition.
- `channel-inbound-pipeline`: `ProcessChannelInboundMessage` gains `resolveContact` dependency and populates `preparedOutbound` on confirmation.

## Approach

1. **Domain**: `OutboundDraft` type with fields: `id`, `conversationId`, `draftId`, `recipientHint`, `messageText`, `toExternalId` (optional), `recipientResolution` (resolved | not_found | ambiguous), `status` (confirmed | pending_approval | ready), `createdAt`, `resolvedAt`.
2. **Port**: `OutboundDraftStore` interface with `save(draft)` and `findById(id)`.
3. **Adapter**: `InMemoryOutboundDraftStore` using `Map<string, OutboundDraft>`.
4. **Use case**: `CreateOutboundDraftFromMediation` — accepts `MediationFlowState` + `RecipientResolution`, returns `OutboundDraft`.
5. **Integration**: `handleConfirmingFlow` calls `ResolveContact` with `draft.recipientHint`, maps result to `RecipientResolution`, calls `CreateOutboundDraftFromMediation`, stores via `OutboundDraftStore`, and returns `preparedOutbound` in `ChannelInboundResult`.
6. **Result**: `ChannelInboundResult.preparedOutbound` mirrors the `SimulatedOutbound` shape but is populated only on confirmed mediation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/outbound-draft/` | New | Full module: domain, port, adapter, use case, tests |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add `preparedOutbound?: PreparedOutbound` field |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modified | Inject `resolveContact` + `outboundDraftStore`, populate `preparedOutbound` in `handleConfirmingFlow` |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire `ResolveContact`, `OutboundDraftStore`, `CreateOutboundDraftFromMediation` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `ResolveContact` exact-match fails for fuzzy names | Medium | Use `not_found` resolution; draft still created without `toExternalId` |
| Cross-module import violations | Low | Keep `outbound-draft` module clean — only imports from shared/types |
| `handleConfirmingFlow` becomes too complex | Low | Extract recipient resolution + draft creation into small pure helpers |

## Rollback Plan

Revert the change branch. The `preparedOutbound` field is optional in `ChannelInboundResult`, so existing consumers are unaffected. No data migration needed (in-memory only).

## Dependencies

- T32 (mediation flow state) — must be merged first
- T33 (channel-aware identity) — must be merged first

## Success Criteria

- [ ] `outbound-draft` module compiles with TypeScript strict mode
- [ ] `handleConfirmingFlow` returns `preparedOutbound` with `toExternalId` when contact resolves
- [ ] `handleConfirmingFlow` returns `preparedOutbound` without `toExternalId` when contact not found
- [ ] `ChannelInboundResult` includes `preparedOutbound` only on positive confirmation
- [ ] All new types, store, use case have unit tests
- [ ] `npm run check` passes with zero errors
- [ ] No real WhatsApp/Evolution/PostgreSQL calls
