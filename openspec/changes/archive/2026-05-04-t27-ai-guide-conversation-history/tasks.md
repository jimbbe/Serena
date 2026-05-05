# Tasks: Wire Conversation History into AiGuide Context

## Phase 1: Foundation / Types

- [x] 27.1 Create `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts` with `AiGuideInput` type (`Record<string, string> & { input?, actorRole?, channel?, resolvedIdentity?, recentMessages?: string[], knownContacts?: string[], safetyMemory? }`) and export it.

## Phase 2: Core Implementation

- [x] 27.2 Update `ai-guide-service.ts`: change `execute()` input param from `Record<string, string>` to `AiGuideInput`; import `AiGuideInput`.
- [x] 27.3 Update `execution-pipeline.ts`: change `execute()` input to `AiGuideInput`; add `extractStringFields()` helper; in `buildUserPrompt()`, pass `recentMessages`/`knownContacts`/`safetyMemory` to `ContextBuilder.build()` and only string fields to `renderTemplate()`.
- [x] 27.4 Activate conversation history in 4 prompt definitions: set `includeConversationHistory: true` and `maxRecentMessages` (reply=6, risk-review=5, understand-request=4, clarify=3); keep other flags false.
- [x] 27.5 Wire `recentMessages` in `process-channel-inbound-message.ts`: after `appendMessage()`, reuse `listMessages()` result, filter out current message by ID, format as `[direction] personId via channel: text`, pass in `AiGuideInput` alongside `actorRole`, `channel`, `resolvedIdentity`.

## Phase 3: Testing

- [x] 27.6 Update `execution-pipeline.test.ts`: add tests for `recentMessages` flowing to `ContextBuilder`, empty array produces no history section, undefined doesn't crash, `renderTemplate` only receives string fields.
- [x] 27.7 Update `context-policy.test.ts`: flip guard from `includeConversationHistory=false` to `=true`; verify `maxRecentMessages` values (6, 5, 4, 3); keep guards for contacts/safety/full-conversation=false.
- [x] 27.8 Update `process-channel-inbound-message.test.ts`: add tests for first message → `recentMessages: []`, second message → first in history, current message excluded, chronological order preserved, context fields passed when identity resolved, blocked/discard skips aiGuideService.

## Phase 4: Documentation & Validation

- [x] 27.9 Update `docs/ai-guide-prompts.md` (mark conversation history active) and `docs/project-status.md` (note T27 completion).
- [x] 27.10 Run `npm run check` and `npm test` — both must pass; fix any failures.
