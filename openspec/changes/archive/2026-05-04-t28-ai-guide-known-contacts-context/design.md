# Design: Wire Known Contacts into AI Guide Mediation Context

## Technical Approach

Wiring pass-through: `ProcessChannelInboundMessage` fetches from `ContactDirectory.findAll()`, maps to `"DisplayName (id: contact-id)"`, passes as `knownContacts` to `AiGuideService.execute()`. `ExecutionPipeline` already passes `knownContacts` to `ContextBuilder.build()` — only the fetch + prompt flag flip are new. Same layering pattern as T27 (recentMessages).

## Architecture Decisions

### Decision 1: Which ContactDirectory port to use

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `inbound-gate` minimal port (`hasAllowedSender` only) | Lacks `findAll()` — no contact listing | Rejected |
| Full port from `contact-directory` module (`findAll()`, `findById()`, `findByWhatsAppId()`, `hasAllowedSender`) | Full contact listing; already seeded with 5 contacts | ✅ **Chosen** |

**Rationale**: The full `ContactDirectory` port at `apps/core/src/modules/contact-directory/application/ports/contact-directory.ts` has `findAll(): Promise<readonly Contact[]>` — the exact method needed. The inbound-gate's minimal `ContactDirectory` only stores a `Set<string>` of allowed IDs and has no listing capability.

### Decision 2: Optional vs required dependency

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Required `contactDirectory` in `ProcessChannelInboundMessageDependencies` | All existing tests break; all callers must update | Rejected |
| Optional `contactDirectory?` in deps | Tests/simulation setups untouched; gracefully absent (no contacts in context) | ✅ **Chosen** |

**Rationale**: Minimizes test impact — 30+ existing tests in `process-channel-inbound-message.test.ts` build `ProcessChannelInboundMessage` directly and would all break with a required dep. The pipeline works without contacts (just no `Contactos conocidos` section).

### Decision 3: Contact filtering

**Choice**: No filtering. Map all contacts from `findAll()` into the `knownContacts` array.

**Rationale**: The `Contact` type (`id`, `displayName`, `whatsappId`) has no `allowed`/`blocked` field. All contacts in the seed directory are implicitly allowed. If an `allowed` field is added later, filtering should happen at this call site before mapping.

### Decision 4: Contact formatting for prompts

**Choice**: `"DisplayName (id: contact-id)"` — e.g. `"María (id: c1)"`.

**Rationale**: The LLM gets a display name for natural language reasoning AND a stable internal ID it can reference in structured output (`recipientHint`). No phone numbers or WhatsApp IDs — privacy minimization.

### Decision 5: When to fetch contacts

| Trigger | Fetch contacts? |
|---------|----------------|
| `mediation_understanding` → `serena.mediation.understand_request` | ✅ Yes |
| `clarification` → `serena.mediation.clarify` | ✅ Yes |
| `conversation` → `serena.conversation.reply` | ❌ No |
| `risk_review` → `serena.risk.review` | ❌ No |
| `discard` / `blocked` (short-circuit) | ❌ N/A — no AI call |

**Rationale**: Only mediation prompts benefit from knowing available contacts (for recipient disambiguation). Conversation and risk review don't need contact lists — avoid leaking them unnecessarily. Fetch happens inside `ProcessChannelInboundMessage.execute()`, just before `aiGuideService.execute()`.

Detection via a `Set` of mediation use case IDs checked after `profileToUseCaseId()`.

### Decision 6: Prompt policy changes

| Prompt file | `includeKnownContacts` |
|-------------|----------------------|
| `mediation-understand-request.v1.ts` | `true` |
| `mediation-clarify.v1.ts` | `true` |
| `conversation-reply.v1.ts` | `false` (unchanged) |
| `risk-review.v1.ts` | `false` (unchanged) |

Guard test `"ALL prompts must have includeKnownContacts=false"` replaced with: "mediation prompts have includeKnownContacts=true, all others remain false".

### Decision 7: Template safety

**Choice**: No change to `renderTemplate()` or `extractStringFields()`. `knownContacts` is an array field already excluded from template extraction (same as `recentMessages`). It flows directly to `ContextBuilder.build()` as a string array value.

**Rationale**: Already implemented in T27 — `extractStringFields()` filters by `typeof value === "string"`, so arrays skip template interpolation. `ContextBuilder` receives `knownContacts: string[]` and joins with `", "`.

### Decision 8: Test strategy

| Test file | Change | Detail |
|-----------|--------|--------|
| `context-policy.test.ts` | Modify guard + add selective tests | Replace blanket `false` guard with selective: mediation prompts assert `true`, others assert `false`. Add individual prompt-level `includeKnownContacts` assertions. |
| `execution-pipeline.test.ts` | Add 3 new tests | Known contacts flows to ContextBuilder (parallel to T27 recentMessages tests), empty array handled, undefined handled. |
| `process-channel-inbound-message.test.ts` | Add 2 new tests | Contacts passed for mediation routes, NOT passed for conversation/risk-review. |

All tests use fakes/mocks only. No real LLM, no real infrastructure.

## Data Flow

```
ContactDirectory (full port, seed: 5 contacts)
    │
    │  findAll() → readonly Contact[]
    │  map: c => `${c.displayName} (id: ${c.id})`
    │
    ▼
ProcessChannelInboundMessage.execute(cmd)
    │
    ├─ identityResolver.resolve()         (existing)
    ├─ conversationStore.listMessages()   (existing — recentMessages)
    │
    ├─ processInboundMessage.execute()    (existing — gate/route)
    │
    ├─ [if mediation route]:
    │     contactDirectory.findAll()  ← NEW
    │     → map to "Name (id: cid)"
    │     → knownContacts: string[]
    │
    │  [else]:
    │     knownContacts = []          ← NEW (or undefined)
    │
    └─ aiGuideService.execute(useCaseId, {
         input, actorRole, channel, resolvedIdentity, recentMessages,
         knownContacts              ← NEW (string[] or undefined)
       })
         │
         └─ pipeline.execute(contract, input)
              │
              └─ buildUserPrompt(promptDef, input)
                   │
                   ├─ extractStringFields(input) → renderTemplate()
                   │
                   └─ contextBuilder.build(policy, {
                        currentMessage, resolvedIdentity, recentMessages,
                        knownContacts: input.knownContacts  (already wired)
                      })
                        │
                        └─ [if includeKnownContacts=true + knownContacts.length>0]
                             └─ "Contactos conocidos: María (id: c1), Carlos (id: c2), ..."
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modify | Add optional `contactDirectory` dep; import `ContactDirectory` type from contact-directory module; fetch + map contacts for mediation routes; pass `knownContacts` in aiGuideService call |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Return `contactDirectory` from factory (already constructed for orchestrator; just expose it) |
| `apps/core/src/server.ts` | Modify | Pass `contactDirectory` to `ProcessChannelInboundMessage` constructor |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` | Modify | `includeKnownContacts: false` → `true` |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-clarify.v1.ts` | Modify | `includeKnownContacts: false` → `true` |
| `apps/core/src/modules/ai-guide/tests/context-policy.test.ts` | Modify | Replace blanket `false` guard; add selective `true`/`false` assertions per prompt |
| `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` | Modify | Add `knownContacts` flow tests (with contacts, empty array, undefined) |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Modify | Add mediation contact wiring test; verify no contacts in non-mediation routes |

## Interfaces / Contracts

```typescript
// New optional dependency in ProcessChannelInboundMessageDependencies
export type ProcessChannelInboundMessageDependencies = {
  // ... existing deps ...
  /** Optional — when provided, known contacts are fetched and passed to AI guide for mediation routes. */
  contactDirectory?: ContactDirectory;
};

// Import in process-channel-inbound-message.ts
import type { ContactDirectory } from "../../contact-directory/application/ports/contact-directory.ts";

// Mediation route detection (private helper)
const MEDIATION_USE_CASES = new Set<GuideUseCaseId>([
  "serena.mediation.understand_request",
  "serena.mediation.clarify",
]);

// Factory return type change
export async function createInMemoryPipeline(): Promise<{
  // ... existing fields ...
  contactDirectory: InMemoryContactDirectory;  // NEW
}>
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — ContextPolicy | Guard: mediation prompts `includeKnownContacts=true`, others `false` | Modify `context-policy.test.ts` guard loop; add per-prompt assertions |
| Unit — ExecutionPipeline | `knownContacts` flows to `ContextBuilder.build()`; empty array omits section; undefined handled | Spy on provider's invoke to capture userPrompt; assert "Contactos conocidos" presence/absence |
| Unit — ProcessChannelInboundMessage | Contacts appear in AI guide input for mediation routes; absent for conversation/risk-review | Mock `ContactDirectory` with 2 contacts; spy on `aiGuideService.execute()`; assert `knownContacts` in input |
| Regression | All existing tests pass | `npm run check` |

## Migration / Rollout

No data migration required. Rollback plan:
1. Revert 2 prompt definitions: `includeKnownContacts: false` on mediation prompts
2. Remove `contactDirectory` dependency from `ProcessChannelInboundMessage` and `server.ts`
3. Revert guard test to blanket `false`
4. Full `git revert` if needed

## Open Questions

- None — all blocking decisions resolved.
