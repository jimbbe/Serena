# Spec: Add Conversation Store

## Purpose

Serena currently processes individual messages and multi-step scenarios but has **no explicit conversation/message persistence model**. The system processes events without preserving conversational state between steps, which limits conversational testing and makes it impossible to track message history. This spec adds an in-memory conversation store as an exchangeable port, enabling conversational continuity across scenario steps and laying the groundwork for future PostgreSQL persistence.

## Requirements

### REQ-CONV-001: Conversation Domain Model

The system must have a `Conversation` domain type that represents a logical conversation thread between a person and Serena.

**Fields:**
- `id: string` — Unique identifier (UUID format).
- `tenantId: string` — Multi-tenant identifier.
- `personId: string` — The internal person identifier who owns this conversation.
- `status: "open" | "closed" | "archived"` — Lifecycle state. New conversations start as `"open"`.
- `createdAt: Date` — Timestamp of creation.
- `updatedAt: Date` — Timestamp of last modification.
- `metadata?: Record<string, unknown>` — Optional extensible metadata.

**Invariants:**
- `id` is immutable after creation.
- `createdAt` is set at creation time and never changes.
- `updatedAt` is updated on every mutation (e.g., when a message is appended).
- `status` defaults to `"open"` for newly created conversations.

**Scenarios:**

```
Scenario: New conversation has correct initial state
  Given a tenant "demo" and a person "elder_001"
  When a new Conversation is created
  Then status is "open"
  And createdAt equals the creation timestamp
  And updatedAt equals the creation timestamp
  And metadata is undefined or empty
```

```
Scenario: Conversation fields are immutable where required
  Given an existing Conversation with id "conv-001"
  When the conversation is retrieved
  Then id has not changed from "conv-001"
  And createdAt has not changed from its original value
```

---

### REQ-CONV-002: ConversationMessage Domain Model

The system must have a `ConversationMessage` domain type that represents a single message within a conversation.

**Fields:**
- `id: string` — Unique identifier (UUID format).
- `conversationId: string` — Reference to the parent Conversation.
- `tenantId: string` — Multi-tenant identifier (denormalized for query efficiency).
- `personId: string` — The person who sent or received this message.
- `channel: InboundChannel` — The channel through which the message was sent/received (e.g., `"whatsapp"`, `"voice"`, `"simulation"`).
- `direction: "inbound" | "outbound"` — Direction relative to Serena.
- `text: string` — The message text content.
- `occurredAt: Date` — When the message was sent/received.
- `metadata?: Record<string, unknown>` — Optional extensible metadata.

**Invariants:**
- `conversationId` must reference a valid existing Conversation.
- `direction` is either `"inbound"` (message from person to Serena) or `"outbound"` (message from Serena to person).
- `text` must be non-empty.

**Scenarios:**

```
Scenario: Inbound message has correct direction
  Given a conversation "conv-001" for person "elder_001"
  When a ConversationMessage is created with direction "inbound"
  Then direction is "inbound"
  And conversationId is "conv-001"
```

```
Scenario: Outbound message has correct direction
  Given a conversation "conv-001" for person "elder_001"
  When a ConversationMessage is created with direction "outbound"
  Then direction is "outbound"
  And text matches the outbound draft content
```

---

### REQ-CONV-003: ConversationStore Port Interface

The system must define a `ConversationStore` port interface in the application layer that abstracts conversation and message persistence. The port must be implemented by infrastructure adapters (e.g., in-memory, PostgreSQL).

**Interface methods:**

```typescript
interface ConversationStore {
  /**
   * Find an existing open conversation for the given tenant+person,
   * or create a new one if none exists.
   * Returns the conversation (existing or newly created).
   */
  findOrCreateConversation(
    tenantId: string,
    personId: string,
  ): Promise<Conversation>;

  /**
   * Retrieve a conversation by its ID.
   * Returns undefined if not found.
   */
  getConversation(conversationId: string): Promise<Conversation | undefined>;

  /**
   * Append a message to a conversation.
   * Creates the message record and updates the conversation's updatedAt.
   * Returns the created message.
   */
  appendMessage(
    conversationId: string,
    message: {
      tenantId: string;
      personId: string;
      channel: InboundChannel;
      direction: "inbound" | "outbound";
      text: string;
      occurredAt: Date;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ConversationMessage>;

  /**
   * List all messages for a given conversation, ordered by occurredAt ascending.
   * Returns an empty array if the conversation has no messages or does not exist.
   */
  listMessages(conversationId: string): Promise<ConversationMessage[]>;
}
```

**Scenarios:**

```
Scenario: findOrCreateConversation creates new conversation when none exists
  Given no conversation exists for tenant "demo" and person "person-1"
  When findOrCreateConversation("demo", "person-1") is called
  Then a new Conversation is created with status "open"
  And the returned conversation has personId "person-1"
  And tenantId "demo"
```

```
Scenario: findOrCreateConversation returns existing open conversation
  Given an open conversation exists for tenant "demo" and person "person-1"
  When findOrCreateConversation("demo", "person-1") is called
  Then the existing conversation is returned
  And no new conversation is created
  And the returned conversation id matches the existing one
```

```
Scenario: getConversation returns undefined for unknown id
  When getConversation("non-existent-id") is called
  Then the result is undefined
```

```
Scenario: appendMessage updates conversation updatedAt
  Given an existing conversation "conv-001" with updatedAt at time T
  When appendMessage is called with a valid inbound message
  Then a new ConversationMessage is created
  And the conversation's updatedAt is later than T
```

```
Scenario: listMessages returns messages in chronological order
  Given a conversation "conv-001" with 3 messages appended at times T1, T2, T3
  When listMessages("conv-001") is called
  Then the result contains exactly 3 messages
  And messages are ordered by occurredAt ascending (T1, T2, T3)
```

---

### REQ-CONV-004: InMemoryConversationStore Adapter

The system must provide an `InMemoryConversationStore` adapter that implements the `ConversationStore` port using in-memory Maps. This adapter follows the existing store patterns in the project (e.g., `InMemoryProcessedMessageStore`, `InMemoryExternalIdentityResolver`).

**Behavior:**
- Maintains two internal Maps: one for conversations (keyed by `id`) and one for messages (keyed by `conversationId`, value is an array).
- `findOrCreateConversation`: searches for an existing conversation with matching `tenantId` and `personId` and status `"open"`. If found, returns it. If not, creates a new one with a UUID id, `"open"` status, and current timestamps.
- `getConversation`: looks up by id in the conversations Map.
- `appendMessage`: validates the conversation exists, creates a new `ConversationMessage` with a UUID id, pushes it to the messages array for that conversation, and updates the conversation's `updatedAt`.
- `listMessages`: returns the messages array for the given conversationId, sorted by `occurredAt` ascending. Returns empty array if conversation not found.

**File locations (following existing module conventions):**
- `apps/core/src/modules/conversation-store/domain/conversation.ts`
- `apps/core/src/modules/conversation-store/domain/conversation-message.ts`
- `apps/core/src/modules/conversation-store/application/ports/conversation-store.ts`
- `apps/core/src/modules/conversation-store/infrastructure/memory/in-memory-conversation-store.ts`

**Scenarios:**

```
Scenario: InMemoryConversationStore creates conversation with UUID
  Given a fresh InMemoryConversationStore instance
  When findOrCreateConversation("demo", "elder_001") is called
  Then the returned conversation has a valid UUID id
  And status is "open"
```

```
Scenario: InMemoryConversationStore reuses existing conversation
  Given a store with a conversation for tenant "demo" and person "elder_001"
  When findOrCreateConversation("demo", "elder_001") is called twice
  Then both calls return the same conversation id
  And only one conversation exists in the store
```

```
Scenario: InMemoryConversationStore appends and lists messages
  Given a store with conversation "conv-001"
  When appendMessage is called with text "hola" and direction "inbound"
  And appendMessage is called with text "respuesta" and direction "outbound"
  Then listMessages("conv-001") returns 2 messages
  And the first message has text "hola" and direction "inbound"
  And the second message has text "respuesta" and direction "outbound"
```

```
Scenario: InMemoryConversationStore listMessages returns empty for unknown conversation
  When listMessages("non-existent") is called
  Then the result is an empty array
```

---

### REQ-CONV-005: Integration with Inbound Pipeline

The `ConversationStore` must be integrated into the `ProcessChannelInboundMessage` use case so that conversations are automatically managed during inbound message processing.

**Behavior:**
- `ConversationStore` is injected as a dependency into `ProcessChannelInboundMessage`.
- After identity resolution succeeds with status `"resolved"`:
  - Call `findOrCreateConversation(tenantId, personId)` to get or create the conversation.
  - The returned conversation's `id` is attached to the `ChannelInboundResult`.
  - Call `appendMessage()` with the inbound message details (direction: `"inbound"`).
- If identity is `"unknown"` or `"blocked"`:
  - Do NOT create a conversation.
  - Do NOT append a message.
  - Return the result without conversation information (conversationId remains undefined).
- If `conversationId` is provided in the input command and is valid:
  - Use `getConversation(conversationId)` to verify it exists.
  - If it exists, use that conversation (do not create a new one).
  - If it does not exist, fall back to `findOrCreateConversation(tenantId, personId)`.
- The conversation's `updatedAt` is updated when a message is appended.

**Scenarios:**

```
Scenario: Resolved identity creates conversation and records message
  Given a resolved identity with tenantId "demo" and personId "elder_001"
  When ProcessChannelInboundMessage.execute() is called with a valid inbound message
  Then a conversation is created or found for "demo" + "elder_001"
  And an inbound message is appended to that conversation
  And the result includes the conversationId
```

```
Scenario: Unknown identity does not create conversation
  Given an unknown identity (status "unknown")
  When ProcessChannelInboundMessage.execute() is called
  Then no conversation is created
  And no message is appended
  And the result conversationId is undefined
```

```
Scenario: Blocked identity does not create conversation
  Given a blocked identity (status "blocked")
  When ProcessChannelInboundMessage.execute() is called
  Then no conversation is created
  And no message is appended
  And the result conversationId is undefined
```

```
Scenario: Provided valid conversationId is reused
  Given an existing conversation "conv-existing" for tenant "demo" and person "elder_001"
  When ProcessChannelInboundMessage.execute() is called with conversationId "conv-existing"
  Then the existing conversation is used (not a new one)
  And the inbound message is appended to "conv-existing"
  And the result conversationId is "conv-existing"
```

---

### REQ-CONV-006: ChannelInboundResult Includes Conversation Information

The `ChannelInboundResult` type must be extended to include conversation context when a conversation is active.

**New field on `ChannelInboundResult`:**
```typescript
conversation?: {
  /** Conversation identifier. */
  id: string;
  /** Conversation status (open, closed, archived). */
  status: "open" | "closed" | "archived";
  /** Total number of messages in this conversation (including this one). */
  messageCount: number;
};
```

**Behavior:**
- When a conversation is created or found during pipeline execution, the `conversation` field is populated.
- When no conversation exists (unknown/blocked identity), the `conversation` field is `undefined`.
- `messageCount` reflects the total messages after the current message is appended.

**Scenarios:**

```
Scenario: ChannelInboundResult includes conversation for resolved identity
  Given a resolved identity and successful pipeline execution
  When the result is returned
  Then result.conversation is defined
  And result.conversation.id is a valid UUID
  And result.conversation.status is "open"
  And result.conversation.messageCount >= 1
```

```
Scenario: ChannelInboundResult has no conversation for blocked identity
  Given a blocked identity
  When the result is returned
  Then result.conversation is undefined
```

---

### REQ-CONV-007: Scenario Runner Conversational Continuity

The `SimulationScenarioRunner` must maintain conversational continuity across multi-step scenarios so that messages from sequential steps belong to the same conversation.

**Behavior:**
- After each step executes, extract the `conversation.id` from the step's `ChannelInboundResult`.
- If the step produced a conversation, set `conversationId` on the next step's `InboundMessageCommand` automatically.
- If a step explicitly provides its own `conversationId` in `ScenarioStepInput`, that override takes priority (step-level > auto-propagated > scenario-level).
- If no conversation was produced by a step (e.g., blocked identity), the next step does NOT auto-propagate a conversationId — it falls back to scenario-level default or none.
- The first step without an explicit `conversationId` creates a conversation (if identity is resolved), and subsequent steps reuse it.

**Scenarios:**

```
Scenario: First step creates conversation, subsequent steps reuse it
  Given a scenario with 3 steps from the same resolved sender
  And no conversationId is provided at scenario or step level
  When the scenario is executed
  Then step 0 creates a new conversation
  And step 1 uses the conversationId from step 0
  And step 2 uses the same conversationId
  And all 3 steps reference the same conversation id
```

```
Scenario: Step-level conversationId override takes priority
  Given a scenario with 2 steps
  And step 1 provides conversationId "conv-manual"
  When the scenario is executed
  Then step 0 may create its own conversation
  And step 1 uses "conv-manual" instead of the auto-propagated id
```

```
Scenario: Blocked step breaks conversation continuity
  Given a scenario with 3 steps
  And step 1 has a blocked identity
  When the scenario is executed
  Then step 0 creates a conversation (if resolved)
  And step 1 does not produce a conversation (blocked)
  And step 2 does NOT auto-receive a conversationId from step 1
  And step 2 falls back to scenario-level conversationId or creates a new one
```

```
Scenario: Scenario-level conversationId is used as fallback
  Given a scenario with conversationId "conv-scenario"
  And no step-level conversationId overrides
  When the scenario is executed
  Then each step uses "conv-scenario" as its conversationId
  And messages are appended to "conv-scenario"
```

---

### REQ-CONV-008: Simulation API Responses Include Conversation

Both simulation endpoints must include conversation information in their JSON responses.

**`POST /dev/simulate/inbound-message` response update:**
- The existing response body gains a `conversation` field at the top level (same shape as REQ-CONV-006).

**`POST /dev/simulate/scenario` response update:**
- Each step's `result` object (which is a `ChannelInboundResult`) includes the `conversation` field.
- The top-level `ScenarioResult` gains an optional `conversation` field that tracks the final active conversation after all steps.

**Scenarios:**

```
Scenario: Single-step simulation response includes conversation
  Given a valid inbound-message request with a known sender
  When POST /dev/simulate/inbound-message is called
  Then the response includes a "conversation" object
  And conversation.id, conversation.status, and conversation.messageCount are present
```

```
Scenario: Scenario simulation steps include conversation
  Given a valid scenario request with 2 steps from a known sender
  When POST /dev/simulate/scenario is called
  Then each step's result includes a "conversation" object
  And both steps reference the same conversation id
```

---

### REQ-CONV-009: Outbound Draft Recording

When the pipeline generates `outboundDrafts` (simulated outbound messages), they must be recorded as outbound messages in the conversation store.

**Behavior:**
- After the AI guide produces a response with outbound drafts (or any outbound content), call `appendMessage()` with direction `"outbound"`.
- The outbound message text is taken from the simulated outbound draft text.
- If no outbound draft is produced (e.g., discard path, blocked identity), no outbound message is recorded.
- The outbound message uses the same `conversationId`, `tenantId`, `personId`, `channel`, and `occurredAt` as the inbound message.

**Scenarios:**

```
Scenario: Outbound draft is recorded as outbound message
  Given a resolved identity and a pipeline execution that produces an outbound draft
  When the pipeline completes
  Then an outbound message is appended to the conversation
  And the outbound message has direction "outbound"
  And the outbound message text matches the draft text
```

```
Scenario: No outbound draft means no outbound message
  Given a pipeline execution on the "discard" path
  When the pipeline completes
  Then no outbound message is appended
  And only the inbound message exists in the conversation
```

---

### REQ-CONV-010: Existing Tests Still Pass

All existing tests must continue to pass after the conversation store integration.

**Scope:**
- `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts`
- `apps/core/src/bootstrap/tests/scenario-runner.test.ts`
- `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts`
- `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts`
- All other existing test files in the project.

**Behavior:**
- Existing test mock factories for `ProcessChannelInboundMessage` must be updated to include a mock `ConversationStore`.
- Tests that do not exercise conversation functionality should use a no-op mock store.
- No existing test assertions should break due to the new `conversation` field on `ChannelInboundResult`.

**Scenarios:**

```
Scenario: All existing tests pass after integration
  Given the conversation store is integrated into the pipeline
  When the full test suite is executed
  Then all previously passing tests still pass
  And no test failures are introduced by the new conversation field
```

---

### REQ-CONV-011: Documentation Update

The `docs/simulation-api.md` file must be updated to document the new `conversation` field in API responses.

**Updates required:**
- Add `conversation` field to the response schema for `POST /dev/simulate/inbound-message`.
- Add `conversation` field to the per-step result schema for `POST /dev/simulate/scenario`.
- Document the `conversation` object shape: `{ id, status, messageCount }`.
- Add an example response showing the conversation field.
- Note that conversations are in-memory only and lost on server restart.

**Scenarios:**

```
Scenario: API documentation includes conversation field
  Given docs/simulation-api.md is reviewed
  Then the single-step response schema includes the "conversation" field
  And the scenario response schema includes the "conversation" field in step results
  And the conversation object shape is documented
  And at least one example shows the conversation field in a response
```

---

## Non-Functional Requirements

- **NFR-CONV-001**: All store operations must be async (return `Promise`) to support future PostgreSQL migration without API changes.
- **NFR-CONV-002**: The `ConversationStore` port must live in the application layer (`application/ports/`), following the existing port/adapter pattern.
- **NFR-CONV-003**: Domain types (`Conversation`, `ConversationMessage`) must not import from other modules — they are pure types.
- **NFR-CONV-004**: The in-memory store must not persist data across process restarts — this is an accepted limitation documented in code comments.
- **NFR-CONV-005**: UUID generation must use `node:crypto.randomUUID()` consistently, matching existing patterns.

## Out of Scope

- Real PostgreSQL persistence (the port is designed for future migration).
- Real WhatsApp integration.
- Real LLM calls.
- Internal pipeline (`ProcessIncomingWhatsAppMessage`) integration — deferred to a separate task.
- Conversation lifecycle management (close, archive) beyond the status field.
- Message querying/filtering beyond `listMessages(conversationId)`.
- Pagination of messages.
- Message deletion or editing.

## Acceptance Criteria

- [x] `Conversation` and `ConversationMessage` types defined with all required fields
- [x] `ConversationStore` port interface with `findOrCreateConversation`, `getConversation`, `appendMessage`, `listMessages`
- [x] `InMemoryConversationStore` implements the port and passes unit tests
- [x] `ProcessChannelInboundMessage` auto-creates conversation and appends inbound messages for resolved identities
- [x] `ChannelInboundResult` includes `conversation` field with `id`, `status`, `messageCount`
- [x] Scenario runner propagates `conversationId` between steps (continuity test passes)
- [x] Outbound drafts are recorded as outbound messages
- [x] All existing tests pass (no regressions)
- [x] New tests cover store operations, use case integration, scenario continuity
- [x] `docs/simulation-api.md` documents `conversation` in response schemas
