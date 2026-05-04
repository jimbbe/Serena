# Design: Wire Conversation History into AiGuide Context

## Technical Approach

Minimal wire-through: ContextBuilder already handles `recentMessages` and `includeConversationHistory`. The gap is passing the data from `ProcessChannelInboundMessage` through `AiGuideService` → `ExecutionPipeline` → `ContextBuilder.build()`. We define a typed `AiGuideInput` replacing bare `Record<string, string>`, fetch + format messages at the only call site that has `ConversationStore`, and flip 4 prompt flags.

## Architecture Decisions

### Decision 1: AiGuideInput type definition

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `Record<string, string>` + separate params | No type safety for known fields | Rejected |
| New interface with all typed fields | Breaks existing callers | Rejected |
| `Record<string, string> & { known fields }` (intersection) | Backward compat + typed fields | ✅ **Chosen** |

**Rationale**: Intersection type keeps existing `input["actorRole"]` accesses working while adding explicit optional fields (`recentMessages?: string[]`). No caller changes required beyond the type annotation.

### Decision 2: Where to fetch + format messages

| Option | Tradeoff | Decision |
|--------|----------|----------|
| In `ExecutionPipeline` | Adds ConversationStore dependency to a pure pipeline | Rejected |
| In `AiGuideService` | Adds dependency that doesn't belong in service layer | Rejected |
| In `ProcessChannelInboundMessage` | Call site already has ConversationStore + calls `listMessages` | ✅ **Chosen** |

**Rationale**: `ProcessChannelInboundMessage` already calls `listMessages(conversationId)` to compute `messageCount`. Reuse that call result — no extra store traversal.

### Decision 3: Message exclusion strategy

**Choice**: Filter by `message.id !== currentMessageId` after `listMessages()` returns all messages including the just-appended one.

**Rationale**: `listMessages` returns all messages ordered by `occurredAt`. The current message was appended moments before. Filter by ID is deterministic and avoids brittle time-based exclusion.

### Decision 4: Template compatibility

**Choice**: In `buildUserPrompt()`, extract only `Record<string, string>` values (skip `recentMessages`, `knownContacts`, `safetyMemory`) for `renderTemplate()`. Array fields go directly to `ContextBuilder.build()`.

**Rationale**: `renderTemplate` works with `Record<string, string>` — string arrays would produce `"[object Array]"` or crash. No change needed to `renderTemplate` itself.

## Data Flow

```
ProcessChannelInboundMessage.execute(cmd)
  │
  ├─ listMessages(conversationId) ──→ message[] (existing call, reused)
  │
  ├─ filter: exclude message where id === currentMessageId
  ├─ map: `[{direction}] {personId} via {channel}: {text}`
  │
  └─ aiGuideService.execute(useCaseId, {
       input: cmd.text,
       actorRole, channel, resolvedIdentity,
       recentMessages: string[]    ← NEW
     })
       │
       └─ pipeline.execute(contract, input: AiGuideInput)
            │
            └─ buildUserPrompt(promptDef, input)
                 │
                 ├─ renderTemplate(template, stringFields(input))
                 └─ contextBuilder.build(policy, {
                      currentMessage,
                      recentMessages: input.recentMessages  ← flows here
                    })
                      │
                      └─ [if includeConversationHistory + recentMessages.length > 0]
                           └─ `Historial reciente (N mensajes):\n- msg1\n- msg2\n...`
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts` | **Create** | New `AiGuideInput` type intersection |
| `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-service.ts` | Modify | Input param `Record<string,string>` → `AiGuideInput` |
| `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` | Modify | Inline `ExecutionInput` gains `recentMessages?: string[]`; `buildUserPrompt` passes to `ContextBuilder`; `execute()` signature changes; template extraction skips arrays |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modify | Save `currentMessageId`, filter it from `listMessages` result, format as `string[]`, pass in aiGuideService input |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/conversation-reply.v1.ts` | Modify | `includeConversationHistory: true`, `maxRecentMessages: 6` |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/risk-review.v1.ts` | Modify | `includeConversationHistory: true`, `maxRecentMessages: 5` |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` | Modify | `includeConversationHistory: true`, `maxRecentMessages: 4` |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-clarify.v1.ts` | Modify | `includeConversationHistory: true`, `maxRecentMessages: 3` |
| `apps/core/src/modules/ai-guide/tests/context-policy.test.ts` | Modify | Guard: `includeConversationHistory=false` → `=true` (4 prompt tests + 1 guard loop) |
| `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` | Modify | Add: `recentMessages` flows to ContextBuilder, empty array handled, undefined handled |
| `apps/core/src/modules/ai-guide/tests/context-builder.test.ts` | Modify | Add: `maxRecentMessages` slicing test (already exists, verify still passes) |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Modify | Add: history passed to aiGuideService, empty history on first message, blocked/discard skip history |

## Interfaces / Contracts

```typescript
// New file: ai-guide-input.ts
export type AiGuideInput = Record<string, string> & {
  input?: string;
  actorRole?: string;
  channel?: string;
  resolvedIdentity?: string;
  recentMessages?: string[];
  knownContacts?: string[];
  safetyMemory?: string;
};

// ExecutionPipeline.execute signature change
async execute(
  contract: UseCaseContract,
  input: AiGuideInput         // was: Record<string, string>
): Promise<GuideResult>

// AiGuideService.execute signature change
async execute(
  useCaseId: GuideUseCaseId,
  input: AiGuideInput         // was: Record<string, string>
): Promise<GuideResult>
```

**Template extraction helper** (private in ExecutionPipeline):
```typescript
// Extracts only string-valued fields for renderTemplate.
// Array fields (recentMessages, knownContacts) bypass template.
function extractStringFields(input: AiGuideInput): Record<string, string> {
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") strings[key] = value;
  }
  return strings;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — ContextBuilder | `maxRecentMessages` slices correctly; empty/undefined `recentMessages` omits section | Already tested; verify existing tests pass |
| Unit — ExecutionPipeline | `recentMessages` passed to `ContextBuilder.build()`; empty array produces no section; undefined doesn't crash | New test: spy on `ContextBuilder.build()` |
| Unit — ProcessChannelInboundMessage | History passed to aiGuideService on 2nd+ message; empty `[]` on 1st; current message excluded; blocked/discard skip | New tests in process-channel-inbound-message.test.ts |
| Guard — context-policy.test.ts | All 4 prompts assert `includeConversationHistory: true` with correct `maxRecentMessages` | Modify existing guard loop |
| Regression | All existing tests pass | `npm run check` |

## Migration / Rollout

No data migration required — feature is additive. Rollback plan:
1. Revert prompt definitions: `includeConversationHistory: false` on all 4
2. Remove `recentMessages` from AiGuideService call in ProcessChannelInboundMessage
3. Full `git revert` if needed

## Open Questions

- [ ] Spec vs proposal discrepancy on `maxRecentMessages` values: proposal says risk-review=4, mediation-clarify=4 vs spec says risk-review=5, mediation-clarify=3. **Resolution needed before implementation.** This design follows spec values.
- [ ] `mediation-clarify` currently has `includeChannelMetadata: false` (different from other 3). Keep as-is — conversation history is orthogonal.
