# Proposal: Add Conversation Store

## Intent

Serena currently processes individual messages and multi-step scenarios but has **no explicit conversation/message persistence model**. The system processes events without preserving conversational state between steps, which limits conversational testing and makes it impossible to track message history. This change adds an in-memory conversation store as an exchangeable port, enabling conversational continuity across scenario steps and laying the groundwork for future PostgreSQL persistence.

## Scope

### In Scope
- `Conversation` domain type (id, tenantId, personId, status, createdAt, updatedAt)
- `ConversationMessage` domain type (id, conversationId, tenantId, personId, channel, direction, text, occurredAt)
- `ConversationStore` port interface (findOrCreateConversation, getConversation, appendMessage, listMessages)
- `InMemoryConversationStore` adapter (Map-based, following existing store patterns)
- New module `conversation-store` under `apps/core/src/modules/`
- Wire `ConversationStore` into `ProcessChannelInboundMessage` use case
- Add `conversationId` field to `ChannelInboundResult`
- Update `SimulationScenarioRunner` to propagate `conversationId` between steps
- Tests for store, use case integration, and scenario continuity
- Update `docs/simulation-api.md`

### Out of Scope
- Real PostgreSQL persistence (store is an exchangeable port for future migration)
- Real WhatsApp integration
- Real LLM calls
- Internal pipeline (`ProcessIncomingWhatsAppMessage`) integration — deferred to separate task
- Conversation lifecycle management (close, archive) beyond status field
- Message querying/filtering beyond `listMessages(conversationId)`

## Capabilities

### New Capabilities
- `conversation-store`: Domain types (Conversation, ConversationMessage), port interface (ConversationStore), and in-memory adapter. Covers entity definitions, store operations (findOrCreate, get, append, list), and in-memory implementation.

### Modified Capabilities
- `inbound-simulation-usecase`: Add `ConversationStore` as constructor dependency to `ProcessChannelInboundMessage`. Add `conversationId` field to `ChannelInboundResult`. Use case calls `findOrCreateConversation` and `appendMessage` during execution.
- `scenario-simulation`: Scenario runner propagates `conversationId` from each step's result to the next step's command, enabling conversational continuity.
- `inbound-simulation-endpoint`: Response JSON includes `conversationId` in `ChannelInboundResult` (auto-propagated via existing handler).

## Approach

1. **New module** `apps/core/src/modules/conversation-store/` following the established port/adapter pattern:
   - `domain/conversation.ts` — `Conversation` type with status enum
   - `domain/conversation-message.ts` — `ConversationMessage` type with direction enum
   - `application/ports/conversation-store.ts` — port interface
   - `infrastructure/memory/in-memory-conversation-store.ts` — Map-based adapter

2. **Add `conversationId?: string`** to `ChannelInboundResult` type

3. **Wire into `ProcessChannelInboundMessage`**: inject `ConversationStore` as 4th dependency. After identity resolution, call `findOrCreateConversation(tenantId, personId)`. After pipeline execution, call `appendMessage()` with the inbound message details.

4. **Update `SimulationScenarioRunner`**: after each step, extract `conversationId` from `ChannelInboundResult` and set it on the next step's `InboundMessageCommand`.

5. **Update `createInMemoryPipeline()`**: instantiate `InMemoryConversationStore` and pass to `ProcessChannelInboundMessage`.

6. **Tests**: follow existing `node:test` + `node:assert/strict` patterns with mock factories.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `modules/conversation-store/domain/conversation.ts` | New | Conversation entity type |
| `modules/conversation-store/domain/conversation-message.ts` | New | ConversationMessage entity type |
| `modules/conversation-store/application/ports/conversation-store.ts` | New | Store port interface |
| `modules/conversation-store/infrastructure/memory/in-memory-conversation-store.ts` | New | In-memory adapter |
| `modules/conversation-store/tests/conversation-store.test.ts` | New | Store unit tests |
| `modules/inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add `conversationId` field |
| `modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified | Inject store, call findOrCreate + appendMessage |
| `modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Modified | Add tests with conversation store |
| `bootstrap/create-in-memory-pipeline.ts` | Modified | Create and wire InMemoryConversationStore |
| `bootstrap/scenario-runner.ts` | Modified | Propagate conversationId between steps |
| `bootstrap/tests/scenario-runner.test.ts` | Modified | Add conversational continuity tests |
| `docs/simulation-api.md` | Modified | Document conversationId in responses |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `ProcessChannelInboundMessage` grows to 4 dependencies | Low | Acceptable — existing pattern with 3 deps; 4th is consistent with SRP |
| Breaking existing tests that mock the use case | Medium | Update mock factories to include conversation store; all tests must pass |
| Scenario runner propagation logic complexity | Low | Simple field extraction and assignment; well-tested with existing patterns |
| Conversation identity confusion (channel vs person) | Low | Domain types enforce tenantId+personId as identity, not channel+externalSenderId |

## Rollback Plan

1. Remove `ConversationStore` dependency from `ProcessChannelInboundMessage` constructor
2. Remove `conversationId` field from `ChannelInboundResult`
3. Delete `modules/conversation-store/` directory entirely
4. Revert `createInMemoryPipeline()` to previous wiring
5. Revert `scenario-runner.ts` conversationId propagation
6. No database migration needed — pure in-memory, no data to migrate

## Dependencies

- Existing `ProcessChannelInboundMessage` use case
- Existing `ChannelInboundResult` type
- Existing `SimulationScenarioRunner`
- Existing `createInMemoryPipeline` factory
- No new external dependencies

## Success Criteria

- [ ] `Conversation` and `ConversationMessage` types defined with all required fields
- [ ] `ConversationStore` port interface with findOrCreate, get, append, list operations
- [ ] `InMemoryConversationStore` implements port, passes unit tests
- [ ] `ProcessChannelInboundMessage` auto-creates conversation and appends messages
- [ ] `ChannelInboundResult` includes `conversationId` in response
- [ ] Scenario runner propagates `conversationId` between steps (continuity test passes)
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover store operations, use case integration, scenario continuity
- [ ] `docs/simulation-api.md` documents `conversationId` in response schema
