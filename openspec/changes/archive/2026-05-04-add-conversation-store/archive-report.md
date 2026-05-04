# Archive Report: Add Conversation Store

**Change**: `add-conversation-store`
**Date**: 2026-05-04
**Mode**: Hybrid (engram + openspec)

---

## Change Summary

Implemented a new `conversation-store` module following the port/adapter pattern, providing an in-memory conversation and message persistence model. Integrated into `ProcessChannelInboundMessage` (inbound pipeline), `SimulationScenarioRunner` (conversational continuity), and both simulation API endpoints. All 14 tasks complete, 370/370 tests passing, 27/27 spec scenarios compliant.

---

## Engram Artifacts (Observation IDs)

| Artifact | ID | Type |
|----------|----|------|
| `sdd/add-conversation-store/spec` | #558 | architecture |
| `sdd/add-conversation-store/design` | #559 | architecture |
| `sdd/add-conversation-store/tasks` | #560 | architecture |
| `sdd/add-conversation-store/apply-progress` | #561 | architecture |
| `sdd/add-conversation-store/verify-report` | #563 | architecture |

---

## Artifacts (Filesystem)

- **Files created** (new module `apps/core/src/modules/conversation-store/`):
  - `domain/conversation.ts` — `Conversation` type + `ConversationStatus` union
  - `domain/conversation-message.ts` — `ConversationMessage` type + `MessageDirection` union
  - `port/conversation-store.ts` — `ConversationStore` port type (4 async methods)
  - `adapter/in-memory-conversation-store.ts` — `InMemoryConversationStore` class
  - `tests/conversation-store.test.ts` — 13 unit tests
  - `index.ts` — barrel module export

- **Files modified**:
  - `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` — added `conversation?: { id, status, messageCount }`
  - `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` — integrated `ConversationStore`, removed old `conversationId` warning
  - `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` — 6 new conversation tests + mock store in all factories
  - `apps/core/src/bootstrap/create-in-memory-pipeline.ts` — wired `InMemoryConversationStore`
  - `apps/core/src/bootstrap/scenario-runner.ts` — auto-propagate `conversationId` across steps, `ScenarioResult.conversation` field
  - `apps/core/src/bootstrap/tests/scenario-endpoint.test.ts` — 6 conversation continuity tests
  - `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` — updated deps
  - `apps/core/src/server.ts` — wired `conversationStore` in production server
  - `docs/simulation-api.md` — added Conversation Tracking section

- **Delta specs synced to main**:
  - `openspec/specs/conversation-store/spec.md` — created (NEW standalone spec for conversation-store module)

---

## Verification

**PASS** ✅

| Metric | Value |
|--------|-------|
| Tasks complete | 14/14 (T22-01 through T22-14) |
| Tests passing | 370/370 (core: 332, gateway-wa: 38) |
| Spec scenarios compliant | 27/27 |
| Critical issues | 0 |
| Warnings (resolved) | 2 (WARN-CONV-001: ScenarioResult conversation field added; WARN-CONV-002: step-level override test added) |
| Suggestions | 3 (injectable generateId/clock, defensive listMessages copy, appendMessage return type clarity) |

---

## Key Decisions

1. **Store identity by tenantId + personId** — Conversations belong to internal domain identity, not channel/external sender. Matches proposal constraint.
2. **Auto-generate UUID using `randomUUID()`** — Caller should not need to know ID format. Same pattern as `StartMediationBridgeSession`.
3. **`appendMessage` before gate evaluation** — Captures inbound message regardless of outcome (blocked, discard, allowed). Matches audit trail semantics.
4. **Separate Maps for conversations and messages** — Simpler queries; messages always appended, never RMW on conversation.
5. **`exactOptionalPropertyTypes: true` aware** — Uses conditional spread pattern for optional `conversation` field in `ChannelInboundResult`.
6. **File structure follows project conventions** — Uses `port/` and `adapter/` directories (not design's `application/ports/` and `infrastructure/memory/`).
7. **In-memory only** — No real DB/WhatsApp/LLM integration. Port designed for future PostgreSQL migration.

---

## Learnings

- `exactOptionalPropertyTypes: true` in tsconfig prevents setting optional properties to `undefined` explicitly — use conditional spreads (`...(condition ? { field: value } : {})`)
- `GuideResult` is a discriminated union — `output` only exists on `GuideResultSuccess`, must narrow by `status`
- Scenario runner conversationId resolution priority: step-level > auto-propagated > scenario-level
- `InMemoryConversationStore` uses direct `randomUUID()` and `new Date()` (not injected) — deviated from design's injectable `generateId`/`clock` pattern. Suggestion left open.
- Outbound messages recorded when `guideResult` exists (covers both `GuideResultSuccess` and `GuideResultFailed` with text)

---

## Future Work

1. **Real PostgreSQL adapter** — The port is designed for future migration. The `FindOrCreateConversationInput` abstraction supports indexed queries.
2. **Inject `generateId` and `clock` to `InMemoryConversationStore`** — Would make tests deterministic. Follows `StartMediationBridgeSession` pattern.
3. **Defensive `listMessages` copy** — Currently returns a live reference; a defensive copy would prevent external mutation.
4. **Internal pipeline (`ProcessIncomingWhatsAppMessage`) integration** — Conversation store currently only wired in simulation pipeline. Production pipeline integration deferred to separate task.
5. **Conversation lifecycle management** — Close/archive functionality beyond status field not yet implemented.
6. **Message querying beyond `listMessages(conversationId)`** — No pagination, filtering, or search.
