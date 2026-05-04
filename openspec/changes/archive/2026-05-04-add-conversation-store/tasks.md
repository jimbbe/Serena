# Tasks: Add Conversation Store

## T22-01 — Create `Conversation` domain type

**Spec**: REQ-CONV-001, NFR-CONV-003, NFR-CONV-005

Create `apps/core/src/modules/conversation-store/domain/conversation.ts` with:

- `ConversationStatus` union: `"open" | "closed" | "archived"`
- `Conversation` type with fields: `id`, `tenantId`, `personId`, `status`, `createdAt` (Date), `updatedAt` (Date), `metadata?`
- No imports from other modules — pure type file
- JSDoc comment explaining the type's role

**Acceptance**:
- [ ] File exists at correct path
- [ ] Type matches spec fields exactly (including `Date` types, not strings)
- [ ] No cross-module imports
- [ ] `npm run check` passes (no lint/type errors)

---

## T22-02 — Create `ConversationMessage` domain type

**Spec**: REQ-CONV-002, NFR-CONV-003

Create `apps/core/src/modules/conversation-store/domain/conversation-message.ts` with:

- `MessageDirection` union: `"inbound" | "outbound"`
- `ConversationMessage` type with fields: `id`, `conversationId`, `tenantId`, `personId`, `channel` (InboundChannel), `direction`, `text`, `occurredAt` (Date), `metadata?`
- Import `InboundChannel` from `inbound-gate/domain/inbound-message-command.ts` (allowed — it's a primitive enum-like type)
- JSDoc comment

**Acceptance**:
- [ ] File exists at correct path
- [ ] Type matches spec fields exactly
- [ ] Only import is `InboundChannel` from inbound-gate domain
- [ ] `npm run check` passes

---

## T22-03 — Create `ConversationStore` port interface

**Spec**: REQ-CONV-003, NFR-CONV-001, NFR-CONV-002

Create `apps/core/src/modules/conversation-store/application/ports/conversation-store.ts` with:

- `ConversationStore` type alias (NOT interface — follow existing convention like `MediationBridgeSessionStore`)
- Methods (all async/Promise):
  - `findOrCreateConversation(tenantId: string, personId: string): Promise<Conversation>`
  - `getConversation(conversationId: string): Promise<Conversation | undefined>`
  - `appendMessage(conversationId: string, message: { tenantId, personId, channel, direction, text, occurredAt: Date, metadata? }): Promise<ConversationMessage>`
  - `listMessages(conversationId: string): Promise<ConversationMessage[]>`
- Import domain types from `../../domain/...`
- Import `InboundChannel` from inbound-gate domain

**Acceptance**:
- [ ] File exists at correct path
- [ ] Uses `type` alias (not `interface`)
- [ ] All 4 methods present with correct signatures per spec
- [ ] All methods return `Promise` (async)
- [ ] `npm run check` passes

---

## T22-04 — Create `InMemoryConversationStore` adapter

**Spec**: REQ-CONV-004, NFR-CONV-004, NFR-CONV-005

Create `apps/core/src/modules/conversation-store/infrastructure/memory/in-memory-conversation-store.ts` with:

- `InMemoryConversationStore` class implementing `ConversationStore`
- Two internal Maps: `conversations: Map<string, Conversation>` (keyed by id), `messages: Map<string, ConversationMessage[]>` (keyed by conversationId)
- Constructor: `(generateId: () => string, clock: () => Date = () => new Date())` — follows `StartMediationBridgeSession` pattern
- `findOrCreateConversation`: linear scan for existing open conversation by tenantId+personId; create new if none found using `generateId()` and `clock()`
- `getConversation`: direct Map get
- `appendMessage`: validate conversation exists, create message with UUID, push to array, update conversation's `updatedAt` via clock
- `listMessages`: return sorted copy by `occurredAt` ascending, or `[]` if not found
- Comment noting in-memory only (lost on restart)

**Acceptance**:
- [ ] File exists at correct path
- [ ] Implements all 4 port methods
- [ ] Constructor accepts injectable `generateId` and `clock`
- [ ] `findOrCreateConversation` reuses existing open conversations
- [ ] `appendMessage` updates conversation `updatedAt`
- [ ] `listMessages` returns sorted copy (not live reference)
- [ ] `npm run check` passes

---

## T22-05 — Write unit tests for `InMemoryConversationStore`

**Spec**: REQ-CONV-004 scenarios

Create `apps/core/src/modules/conversation-store/tests/conversation-store.test.ts` with:

- Use `node:test` + `node:assert/strict`
- Tests with injected mock `generateId` and `clock`:
  - `findOrCreateConversation` creates new conversation with correct initial state
  - `findOrCreateConversation` returns existing open conversation (same id)
  - `findOrCreateConversation` creates new when existing is closed/archived
  - `getConversation` returns undefined for unknown id
  - `getConversation` returns existing conversation
  - `appendMessage` creates message and updates conversation `updatedAt`
  - `appendMessage` throws or handles non-existent conversation
  - `listMessages` returns messages in chronological order
  - `listMessages` returns empty array for unknown conversation
  - Multiple conversations for different tenantId+personId pairs don't collide

**Acceptance**:
- [ ] All spec scenarios covered
- [ ] Tests use injected `generateId` and `clock` for determinism
- [ ] `npm run check` passes including tests

---

## T22-06 — Extend `ChannelInboundResult` with conversation field

**Spec**: REQ-CONV-006

Modify `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts`:

- Add optional `conversation` field to `ChannelInboundResult`:
  ```typescript
  conversation?: {
    id: string;
    status: "open" | "closed" | "archived";
    messageCount: number;
  };
  ```
- Import `ConversationStatus` from conversation-store domain (or inline the union to avoid cross-module import — check existing convention)

**Acceptance**:
- [ ] Field added with correct shape per spec
- [ ] Optional (`?`) — non-breaking for existing consumers
- [ ] `npm run check` passes

---

## T22-07 — Integrate `ConversationStore` into `ProcessChannelInboundMessage`

**Spec**: REQ-CONV-005, REQ-CONV-009

Modify `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts`:

- Add `conversationStore: ConversationStore` to `ProcessChannelInboundMessageDependencies`
- Store reference in class
- After identity resolution (step 0), if identity status is `"resolved"`:
  - If `cmd.conversationId` provided: call `getConversation(cmd.conversationId)` — use existing if found, else fall back to `findOrCreateConversation`
  - Else: call `findOrCreateConversation(identity.tenantId, identity.personId ?? cmd.externalSenderId)`
  - Call `appendMessage()` with inbound message details (direction: `"inbound"`)
  - After AI guide execution: if `outboundDrafts` exist, call `appendMessage()` for each with direction `"outbound"`
  - Populate `result.conversation` with `{ id, status, messageCount }` (messageCount = `listMessages(conversationId).length`)
- If identity is `"unknown"` or `"blocked"`: skip all store operations, `conversation` remains undefined
- Remove the existing "Missing optional field: conversationId" warning (lines 71-73)

**Acceptance**:
- [ ] `conversationStore` added to deps type
- [ ] Resolved identity → conversation created/found + inbound message appended
- [ ] Unknown/blocked identity → no store interaction
- [ ] Provided valid `conversationId` → reused (not recreated)
- [ ] Outbound drafts recorded as outbound messages
- [ ] `result.conversation` populated with id, status, messageCount
- [ ] Old warning about missing conversationId removed
- [ ] `npm run check` passes

---

## T22-08 — Update existing `ProcessChannelInboundMessage` tests

**Spec**: REQ-CONV-010

Modify `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts`:

- Add mock `ConversationStore` to all existing test factories (no-op stubs)
- Add new tests for conversation integration:
  - Resolved identity creates conversation and appends inbound message
  - Unknown identity does NOT create conversation
  - Blocked identity does NOT create conversation
  - Provided valid conversationId is reused
  - Outbound draft recorded as outbound message
  - No outbound draft means no outbound message appended
- Existing test assertions should not break from new `conversation` field

**Acceptance**:
- [ ] All existing tests still pass
- [ ] New conversation-related tests added
- [ ] Mock store used in non-conversation tests
- [ ] `npm run check` passes

---

## T22-09 — Wire `InMemoryConversationStore` into `createInMemoryPipeline`

**Spec**: REQ-CONV-005 (integration)

Modify `apps/core/src/bootstrap/create-in-memory-pipeline.ts`:

- Import `InMemoryConversationStore` and `ConversationStore` type
- Create instance: `new InMemoryConversationStore(randomUUID)`
- Pass to `ProcessChannelInboundMessage` deps
- Return `conversationStore` from factory function (add to return type)

**Acceptance**:
- [ ] Store instantiated and wired to use case
- [ ] Factory return type updated
- [ ] `npm run check` passes

---

## T22-10 — Update `SimulationScenarioRunner` for conversational continuity

**Spec**: REQ-CONV-007

Modify `apps/core/src/bootstrap/scenario-runner.ts`:

- After each step executes, extract `result?.conversation?.id`
- Propagate to next step's `command.conversationId` unless step provides its own override
- Priority order: step-level > auto-propagated > scenario-level
- If step produced no conversation (blocked/unknown), do NOT auto-propagate — fall back to scenario-level default or none
- Track `lastConversationId` across loop iterations

**Acceptance**:
- [ ] Auto-propagation logic implemented
- [ ] Priority order correct (step > auto > scenario)
- [ ] Blocked step breaks continuity (no auto-propagate)
- [ ] `npm run check` passes

---

## T22-11 — Write scenario runner continuity tests

**Spec**: REQ-CONV-007 scenarios

Modify `apps/core/src/bootstrap/tests/scenario-runner.test.ts`:

- Add tests:
  - First step creates conversation, subsequent steps reuse same conversationId
  - Step-level conversationId override takes priority over auto-propagated
  - Blocked step breaks conversation continuity (step 2 doesn't get step 1's convId)
  - Scenario-level conversationId used as fallback when no auto-propagation
  - Multi-step scenario: all steps from same sender share one conversation

**Acceptance**:
- [ ] All spec scenarios covered
- [ ] Tests use full pipeline (not mocked store)
- [ ] `npm run check` passes

---

## T22-12 — Update simulation API endpoints to include conversation in responses

**Spec**: REQ-CONV-008

Modify simulation endpoint handlers (check `apps/core/src/bootstrap/` or `apps/server/` for endpoint files):

- `POST /dev/simulate/inbound-message`: response already includes `ChannelInboundResult` — gains `conversation` field automatically from T22-07
- `POST /dev/simulate/scenario`: each step's result includes `conversation` from T22-07; add optional top-level `conversation` field to `ScenarioResult` tracking final active conversation
- Update `ScenarioResult` type to include `conversation?: { id, status, messageCount }`

**Acceptance**:
- [ ] Single-step response includes conversation object
- [ ] Scenario step results include conversation object
- [ ] ScenarioResult has optional top-level conversation field
- [ ] `npm run check` passes

---

## T22-13 — Update `docs/simulation-api.md`

**Spec**: REQ-CONV-011

Modify `docs/simulation-api.md`:

- Add `conversation` field to single-step response schema
- Add `conversation` field to per-step result schema for scenario endpoint
- Document conversation object shape: `{ id: string, status: "open" | "closed" | "archived", messageCount: number }`
- Add example response showing conversation field
- Note: conversations are in-memory only, lost on server restart

**Acceptance**:
- [ ] Response schemas updated
- [ ] Conversation object shape documented
- [ ] At least one example shows conversation field
- [ ] In-memory limitation noted

---

## T22-14 — Full regression: all tests pass + `npm run check`

**Spec**: REQ-CONV-010

- Run `npm run check`
- Verify all existing tests pass
- No lint errors, no type errors
- No new warnings introduced

**Acceptance**:
- [ ] `npm run check` exits with code 0
- [ ] All tests pass (old + new)
- [ ] No lint/type errors

---

## Dependency Graph

```
T22-01 (Conversation type) ──┐
                              ├── T22-03 (Port) ── T22-04 (InMemory adapter) ── T22-05 (Store tests)
T22-02 (Message type) ───────┘                                                     │
                                                                                   │
T22-06 (ChannelInboundResult) ────────────────────────────────────────────────────┼── T22-07 (Use case integration) ── T22-08 (Use case tests)
                                                                                   │                                    │
T22-09 (Pipeline wiring) ──────────────────────────────────────────────────────────┘                                    │
                                                                                                                        │
T22-10 (Runner continuity) ─────────────────────────────────────────────────────── T22-11 (Runner tests)               │
                                                                                                                        │
T22-12 (API endpoints) ────────────────────────────────────────────────────────────────────────────────────────────────┘
    │
    └── T22-13 (Docs)
            │
            └── T22-14 (Full regression)
```

## Implementation Order

1. T22-01 → T22-02 (domain types, parallel)
2. T22-03 (port, depends on T22-01 + T22-02)
3. T22-04 (adapter, depends on T22-03)
4. T22-05 (store tests, depends on T22-04)
5. T22-06 (result type, independent — can do parallel with T22-01/02)
6. T22-07 (use case integration, depends on T22-03 + T22-04 + T22-06)
7. T22-08 (use case tests, depends on T22-07)
8. T22-09 (pipeline wiring, depends on T22-04 + T22-07)
9. T22-10 (runner continuity, depends on T22-07 + T22-09)
10. T22-11 (runner tests, depends on T22-10)
11. T22-12 (API endpoints, depends on T22-07 + T22-10)
12. T22-13 (docs, depends on T22-12)
13. T22-14 (regression, depends on everything)
