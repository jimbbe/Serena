# Proposal: T27 — Wire Conversation History into AiGuide Context

## Intent

ContextBuilder already supports `recentMessages: string[]` and `includeConversationHistory` in its `build()` method, but the wiring is incomplete: ExecutionPipeline never passes `recentMessages`, and all 4 prompts have `includeConversationHistory: false`. This change wires the existing ConversationStore data through the pipeline so the LLM receives recent conversation context.

## Scope

### In Scope
1. Define typed `AiGuideInput` interface to replace `Record<string, string>` in AiGuideService + ExecutionPipeline, adding `recentMessages?: string[]`
2. Fetch recent messages in `ProcessChannelInboundMessage.execute()` (reusing existing `listMessages` call) and pass them through to `aiGuideService.execute()`
3. Flow `recentMessages` through `ExecutionPipeline.buildUserPrompt()` into `ContextBuilder.build()`
4. Activate `includeConversationHistory: true` on all 4 prompts with appropriate `maxRecentMessages` values
5. Update guard test in `context-policy.test.ts` (remove `includeConversationHistory=false` guard, add `=true` guard)
6. Add unit tests for the wiring: ContextBuilder with recentMessages, ExecutionPipeline flowing recentMessages, ProcessChannelInboundMessage passing them
7. Update affected specs: `ai-guide-service`, `ai-guide-pipeline`

### Out of Scope
- `includeFullConversation` (remains false — Phase 2+)
- `includeKnownContacts` wiring (separate task)
- `includeSafetyMemory` wiring (separate task)
- Real LLM, real WhatsApp, PostgreSQL
- Any refactor beyond the minimal type change from `Record<string, string>` to `AiGuideInput`

## Capabilities

### New Capabilities
- `ai-guide-conversation-history`: AiGuide pipeline receives and passes recent conversation messages to ContextBuilder, and prompts activate conversation history inclusion.

### Modified Capabilities
- `ai-guide-service`: Input type changes from `Record<string, string>` to typed `AiGuideInput` with `recentMessages` field.
- `ai-guide-pipeline`: ExecutionPipeline flows `recentMessages` from input to ContextBuilder.build().

## Approach

```
ProcessChannelInboundMessage.execute()
  ├─ listMessages(conversationId)  ← already called for messageCount
  ├─ map ConversationMessage[] → string[] (recentMessages)
  └─ aiGuideService.execute(useCaseId, { ..., recentMessages })

AiGuideService.execute(useCaseId, input: AiGuideInput)
  └─ pipeline.execute(contract, input)

ExecutionPipeline.execute(contract, input: AiGuideInput)
  └─ buildUserPrompt(promptDef, input)
       └─ contextBuilder.build(policy, { ..., recentMessages: input.recentMessages })
            └─ (existing logic: slices by maxRecentMessages, formats sections)
```

The type change from `Record<string, string>` to `AiGuideInput` is minimal: `AiGuideInput` extends `Record<string, string>` with known optional fields (`recentMessages?: string[]`), so existing callers that pass string key-value pairs continue to work.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `ai-guide/application/use-cases/ai-guide-service.ts` | Modified | Input type: `Record<string, string>` → `AiGuideInput` |
| `ai-guide/application/use-cases/execution-pipeline.ts` | Modified | `ExecutionInput` gains `recentMessages?: string[]`; `buildUserPrompt` passes it to ContextBuilder |
| `inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified | Maps `listMessages` result to `string[]` and passes as `recentMessages` in aiGuideService input |
| `ai-guide/application/prompts/definitions/conversation-reply.v1.ts` | Modified | `includeConversationHistory: true`, `maxRecentMessages: 6` |
| `ai-guide/application/prompts/definitions/risk-review.v1.ts` | Modified | `includeConversationHistory: true`, `maxRecentMessages: 4` |
| `ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` | Modified | `includeConversationHistory: true`, `maxRecentMessages: 6` |
| `ai-guide/application/prompts/definitions/mediation-clarify.v1.ts` | Modified | `includeConversationHistory: true`, `maxRecentMessages: 4` |
| `ai-guide/tests/context-policy.test.ts` | Modified | Guard test: `includeConversationHistory=false` → `=true` |
| `ai-guide/tests/execution-pipeline.test.ts` | Modified | Add test for recentMessages flowing through pipeline |
| `ai-guide/tests/context-builder.test.ts` | Modified | Add test for recentMessages with maxRecentMessages limit |
| `inbound-gate/tests/process-channel-inbound-message.test.ts` | Modified | Add test verifying recentMessages passed to aiGuideService |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Type mismatch: `AiGuideInput` breaks existing callers | Low | `AiGuideInput` extends `Record<string, string>` — fully backward compatible |
| Guard test flip causes false pass if wiring is broken | Low | New wiring tests verify the full path, not just the flag |
| Too many recent messages bloat prompt | Low | `maxRecentMessages` per prompt caps the slice; ContextBuilder already handles this |
| `listMessages` called twice (once for count, once for messages) | Medium | Reuse the existing `listMessages` call — remove the redundant count-only call |

## Rollback Plan

1. Revert all prompt definitions: set `includeConversationHistory: false` on all 4 prompts (removes history from LLM context immediately).
2. If type change causes issues: revert `AiGuideInput` → `Record<string, string>` and remove `recentMessages` from the input map in ProcessChannelInboundMessage.
3. Full `git revert` of the merge commit if needed.

## Dependencies

- T22 (ConversationStore) — already merged, provides `listMessages`
- ContextBuilder — already supports `recentMessages` and `includeConversationHistory`

## Success Criteria

- [ ] All 4 prompts have `includeConversationHistory: true` with `maxRecentMessages` set
- [ ] `AiGuideInput` type defined and used in AiGuideService + ExecutionPipeline
- [ ] `ProcessChannelInboundMessage` fetches and passes `recentMessages` to aiGuideService
- [ ] ExecutionPipeline passes `recentMessages` to ContextBuilder.build()
- [ ] Guard test updated: all prompts assert `includeConversationHistory: true`
- [ ] New tests pass: ContextBuilder with recentMessages, pipeline flow, inbound message wiring
- [ ] All existing tests pass (no regressions)
