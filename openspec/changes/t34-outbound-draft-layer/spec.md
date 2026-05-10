# Spec: T34 — Outbound Draft Layer

## Purpose

When a mediation is confirmed, Serena currently transitions the flow to `resolved` but produces **no formal outbound artifact**. There is no object that represents "this message was confirmed and is ready for future delivery." The future WhatsApp module will need a contract to consume. T34 fills this gap by introducing an `OutboundDraft` domain type, a store port with in-memory adapter, a creation use case, and integration into the confirmation flow via `preparedOutbound` in `ChannelInboundResult`.

This spec adds a new capability (`outbound-draft`) and modifies `mediation-flow` and `channel-inbound-pipeline` without changing existing behavior for non-confirmation paths.

---

## Delta Requirements

### DR1 — OutboundDraft Domain Type (MUST)

The system MUST define an `OutboundDraft` domain type that represents a confirmed mediation message pending future delivery.

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (UUID) |
| `conversationId` | `string` | Conversation where the draft was confirmed |
| `draftId` | `string` | Reference to the originating `MediationDraft.id` |
| `recipientHint` | `string` | The recipient name as provided by the user (non-empty) |
| `messageText` | `string` | The confirmed message text (non-empty) |
| `requesterPersonId` | `string` | The person who requested the mediation |
| `recipientPersonId` | `string \| null` | Resolved recipient personId, or null if not resolved |
| `recipientDisplayName` | `string \| null` | Resolved recipient display name, or null |
| `recipientChannel` | `InboundChannel \| null` | Channel through which the recipient would be contacted |
| `recipientExternalId` | `string \| null` | Resolved external ID for delivery, or null |
| `recipientResolution` | `RecipientResolution` | Resolution outcome (resolved / not_found / ambiguous) |
| `status` | `OutboundDraftStatus` | Current lifecycle status |
| `createdAt` | `Date` | When the draft was created |
| `updatedAt` | `Date` | Last status change timestamp |

**Validation rules**:
- `messageText` MUST be non-empty (trimmed length > 0)
- `requesterPersonId` MUST be present
- `conversationId` MUST be present
- `recipientHint` MUST be present (non-empty, trimmed length > 0)

#### Scenario: valid OutboundDraft created

- GIVEN a confirmed mediation with recipient "Carlos" and message "que llego tarde"
- AND the recipient resolves to personId "carlos_001", externalId "5491111111111"
- WHEN an `OutboundDraft` is created
- THEN all required fields are populated
- AND `status` is `"confirmed_pending_delivery"`
- AND `recipientResolution` is `"resolved"`

### DR2 — OutboundDraftStatus Enum (MUST)

The `OutboundDraftStatus` type MUST be a union of the following literal values:

| Status | Description |
|--------|-------------|
| `"confirmed_pending_delivery"` | Initial status — confirmed, recipient resolved, awaiting delivery worker |
| `"needs_recipient_resolution"` | Confirmed but recipient hint did not match any contact |
| `"needs_recipient_disambiguation"` | Confirmed but recipient hint matched multiple contacts |
| `"cancelled"` | User cancelled the mediation after draft was created |
| `"delivery_requested"` | Delivery worker has picked up the draft |
| `"delivered"` | Message was successfully delivered |
| `"failed"` | Delivery attempt failed |

**Status transitions**:

```
confirmed_pending_delivery ──→ delivery_requested ──→ delivered
                              │                        │
                              │                        └──→ failed
                              │
needs_recipient_resolution ──→ (manual resolution) ──→ confirmed_pending_delivery
needs_recipient_disambiguation ──→ (disambiguation) ──→ confirmed_pending_delivery

[Any status] ──→ cancelled
```

#### Scenario: initial status on resolved recipient

- GIVEN a confirmed mediation where recipient resolves to exactly one contact
- WHEN the `OutboundDraft` is created
- THEN `status` is `"confirmed_pending_delivery"`

#### Scenario: initial status on unknown recipient

- GIVEN a confirmed mediation where recipient hint matches no contact
- WHEN the `OutboundDraft` is created
- THEN `status` is `"needs_recipient_resolution"`

#### Scenario: initial status on ambiguous recipient

- GIVEN a confirmed mediation where recipient hint matches multiple contacts
- WHEN the `OutboundDraft` is created
- THEN `status` is `"needs_recipient_disambiguation"`

### DR3 — RecipientResolution Type (MUST)

The `RecipientResolution` type MUST be a discriminated union representing the outcome of resolving a recipient hint against the contact directory.

**Variants**:

```typescript
type RecipientResolution =
  | { type: "resolved"; personId: string; displayName: string; channel: InboundChannel; externalId: string }
  | { type: "not_found"; hint: string }
  | { type: "ambiguous"; hint: string; candidates: Array<{ personId: string; displayName: string; channel: InboundChannel; externalId: string }> };
```

#### Scenario: exact match resolves

- GIVEN a contact with displayName "Carlos" exists in the directory
- WHEN `ResolveContact` is called with displayName "Carlos"
- THEN the resolution is `{ type: "resolved", personId, displayName: "Carlos", channel, externalId }`

#### Scenario: no match returns not_found

- GIVEN no contact with displayName "UnknownPerson" exists
- WHEN resolution is attempted for "UnknownPerson"
- THEN the resolution is `{ type: "not_found", hint: "UnknownPerson" }`

#### Scenario: multiple matches returns ambiguous

- GIVEN two contacts with displayName "Carlos" exist in the directory
- WHEN resolution is attempted for "Carlos"
- THEN the resolution is `{ type: "ambiguous", hint: "Carlos", candidates: [...] }`

### DR4 — OutboundDraftStore Port (MUST)

The system MUST define an `OutboundDraftStore` port (type alias following existing port convention) with the following operations:

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `(draft: OutboundDraft) => Promise<OutboundDraft>` | Persist a new draft |
| `findById` | `(id: string) => Promise<OutboundDraft \| undefined>` | Retrieve by ID |
| `findByConversationId` | `(conversationId: string) => Promise<OutboundDraft[]>` | All drafts for a conversation |
| `findPendingDelivery` | `() => Promise<OutboundDraft[]>` | All drafts with status `confirmed_pending_delivery` |
| `markDeliveryRequested` | `(id: string) => Promise<OutboundDraft>` | Transition to `delivery_requested` |
| `markDelivered` | `(id: string) => Promise<OutboundDraft>` | Transition to `delivered` |
| `markFailed` | `(id: string, reason?: string) => Promise<OutboundDraft>` | Transition to `failed` |
| `cancel` | `(id: string) => Promise<OutboundDraft>` | Transition to `cancelled` |

All methods MUST return `Promise<OutboundDraft>` (or `Promise<OutboundDraft[]>` for list operations).

#### Scenario: store creates and retrieves draft

- GIVEN an empty `OutboundDraftStore`
- WHEN `create(draft)` is called with a valid draft
- THEN the draft is stored
- AND `findById(draft.id)` returns the same draft

#### Scenario: findPendingDelivery returns only pending drafts

- GIVEN two drafts: one with status `confirmed_pending_delivery` and one with status `delivered`
- WHEN `findPendingDelivery()` is called
- THEN only the pending draft is returned

### DR5 — InMemoryOutboundDraftStore Adapter (MUST)

The system MUST provide an `InMemoryOutboundDraftStore` adapter that implements `OutboundDraftStore` using an in-memory `Map<string, OutboundDraft>`.

**Constraints**:
- No persistence to disk or database
- No network calls
- All operations are synchronous internally but return `Promise` for interface compatibility
- Thread-safe within a single Node.js process (no concurrency concerns)

#### Scenario: in-memory store supports all operations

- GIVEN an `InMemoryOutboundDraftStore`
- WHEN a draft is created, then found by ID, then cancelled
- THEN the draft status changes to `"cancelled"`
- AND `findPendingDelivery()` no longer includes it

### DR6 — CreateOutboundDraftFromMediation Use Case (MUST)

The system MUST provide a `CreateOutboundDraftFromMediation` use case that transforms a confirmed `MediationFlowState` into an `OutboundDraft`.

**Input**:
- `flowState: MediationFlowState` — the confirmed flow state
- `identity: ResolvedInboundActor` — the resolved sender identity
- `recipientResolution: RecipientResolution` — the result of resolving the recipient hint

**Behavior**:
1. Validates that `flowState.draft` is not null
2. Validates that `draft.recipientHint` is non-empty
3. Validates that `draft.messageDraft` is non-empty
4. Validates that `flowState.conversationId` is present
5. Maps `RecipientResolution` to draft fields:
   - `resolved` → `recipientPersonId`, `recipientDisplayName`, `recipientChannel`, `recipientExternalId` populated; `status: "confirmed_pending_delivery"`
   - `not_found` → all recipient fields null; `status: "needs_recipient_resolution"`
   - `ambiguous` → all recipient fields null; `status: "needs_recipient_disambiguation"`
6. Generates a new UUID for `OutboundDraft.id`
7. Copies `draft.id` to `OutboundDraft.draftId`
8. Sets `createdAt` and `updatedAt` to current time
9. Stores the draft via `OutboundDraftStore`
10. Returns the created `OutboundDraft`

**Error conditions** — the use case MUST throw if:
- `flowState.draft` is null
- `draft.recipientHint` is null or empty
- `draft.messageDraft` is null or empty
- `flowState.conversationId` is missing

#### Scenario: use case creates draft with resolved recipient

- GIVEN a flow state with `status: "resolved"`, draft with recipientHint "Carlos" and messageDraft "que llego tarde"
- AND recipient resolution returns `{ type: "resolved", personId: "carlos_001", displayName: "Carlos", channel: "whatsapp", externalId: "5491111111111" }`
- WHEN `CreateOutboundDraftFromMediation.execute()` is called
- THEN an `OutboundDraft` is created with:
  - `recipientPersonId: "carlos_001"`
  - `recipientDisplayName: "Carlos"`
  - `recipientChannel: "whatsapp"`
  - `recipientExternalId: "5491111111111"`
  - `status: "confirmed_pending_delivery"`
  - `recipientResolution: { type: "resolved", ... }`
- AND the draft is stored in `OutboundDraftStore`

#### Scenario: use case creates draft with unknown recipient

- GIVEN a flow state with confirmed draft
- AND recipient resolution returns `{ type: "not_found", hint: "UnknownPerson" }`
- WHEN `CreateOutboundDraftFromMediation.execute()` is called
- THEN an `OutboundDraft` is created with:
  - `recipientPersonId: null`
  - `recipientExternalId: null`
  - `status: "needs_recipient_resolution"`

#### Scenario: use case rejects empty message

- GIVEN a flow state with draft where `messageDraft` is null
- WHEN `CreateOutboundDraftFromMediation.execute()` is called
- THEN the use case throws an error
- AND no draft is created

#### Scenario: use case rejects empty recipient hint

- GIVEN a flow state with draft where `recipientHint` is null
- WHEN `CreateOutboundDraftFromMediation.execute()` is called
- THEN the use case throws an error
- AND no draft is created

### DR7 — Integration with Confirmation Flow (MUST)

The `handleConfirmingFlow` method in `ProcessChannelInboundMessage` MUST be extended to create an `OutboundDraft` when a mediation is positively confirmed.

**Dependencies added to `ProcessChannelInboundMessage`**:
- `resolveContact: ResolveContact` — for recipient resolution
- `outboundDraftStore: OutboundDraftStore` — for draft persistence
- `createOutboundDraft: CreateOutboundDraftFromMediation` — for draft creation

**On positive confirmation** (`resolution.action === "confirm"`), the system MUST:
1. Check all preconditions (see DR7.1)
2. If preconditions pass:
   a. Resolve the recipient hint via `ResolveContact.execute({ displayName: draft.recipientHint })`
   b. Map the result to `RecipientResolution`:
      - Contact found → `{ type: "resolved", ... }` with channel derived from contact bindings
      - Contact not found → `{ type: "not_found", hint }`
      - Multiple contacts match → `{ type: "ambiguous", hint, candidates }`
   c. Call `CreateOutboundDraftFromMediation.execute({ flowState, identity, recipientResolution })`
   d. Store the draft via `OutboundDraftStore`
   e. Build `PreparedOutbound` from the `OutboundDraft`
   f. Return `preparedOutbound` in `ChannelInboundResult`
3. If any precondition fails:
   - Do NOT create an `OutboundDraft`
   - Return `ChannelInboundResult` WITHOUT `preparedOutbound`
   - The flow still transitions to `resolved` with appropriate `promptText`

#### DR7.1 — Confirmation Preconditions (MUST)

An `OutboundDraft` MUST be created on confirmation ONLY when ALL of the following are true:

| # | Precondition | Action if false |
|---|-------------|-----------------|
| 1 | `flowState.draft` is not null | No draft created |
| 2 | `draft.recipientHint` is non-empty (trimmed) | No draft created, add warning |
| 3 | `draft.messageDraft` is non-empty (trimmed) | No draft created, add warning |
| 4 | `flowState.conversationId` is present | No draft created |
| 5 | `identity.status === "resolved"` | No draft created (should not reach confirming state) |
| 6 | `flowState.status !== "paused"` | No draft created (risk interrupt) |

An `OutboundDraft` MUST NOT be created when:
- The user cancels the mediation (`resolution.action === "cancel"`)
- The user edits the draft (`resolution.action === "edit"`) — draft creation deferred until confirmation
- The flow is paused due to risk
- The identity is unknown or blocked
- Any validation error occurs

#### Scenario: confirm with known recipient creates draft

- GIVEN an active confirming flow with draft: recipientHint "Carlos", messageDraft "que llego tarde"
- AND identity resolved as elder
- AND "Carlos" exists in the contact directory
- WHEN the user sends "sí, mandalo"
- THEN an `OutboundDraft` is created with `status: "confirmed_pending_delivery"`
- AND `preparedOutbound` is populated in the result
- AND `promptText` confirms the message is prepared for future delivery

#### Scenario: confirm with unknown recipient creates draft with needs_resolution

- GIVEN an active confirming flow with draft: recipientHint "UnknownPerson", messageDraft "que llego tarde"
- AND identity resolved as elder
- AND "UnknownPerson" does NOT exist in the contact directory
- WHEN the user sends "sí"
- THEN an `OutboundDraft` is created with `status: "needs_recipient_resolution"`
- AND `preparedOutbound` is populated with `recipientPersonId: null`
- AND `promptText` indicates the message is prepared but recipient needs resolution

#### Scenario: cancel mediation does NOT create draft

- GIVEN an active confirming flow with draft
- WHEN the user sends "mejor no"
- THEN the flow transitions to `resolved` with `confirmationState: "cancelled"`
- AND NO `OutboundDraft` is created
- AND `preparedOutbound` is NOT in the result

#### Scenario: edit then confirm creates draft with updated message

- GIVEN an active confirming flow with draft: messageDraft "que llego tarde"
- WHEN the user sends "cambiá el mensaje, decile que voy mañana"
- THEN the draft is updated with `messageDraft: "que voy mañana"`
- AND the flow stays in `confirming`
- AND NO `OutboundDraft` is created yet

- WHEN the user then sends "sí, confirmo"
- THEN an `OutboundDraft` is created with the UPDATED message "que voy mañana"
- AND `preparedOutbound` is populated

#### Scenario: risk interrupt does NOT create draft

- GIVEN an active confirming flow with draft
- AND a risk signal is detected in the user input
- WHEN the pipeline processes the message
- THEN the flow is paused
- AND NO `OutboundDraft` is created
- AND `preparedOutbound` is NOT in the result

#### Scenario: unknown sender does NOT enter confirming flow

- GIVEN an unknown sender on any channel
- WHEN the message enters the pipeline
- THEN the sender is NOT authorized for sensitive flows
- AND NO confirming flow is entered
- AND NO `OutboundDraft` is created

#### Scenario: empty messageText validation error

- GIVEN an active confirming flow with draft where `messageDraft` is null or empty
- WHEN the user sends "sí"
- THEN NO `OutboundDraft` is created
- AND a warning is added to the result
- AND the flow still transitions to `resolved`

#### Scenario: empty recipientHint validation error

- GIVEN an active confirming flow with draft where `recipientHint` is null or empty
- WHEN the user sends "sí"
- THEN NO `OutboundDraft` is created
- AND a warning is added to the result
- AND the flow still transitions to `resolved`

#### Scenario: local voice device confirmation creates draft

- GIVEN a voice message from `serena_device_001` resolves to elder
- AND an active confirming flow exists with valid draft
- WHEN the user confirms via voice device
- THEN an `OutboundDraft` is created
- AND `preparedOutbound` is populated
- AND the channel in the result is `"voice"`

### DR8 — ChannelInboundResult Extension (MUST)

The `ChannelInboundResult` type MUST be extended with an optional `preparedOutbound` field.

**Type definition**:

```typescript
type PreparedOutbound = {
  readonly id: string;
  readonly status: OutboundDraftStatus;
  readonly recipientPersonId: string | null;
  readonly recipientDisplayName: string | null;
  readonly recipientChannel: InboundChannel | null;
  readonly recipientExternalId: string | null;
  readonly messageText: string;
  readonly deliveryReady: boolean;
};
```

**Field**: `preparedOutbound?: PreparedOutbound`

**Semantics**:
- `deliveryReady` is `true` when `status === "confirmed_pending_delivery"` (recipient resolved)
- `deliveryReady` is `false` when status is `needs_recipient_resolution` or `needs_recipient_disambiguation`
- `preparedOutbound` is populated ONLY on positive confirmation with a valid draft
- `preparedOutbound` is NOT populated on cancellation, edit, risk interrupt, or validation failure
- The existing `simulatedOutbound` field is preserved and independent — it is used for simulation scenarios, not for confirmed mediation flows

#### Scenario: preparedOutbound populated on confirmed mediation

- GIVEN a confirmed mediation with resolved recipient
- WHEN `ChannelInboundResult` is returned
- THEN `preparedOutbound` is defined
- AND `preparedOutbound.deliveryReady` is `true`
- AND `preparedOutbound.status` is `"confirmed_pending_delivery"`

#### Scenario: preparedOutbound NOT populated on cancellation

- GIVEN a cancelled mediation
- WHEN `ChannelInboundResult` is returned
- THEN `preparedOutbound` is undefined

### DR9 — Module Structure (MUST)

The `outbound-draft` module MUST follow the existing hexagonal architecture pattern:

```
apps/core/src/modules/outbound-draft/
├── domain/
│   ├── outbound-draft.ts          # OutboundDraft type, OutboundDraftStatus, RecipientResolution
│   └── index.ts                   # Re-exports
├── port/
│   ├── outbound-draft-store.ts    # OutboundDraftStore port (type alias)
│   └── index.ts
├── adapter/
│   ├── in-memory-outbound-draft-store.ts  # InMemoryOutboundDraftStore
│   └── index.ts
├── application/
│   ├── use-cases/
│   │   ├── create-outbound-draft-from-mediation.ts  # CreateOutboundDraftFromMediation
│   │   └── index.ts
│   └── index.ts
├── __tests__/
│   ├── outbound-draft-store.test.ts
│   ├── create-outbound-draft-from-mediation.test.ts
│   └── recipient-resolution.test.ts
└── index.ts
```

**Module isolation rules**:
- `outbound-draft/domain` MUST NOT import from other module domains
- `outbound-draft` MAY import from `shared/` types (e.g., `InboundChannel`)
- `outbound-draft` MAY import from `mediation-flow/domain` for `MediationFlowState` type (read-only reference)
- `outbound-draft` MAY import from `contact-directory` for `ResolveContact` and `Contact` types
- `outbound-draft` MUST NOT import from `channel-inbound`, `inbound-gate`, or `ai-guide`

### DR10 — Bootstrap Wiring (MUST)

The `createInMemoryPipeline` factory MUST wire the new dependencies:

1. Create `InMemoryOutboundDraftStore`
2. Create `CreateOutboundDraftFromMediation` with the store
3. Inject `resolveContact`, `outboundDraftStore`, and `createOutboundDraft` into `ProcessChannelInboundMessage`

#### Scenario: pipeline wires outbound draft dependencies

- GIVEN `createInMemoryPipeline()` is called
- WHEN the returned `processChannelInboundMessage` is used
- THEN it has access to `ResolveContact`, `OutboundDraftStore`, and `CreateOutboundDraftFromMediation`
- AND confirmation of a mediation produces a `preparedOutbound` in the result

---

## Non-Scope (Explicit)

The following are explicitly OUT OF SCOPE for T34:

| Item | Reason |
|------|--------|
| Real WhatsApp / Evolution API integration | Infrastructure, deferred |
| PostgreSQL persistence adapter for OutboundDraft | Persistence layer, deferred |
| Delivery worker or queue | Outbound delivery, deferred |
| Auto-sending confirmed drafts | Sending logic, deferred |
| Italian localization | Not needed for MVP |
| Recipient disambiguation UI/flow | User interaction, deferred |
| Manual recipient resolution API | Admin feature, deferred |
| Draft expiry / timeout | Lifecycle management, deferred |
| Bulk draft operations | Not needed for MVP |
| Changes to existing `simulatedOutbound` behavior | Independent field, preserved |

---

## Affected Specifications

| Spec | Change Type | Description |
|------|-------------|-------------|
| `outbound-draft` (new) | New | Domain type, store port, in-memory adapter, creation use case, recipient resolution |
| `mediation-flow` | Modified | Confirmation path produces `OutboundDraft` alongside flow state transition |
| `channel-inbound-pipeline` | Modified | `ProcessChannelInboundMessage` gains `resolveContact` and `outboundDraftStore` dependencies |

---

## Affected Code Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/outbound-draft/` | New | Full module: domain, port, adapter, use case, tests |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add `preparedOutbound?: PreparedOutbound` field |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modified | Inject `resolveContact`, `outboundDraftStore`, `createOutboundDraft`; extend `handleConfirmingFlow` |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire `InMemoryOutboundDraftStore`, `ResolveContact`, `CreateOutboundDraftFromMediation` |

---

## Acceptance Criteria

### AC1 — OutboundDraft created on confirmed mediation with known recipient
```
Given: Active confirming flow with draft (recipientHint: "Carlos", messageDraft: "que llego tarde")
And: "Carlos" exists in contact directory
When: User confirms with "sí"
Then: OutboundDraft created with status "confirmed_pending_delivery"
And: preparedOutbound populated in ChannelInboundResult
And: preparedOutbound.deliveryReady === true
And: preparedOutbound.recipientExternalId matches Carlos's binding
```

### AC2 — OutboundDraft created with needs_recipient_resolution for unknown recipient
```
Given: Active confirming flow with draft (recipientHint: "UnknownPerson")
And: "UnknownPerson" does NOT exist in contact directory
When: User confirms with "sí"
Then: OutboundDraft created with status "needs_recipient_resolution"
And: preparedOutbound populated with recipientPersonId === null
And: preparedOutbound.deliveryReady === false
```

### AC3 — No OutboundDraft on cancellation
```
Given: Active confirming flow with draft
When: User cancels with "mejor no"
Then: No OutboundDraft created
And: preparedOutbound is undefined in result
And: flow transitions to resolved with cancelled state
```

### AC4 — No OutboundDraft on edit (deferred until confirmation)
```
Given: Active confirming flow with draft
When: User edits with "cambiá el mensaje, decile que voy mañana"
Then: No OutboundDraft created
And: draft.messageDraft updated to "que voy mañana"
And: flow stays in confirming state
```

### AC5 — OutboundDraft created after edit-then-confirm with updated message
```
Given: Active confirming flow with draft (messageDraft: "que llego tarde")
When: User edits with "cambiá el mensaje, decile que voy mañana"
And: User then confirms with "sí"
Then: OutboundDraft created with messageText "que voy mañana"
And: preparedOutbound populated
```

### AC6 — No OutboundDraft on risk interrupt
```
Given: Active confirming flow with draft
When: User sends message with risk signal
Then: Flow paused
And: No OutboundDraft created
And: preparedOutbound is undefined
```

### AC7 — No OutboundDraft for unknown sender
```
Given: Unknown sender on any channel
When: Message enters pipeline
Then: No confirming flow entered
And: No OutboundDraft created
```

### AC8 — Validation: empty messageText prevents draft creation
```
Given: Active confirming flow with draft where messageDraft is null
When: User confirms with "sí"
Then: No OutboundDraft created
And: Warning added to result
And: flow still transitions to resolved
```

### AC9 — Validation: empty recipientHint prevents draft creation
```
Given: Active confirming flow with draft where recipientHint is null
When: User confirms with "sí"
Then: No OutboundDraft created
And: Warning added to result
And: flow still transitions to resolved
```

### AC10 — Local voice device confirmation creates OutboundDraft
```
Given: Voice message from serena_device_001 resolves to elder
And: Active confirming flow with valid draft
When: User confirms via voice device
Then: OutboundDraft created
And: preparedOutbound populated
And: ChannelInboundResult.channel === "voice"
```

### AC11 — OutboundDraft module compiles with TypeScript strict mode
```
When: npm run check
Then: No TypeScript errors in outbound-draft module
And: No `any` types used
```

### AC12 — All new types, store, and use case have unit tests
```
When: npm run check
Then: All tests in outbound-draft/__tests__/ pass
And: Test coverage > 90% for outbound-draft module
```

### AC13 — All existing tests pass without regression
```
When: npm run check
Then: All existing tests pass
And: No modifications needed to existing test files (only new test additions)
```

### AC14 — No real WhatsApp/Evolution/PostgreSQL calls
```
All scenarios
Expected: System operates entirely in-memory
And: No network requests to WhatsApp API, Evolution API, or PostgreSQL
```

---

## Acceptance Criteria as Testable Scenarios

### S1 — Confirm mediation with known recipient → OutboundDraft with confirmed_pending_delivery
```
Given: Active confirming flow
  - status: "confirming"
  - draft: { recipientHint: "Carlos", messageDraft: "que llego tarde" }
And: Contact "Carlos" exists with whatsappId "5491111111111"
When: User sends "sí, mandalo"
Then: OutboundDraft created with:
  - status: "confirmed_pending_delivery"
  - recipientPersonId: Carlos's personId
  - recipientExternalId: "5491111111111"
  - recipientChannel: "whatsapp"
  - messageText: "que llego tarde"
And: preparedOutbound in result with deliveryReady: true
```

### S2 — Confirm mediation with unknown recipient → OutboundDraft with needs_recipient_resolution
```
Given: Active confirming flow
  - status: "confirming"
  - draft: { recipientHint: "Desconocido", messageDraft: "hola" }
And: No contact named "Desconocido" exists
When: User sends "sí"
Then: OutboundDraft created with:
  - status: "needs_recipient_resolution"
  - recipientPersonId: null
  - recipientExternalId: null
And: preparedOutbound in result with deliveryReady: false
```

### S3 — Confirm mediation with ambiguous recipient → OutboundDraft with needs_recipient_disambiguation
```
Given: Active confirming flow
  - status: "confirming"
  - draft: { recipientHint: "Carlos", messageDraft: "hola" }
And: Two contacts exist with displayName "Carlos"
When: User sends "confirmo"
Then: OutboundDraft created with:
  - status: "needs_recipient_disambiguation"
  - recipientPersonId: null
  - recipientExternalId: null
And: preparedOutbound in result with deliveryReady: false
```

### S4 — Cancel mediation → no OutboundDraft
```
Given: Active confirming flow with valid draft
When: User sends "mejor no"
Then: Flow transitions to resolved (cancelled)
And: No OutboundDraft created
And: preparedOutbound undefined in result
```

### S5 — Edit then confirm → OutboundDraft with updated message
```
Given: Active confirming flow
  - draft: { recipientHint: "Carlos", messageDraft: "que llego tarde", version: 1 }
When: User sends "cambiá el mensaje, decile que voy mañana"
Then: Draft updated: messageDraft = "que voy mañana", version = 2
And: No OutboundDraft created yet
And: Flow stays in confirming

When: User then sends "sí, confirmo"
Then: OutboundDraft created with messageText = "que voy mañana"
And: preparedOutbound populated with deliveryReady: true
```

### S6 — Risk interrupt → no OutboundDraft
```
Given: Active confirming flow with valid draft
When: User sends "me caí y no puedo levantarme" (risk signal)
Then: Flow transitions to paused
And: No OutboundDraft created
And: preparedOutbound undefined in result
```

### S7 — Unknown sender → no OutboundDraft, no flow
```
Given: Unknown sender on WhatsApp (no identity entry)
When: Message enters pipeline
Then: Identity resolves to "unknown"
And: No confirming flow entered
And: No OutboundDraft created
```

### S8 — Empty messageText → validation error, no draft
```
Given: Active confirming flow
  - draft: { recipientHint: "Carlos", messageDraft: null }
When: User sends "sí"
Then: No OutboundDraft created
And: Warning in result: "Cannot create outbound draft: message text is empty"
And: Flow transitions to resolved
```

### S9 — Empty recipientHint → validation error, no draft
```
Given: Active confirming flow
  - draft: { recipientHint: null, messageDraft: "que llego tarde" }
When: User sends "sí"
Then: No OutboundDraft created
And: Warning in result: "Cannot create outbound draft: recipient hint is empty"
And: Flow transitions to resolved
```

### S10 — Local voice device confirmation → OutboundDraft created
```
Given: Voice message from serena_device_001
And: Identity resolves to elder (Marta)
And: Active confirming flow with valid draft
When: User confirms via voice device
Then: OutboundDraft created with status "confirmed_pending_delivery"
And: preparedOutbound populated
And: ChannelInboundResult.channel === "voice"
```

---

## Edge Cases

### E1 — Recipient hint with extra whitespace
If `recipientHint` is `"  Carlos  "`, the system MUST trim it before resolution. The trimmed value `"Carlos"` is used for lookup and stored in the draft.

### E2 — Message text with only whitespace
If `messageDraft` is `"   "` (whitespace only), it is treated as empty and the draft MUST NOT be created. A warning is added.

### E3 — Case-insensitive recipient matching
Recipient resolution MUST be case-insensitive. `"carlos"`, `"Carlos"`, and `"CARLOS"` all match the same contact.

### E4 — Draft created but store fails
If `OutboundDraftStore.create()` throws, the system MUST:
- Add an error to `ChannelInboundResult.errors`
- NOT populate `preparedOutbound`
- Still transition the flow to `resolved`

### E5 — Multiple drafts per conversation
A conversation MAY have multiple `OutboundDraft` instances over time (e.g., user confirms one mediation, then starts a new one). `findByConversationId` returns all drafts for a conversation.

### E6 — Ambiguous resolution with exactly 2 candidates
When exactly 2 contacts match the recipient hint, the resolution is `ambiguous` with both candidates included. Future disambiguation logic (out of scope) will let the user choose.

### E7 — Contact with multiple channel bindings
When a contact has both `whatsapp` and `web_chat` bindings, the resolution picks the `whatsapp` binding as the primary channel (MVP preference). This is implementation detail of `RecipientResolution` mapping.

### E8 — Confirmation with flow already resolved
If the flow is already `resolved` (e.g., user sends "sí" twice), the system treats the second "sí" as normal conversation text. No new `OutboundDraft` is created.

---

## Non-Functional Requirements

### NFR1 — Test Coverage
All new types, store operations, use case, and integration logic MUST have unit tests. Target: >90% line coverage for the `outbound-draft` module.

### NFR2 — No Regressions
All existing tests MUST pass without modification. The `preparedOutbound` field is optional in `ChannelInboundResult`, so existing consumers are unaffected.

### NFR3 — Performance
Store lookups MUST be O(1) — the in-memory store uses a `Map<string, OutboundDraft>`.

### NFR4 — Type Safety
All new code MUST compile with TypeScript strict mode enabled. No `any` types.

### NFR5 — Module Isolation
The `outbound-draft` module MUST NOT import from other module domains except as explicitly allowed in DR9. It may import from `shared/types` and read-only references to `mediation-flow/domain` and `contact-directory`.

### NFR6 — No Real Outbound Communication
The system MUST NOT send real messages, connect to WhatsApp/Evolution API, or write to PostgreSQL. All operations are in-memory.

---

## Simulation Acceptance Sets

The following simulation sets MUST pass with the expected outcomes:

| Set | Count | Description | Expected Outcome |
|-----|-------|-------------|------------------|
| Confirmed with known recipient | 5 | Full cycle: detect → clarify → confirm → draft created | All produce `preparedOutbound` with `deliveryReady: true` |
| Confirmed with unknown recipient | 3 | Confirm with recipient not in directory | All produce `preparedOutbound` with `status: "needs_recipient_resolution"` |
| Cancellations | 5 | Various cancel keywords during confirmation | No `OutboundDraft` created, no `preparedOutbound` |
| Edit then confirm | 3 | Edit draft, then confirm | `OutboundDraft` created with updated message |
| Risk interrupts | 3 | Risk signals during confirming | No `OutboundDraft`, flow paused |
| Validation failures | 3 | Empty recipient or message | No `OutboundDraft`, warning in result |
| Voice device confirmations | 2 | Confirm via authorized voice device | `OutboundDraft` created, channel is "voice" |
