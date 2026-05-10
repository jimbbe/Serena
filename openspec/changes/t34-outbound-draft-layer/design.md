# Design: T34 — Outbound Draft Layer

## Technical Approach

Add a small `outbound-draft` module that turns a confirmed `mediation-flow` draft into a stored, non-sent outbound artifact. The channel inbound coordinator remains the integration point: `ProcessChannelInboundMessage.handleConfirmingFlow()` already owns the positive confirmation transition, so it will resolve the recipient hint, create the draft, store it in-memory, and expose a compact `preparedOutbound` projection in `ChannelInboundResult`.

No delivery side effects are introduced: no WhatsApp, queue, worker, PostgreSQL, or Evolution API.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Module boundary | Create `apps/core/src/modules/outbound-draft/` with `domain`, `port`, `adapter`, `application`, `__tests__` | Extend `mediation-flow` or `whatsapp-gateway` | A confirmed draft is an outbound preparation concern, not flow state and not gateway delivery. Keeps hexagonal boundaries clear. |
| Draft lifecycle | Use explicit `OutboundDraftStatus` union, initial status derived from recipient resolution | Boolean `readyToSend` only | Future delivery/retry states are already known; a status union is safer than widening booleans later. |
| Recipient resolution | Use existing `ResolveContact` exact display-name matching, then extract WhatsApp binding | Add fuzzy matching now | Existing contact module already owns contact lookup. Fuzzy/disambiguation is product-sensitive and stays future work. |
| Storage | `OutboundDraftStore` port with in-memory `Map` adapter | Persist in PostgreSQL | Current repo convention is in-memory for MVP state; PostgreSQL is explicitly out of scope. |
| Result contract | Add optional `preparedOutbound` projection to `ChannelInboundResult` | Return full `OutboundDraft` | The inbound result should expose delivery-relevant facts without leaking full lifecycle/audit fields. |

## Data Flow

```text
User confirms mediation
  -> ProcessChannelInboundMessage.handleConfirmingFlow()
  -> mediationFlowStore.updateFlow(resolved/confirmed)
  -> resolveOutboundRecipient(ResolveContact, recipientHint)
  -> CreateOutboundDraftFromMediation
  -> OutboundDraftStore.save()
  -> ChannelInboundResult.preparedOutbound
```

If no contact is found, a draft is still stored with `needs_recipient_resolution` and `deliveryReady: false`. Future ambiguous results map to `needs_recipient_disambiguation`.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/core/src/modules/outbound-draft/domain/outbound-draft.ts` | Create | `OutboundDraft`, `OutboundDraftStatus`, creation validation helpers. |
| `apps/core/src/modules/outbound-draft/port/outbound-draft-store.ts` | Create | Store port: `save`, `findById`, optional `findByConversationId`. |
| `apps/core/src/modules/outbound-draft/adapter/in-memory-outbound-draft-store.ts` | Create | In-memory `Map<string, OutboundDraft>` adapter. |
| `apps/core/src/modules/outbound-draft/application/resolve-outbound-recipient.ts` | Create | Helper using `ResolveContact`; extracts `externalBindings[channel="whatsapp"]` before fallback `whatsappId`. |
| `apps/core/src/modules/outbound-draft/application/create-outbound-draft-from-mediation.ts` | Create | Use case creating `od_${crypto.randomUUID()}` draft from confirmed flow draft. |
| `apps/core/src/modules/outbound-draft/__tests__/*.test.ts` | Create | Domain, store, recipient resolution and use-case tests with `node:test`. |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modify | Add `PreparedOutbound` type and optional `preparedOutbound`. |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modify | Inject `ResolveContact`/draft creator or store dependency; populate `preparedOutbound` only on positive confirmation. |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Instantiate and return shared `InMemoryOutboundDraftStore`; wire dependencies. |

## Interfaces / Contracts

```ts
export type PreparedOutbound = {
  id: string;
  status: OutboundDraftStatus;
  recipientPersonId: string | null;
  recipientDisplayName: string | null;
  recipientChannel: InboundChannel | null;
  recipientExternalId: string | null;
  messageText: string;
  deliveryReady: boolean;
};
```

`deliveryReady` is true only when status is `confirmed_pending_delivery` and `recipientExternalId !== null`.

`OutboundDraft.source` is fixed to `"mediation_flow"`; `sourceFlowConversationId` is the flow conversation id; `sourceDraftId` is the `MediationDraft.id`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/domain | Required fields, status derivation, ID prefix expectations | `node:test` + `assert/strict`. |
| Adapter | Save/find immutability enough for current pattern | In-memory store tests. |
| Application | Resolved/not-found recipient mapping; draft creation timestamps and projection | Fake `ResolveContact`, fake clock/generator where practical. |
| Integration | Confirming flow returns `preparedOutbound`; cancel/edit/unknown do not | Existing channel inbound flow tests, no external services. |

## Migration / Rollout

No migration required. The new field is optional and storage is process-local in-memory.

## Open Questions

- [ ] Future fuzzy/ambiguous contact matching remains unresolved; T34 only reserves the status.
