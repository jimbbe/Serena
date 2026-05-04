# Design: Add Conversation Store

## Technical Approach

New `conversation-store` module following the established port/adapter pattern (identical to `mediation-bridge`). In-memory adapter using `Map<string, Entity>`. Wire into `ProcessChannelInboundMessage` via a 4th dependency in the deps object. The `conversationId` travels out through `ChannelInboundResult` and propagates across scenario steps via the runner. No new dependencies, no barrel files.

## Architecture Decisions

| # | Decision | Options | Choice | Rationale |
|---|----------|---------|--------|-----------|
| 1 | Port type style | `interface` vs `type` alias | `type` alias | Follows `MediationBridgeSessionStore` convention — all existing ports use `type`, not `interface`. |
| 2 | Store identity | `tenantId + personId` vs `tenantId + channel + externalSenderId` | `tenantId + personId` | Conversations belong to internal domain identity, not channel. Matches proposal constraint. |
| 3 | Conversation ID generation | Parameter vs auto-generate | Auto-generate (`randomUUID()`) on `findOrCreateConversation` | Matches `StartMediationBridgeSession` pattern. Caller should not need to know ID format. |
| 4 | appendMessage timing | Before gate vs after gate vs both | Before gate evaluation, after identity resolution | Captures inbound message regardless of outcome (blocked, discard, allowed). Matches audit trail semantics. |
| 5 | Store dependency injection | 4th positional + deps object expansion vs separate setter | Add `conversationStore` to `ProcessChannelInboundMessageDependencies` | Follows existing pattern — all deps in single object. `ProcessChannelInboundMessage` already uses this style. |
| 6 | conversationId in result | New `conversationId?: string` field on `ChannelInboundResult` | New optional field | Non-breaking for existing consumers. Only set when conversation was found/created successfully. |
| 7 | Message collection | Separate `Map<string, Message[]>` vs `Map<string, {c: Conversation, m: Message[]}>` | Separate maps (`conversations: Map`, `messages: Map<string, Message[]>`) | Simpler queries. Both keyed by conversationId. Messages for a conversation are always appended, never RMW on conversation. |

## Data Flow

```
InboundMessageCommand
  │
  ├── tenantId? ───┐
  ├── personId? ───┤  identity resolution
  ├── text ────────┤        │
  │                │   ResolvedInboundActor
  │                │    ├── tenantId  ──→  findOrCreateConversation(tenantId, personId)
  │                │    └── personId  ──→      │
  │                │                           ├─ existing? → reuse conversationId
  │                │                           └─ new?     → generate conversationId + create
  │                │                                  │
  │                │                         appendMessage(conversationId, msg)
  │                │                                  │
  │                ├── gate evaluation ───────────────┤
  │                ├── AI guide execution ────────────┤
  │                └── ChannelInboundResult ←──────── conversationId ───────┘
  │
  ▼                    Scenario runner loop
ScenarioRequest            │
  ├── conversationId? ────┤  step N result → step N+1 command.conversationId
  └── steps[...] ─────────┘       │
                                  │  next step uses same conversationId
                                  │  → findOrCreate returns existing
                                  ▼
                         appendMessage appends to same conversation
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/conversation-store/domain/conversation.ts` | **Create** | `Conversation` type + `ConversationStatus` union |
| `apps/core/src/modules/conversation-store/domain/conversation-message.ts` | **Create** | `ConversationMessage` type + `MessageDirection` union |
| `apps/core/src/modules/conversation-store/application/ports/conversation-store.ts` | **Create** | `ConversationStore` port type (4 methods) |
| `apps/core/src/modules/conversation-store/infrastructure/memory/in-memory-conversation-store.ts` | **Create** | `InMemoryConversationStore` class |
| `apps/core/src/modules/conversation-store/tests/conversation-store.test.ts` | **Create** | Unit tests for store |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modify | Add `conversationId?: string` |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modify | Add `conversationStore` dep, call findOrCreate + appendMessage |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Modify | Add tests with conversation store mock |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Create `InMemoryConversationStore`, wire to use case |
| `apps/core/src/bootstrap/scenario-runner.ts` | Modify | Propagate `conversationId` from result → next step command |
| `apps/core/src/bootstrap/tests/scenario-runner.test.ts` | Modify | Add conversational continuity tests |

## Domain Types

```typescript
// domain/conversation.ts
export type ConversationStatus = "active" | "closed";

export type Conversation = {
  id: string;
  tenantId: string;
  personId: string;
  status: ConversationStatus;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
};
```

```typescript
// domain/conversation-message.ts
import type { InboundChannel } from "../../../inbound-gate/domain/inbound-message-command.ts";

export type MessageDirection = "inbound" | "outbound";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  tenantId: string;
  personId: string;
  channel: InboundChannel;
  direction: MessageDirection;
  text: string;
  occurredAt: string;  // ISO 8601
};
```

## Port Interface

```typescript
// application/ports/conversation-store.ts
import type { Conversation } from "../../domain/conversation.ts";
import type { ConversationMessage } from "../../domain/conversation-message.ts";

export type ConversationStore = {
  findOrCreateConversation(tenantId: string, personId: string): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation | undefined>;
  appendMessage(message: ConversationMessage): Promise<void>;
  listMessages(conversationId: string): Promise<ConversationMessage[]>;
};
```

## Adapter Design

```typescript
// infrastructure/memory/in-memory-conversation-store.ts
export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage[]>();

  constructor(
    private readonly generateId: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findOrCreateConversation(tenantId, personId): Promise<Conversation> {
    // Linear scan for existing by tenantId+personId (Map keyed by conversationId)
    // If found → return it
    // If not → create with generateId(), insert, return
  }

  async getConversation(conversationId): Promise<Conversation | undefined> {
    return this.conversations.get(conversationId);
  }

  async appendMessage(message): Promise<void> {
    const list = this.messages.get(message.conversationId) ?? [];
    list.push(message);
    this.messages.set(message.conversationId, list);
  }

  async listMessages(conversationId): Promise<ConversationMessage[]> {
    return this.messages.get(conversationId) ?? [];
  }
}
```

Key decisions:
- `generateId` injected as constructor parameter (same pattern as `StartMediationBridgeSession`)
- `clock` injection enables deterministic tests (same as existing test patterns)
- Linear scan for `findOrCreate` — acceptable for in-memory; PostgreSQL migration uses indexed query

## Integration Points

### 1. ProcessChannelInboundMessage

Add `conversationStore: ConversationStore` to `ProcessChannelInboundMessageDependencies`. In `execute()`:

1. After identity resolution (line ~91), before short-circuit check: call `findOrCreateConversation(identity.tenantId, identity.personId ?? cmd.externalSenderId)` → get `conversationId`
2. After pipeline execution (~line 187), call `appendMessage()` with the inbound message details
3. Include `conversationId` in ALL return paths (blocked, discard, allowed)
4. Remove the existing "Missing optional field: conversationId" warning — the store now provides it

### 2. ChannelInboundResult

Add `conversationId?: string` field. Set in all return paths of `ProcessChannelInboundMessage.execute()`.

### 3. SimulationScenarioRunner

After each step's `execute()` returns, extract `result.conversationId`. On next iteration, set `command.conversationId` to the previous step's value (unless the next step provides its own override). This ensures conversational continuity across multi-step scenarios.

### 4. createInMemoryPipeline

Instantiate `new InMemoryConversationStore(randomUUID)` and pass to `ProcessChannelInboundMessage` deps. Return `conversationStore` from the factory so simulation handler can wire the runner.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `InMemoryConversationStore` — findOrCreate, get, append, list | `node:test` + `node:assert/strict`. Test: new creates, same tenant+person returns existing, empty listMessages, append ordering. Inject mock `generateId` and `clock`. |
| Integration | `ProcessChannelInboundMessage` — conversation auto-created, conversationId in result | Mock `ConversationStore` (inline duck-typed object). Assert `findOrCreateConversation` called with correct tenant+person. Assert `conversationId` present in ALL result paths (blocked, discard, allowed). |
| Integration | Scenario runner — conversationId propagation | Full pipeline via `createInMemoryPipeline()`. Multi-step scenario. Assert step 2's command receives step 1's conversationId. Assert messages in same conversation. |
| Regression | All existing tests pass | Run `npm run check`. No changes to existing behavior — new fields are additive/optional. |

## Rollback Plan

1. Remove `conversationStore` from `ProcessChannelInboundMessageDependencies`
2. Remove `conversationId` from `ChannelInboundResult`
3. Revert `scenario-runner.ts` conversationId propagation logic
4. Revert `createInMemoryPipeline()` wiring
5. Delete `modules/conversation-store/` directory
6. No database migration — pure in-memory

## Open Questions

- None. All decisions are bound by existing codebase conventions.
