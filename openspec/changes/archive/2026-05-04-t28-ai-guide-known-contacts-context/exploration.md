# Exploration: T28 — Wire Known Contacts into AI Guide Mediation Context

## 1. ContactDirectory Module

### Port Interface
**File**: `apps/core/src/modules/contact-directory/application/ports/contact-directory.ts`

```typescript
export type ContactDirectory = {
  hasAllowedSender(normalizedSenderId: string): Promise<boolean>;
  findByWhatsAppId(whatsappId: string): Promise<Contact | undefined>;
  findById(id: string): Promise<Contact | undefined>;
  findAll(): Promise<readonly Contact[]>;
};
```

4 methods. `findAll()` is the key one for T28 — returns all contacts as `Contact[]`.

### Domain Type
**File**: `apps/core/src/modules/contact-directory/domain/contact.ts`

```typescript
export type Contact = {
  id: string;
  displayName: string;
  whatsappId: string;
};
```

Only 3 fields. No `allowed`/`blocked` flags — all contacts in the directory are implicitly allowed.

### In-Memory Adapter
**File**: `apps/core/src/modules/contact-directory/infrastructure/memory/in-memory-contact-directory.ts`

- Constructor takes `Contact[]` (loaded from seed JSON)
- Builds `byId` and `byWhatsAppId` Maps for O(1) lookups
- `findAll()` returns the original array (immutable copy in constructor)
- All normalization is `trim().toLocaleLowerCase()`

### Seed Data
**File**: `apps/core/src/modules/contact-directory/infrastructure/seed/contacts.seed.json`

5 contacts: María, Carlos, Juan, José, José María — each with id (c1-c5) and whatsappId.

### Exports
No barrel/index file. Imports are direct from subpaths:
- `import { InMemoryContactDirectory, loadContactsFromSeed } from ".../infrastructure/memory/in-memory-contact-directory.ts"`
- `import { ResolveContact } from ".../application/use-cases/resolve-contact.ts"`

### Tests
**File**: `apps/core/src/modules/contact-directory/tests/contact-directory.test.ts`
- 16 tests covering all methods, edge cases, normalization, ResolveContact use case
- Uses inline contact arrays (not seed file) for isolation

### ⚠️ GOTCHA: Two ContactDirectory implementations
There are TWO separate `ContactDirectory` ports with different shapes:
1. **contact-directory module** (full): `findAll`, `findById`, `findByWhatsAppId`, `hasAllowedSender`
2. **inbound-gate module** (minimal): only `hasAllowedSender`

The inbound-gate has its own `InMemoryContactDirectory` at `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-contact-directory.ts` that only stores a `Set<string>` of allowed IDs. This is used by the gate evaluator, NOT for contact listing.

For T28, we need the **full** `ContactDirectory` from the contact-directory module.

---

## 2. ProcessChannelInboundMessage

**File**: `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts`

### Constructor Dependencies
```typescript
export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  identityResolver: ExternalIdentityResolver;
  conversationStore: ConversationStore;
  generateTraceId?: () => string;
};
```

### AiGuideService Invocation (lines 197-205)
```typescript
guideResult = await this.aiGuideService.execute(useCaseId, {
  input: cmd.text,
  actorRole: identity.role ?? "unknown",
  resolvedIdentity: identity.displayName ?? identity.personId ?? cmd.externalSenderId,
  channel: cmd.channel,
  tenantId: cmd.tenantId ?? "demo",
  personId: identity.personId ?? "",
  recentMessages,
});
```

**No `knownContacts` is passed currently.** This is the injection point.

### Routing Paths
1. **blocked identity** → short-circuit, no AI (line 133)
2. **discard** → no AI guide (line 168)
3. **llm_profile_required** → maps profileId to useCaseId via `profileToUseCaseId()`, then calls aiGuideService (line 191-205)

The 4 routes map to:
- `conversation` → `serena.conversation.reply`
- `mediation_understanding` → `serena.mediation.understand_request`
- `clarification` → `serena.mediation.clarify`
- `risk_review` → `serena.risk.review`

### Where to Inject knownContacts
The ideal injection point is in the `aiGuideService.execute()` call (line 197). The `ProcessChannelInboundMessage` would need a new dependency: `ContactDirectory` (the full one from contact-directory module). It would call `contactDirectory.findAll()`, map to `displayName[]`, and pass as `knownContacts`.

---

## 3. AiGuideService

**File**: `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-service.ts`

```typescript
async execute(useCaseId: GuideUseCaseId, input: AiGuideInput): Promise<GuideResult>
```

Simple delegation: resolves use case from registry, passes to `pipeline.execute(contract, input)`. Does NOT transform input — it passes through verbatim.

### AiGuideInput Type
**File**: `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts`

```typescript
export type AiGuideInput = {
  input: string;
  actorRole?: string;
  channel?: string;
  resolvedIdentity?: string;
  recentMessages?: string[];
  knownContacts?: string[];
  safetyMemory?: string;
  [key: string]: string | string[] | undefined;
};
```

`knownContacts?: string[]` already exists. The index signature allows `string | string[] | undefined` values.

### How knownContacts is handled
AiGuideService does NOT handle it — it's a pass-through. The handling happens in ExecutionPipeline.

---

## 4. ExecutionPipeline

**File**: `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts`

### buildUserPrompt() (lines 285-325)
Already handles `knownContacts`:
```typescript
const contextString = this.contextBuilder.build(promptDef.contextPolicy, {
  currentMessage,
  resolvedIdentity: input["resolvedIdentity"],
  actorContext,
  channelMetadata: input["channel"],
  recentMessages: input.recentMessages,
  knownContacts: input.knownContacts,     // ← ALREADY WIRED
  safetyMemory: input.safetyMemory,
});
```

The pipeline already passes `knownContacts` from input to ContextBuilder. The gap is that `ProcessChannelInboundMessage` doesn't populate it.

### Template extraction (lines 290-296)
Only extracts string fields (`input`, `actorRole`, `channel`, `resolvedIdentity`) for `renderTemplate()`. Array fields like `knownContacts` bypass template and go directly to ContextBuilder — correct behavior.

---

## 5. ContextBuilder

**File**: `apps/core/src/modules/ai-guide/application/prompts/context-builder.ts`

### includeKnownContacts flag (line 75-77)
```typescript
if (policy.includeKnownContacts && data.knownContacts && data.knownContacts.length > 0) {
  sections.push(`Contactos conocidos: ${data.knownContacts.join(", ")}`);
}
```

### Render format
Plain text: `Contactos conocidos: María, Carlos, Juan`

Simple comma-joined list. No special formatting, no IDs — just display names.

---

## 6. Prompt Definitions

### Current ContextPolicy Values

| Prompt | includeKnownContacts | includeSafetyMemory | includeFullConversation |
|--------|---------------------|---------------------|------------------------|
| mediation-understand-request.v1 | **false** | false | false |
| mediation-clarify.v1 | **false** | false | false |
| conversation-reply.v1 | **false** | false | false |
| risk-review.v1 | **false** | false | false |

ALL 4 prompts have `includeKnownContacts: false`.

### ContextPolicy Type
**File**: `apps/core/src/modules/ai-guide/domain/context-policy.ts`

```typescript
export type ContextPolicy = {
  includeCurrentMessage: boolean;
  includeResolvedIdentity: boolean;
  includeActorContext: boolean;
  includeChannelMetadata: boolean;
  includeConversationHistory: boolean;
  maxRecentMessages?: number;
  includeKnownContacts: boolean;
  includeSafetyMemory: boolean;
  includeFullConversation: boolean;
  notes?: string;
};
```

---

## 7. Existing Tests

### context-policy.test.ts
- Tests all 4 prompts individually for Phase 1 values
- Guard test: ALL prompts must have `includeKnownContacts: false` (line 104-112) — this guard MUST be flipped to `true` for T28
- Global tests: `includeFullConversation` false for all, valid structure

### execution-pipeline.test.ts
- 28 tests covering success/failure paths, audit, retry, output contract validation
- T27 conversation history tests (lines 615-798): verify `recentMessages` flows through pipeline
- Mocks: `MockLlmProvider`, `InMemoryPromptRegistry`, `ContextBuilder` (real instance)
- No existing `knownContacts` tests

### process-channel-inbound-message.test.ts
- 35+ tests covering all routing paths, identity resolution, conversation store
- Uses mock AiGuideService (inline `{ execute: async ... }`)
- `createRealAiGuideService()` helper creates real AiGuideService with MockLlmProvider
- Mock ConversationStore with `findOrCreateCalls`, `appendCalls`, `listMessages`
- No existing `knownContacts` tests

### context-builder.test.ts
- 11 tests covering all ContextBuilder functionality
- Already has test with `knownContacts: ["Carlos", "María"]` (line 32) — verifies rendering works
- Test for missing knownContacts (line 50-61) — verifies graceful omission

---

## 8. Factory/Bootstrap

### createInMemoryPipeline
**File**: `apps/core/src/bootstrap/create-in-memory-pipeline.ts`

Returns: `{ orchestrator, bridgeStore, processedMessageStore, aiGuideService, processInboundMessage, identityResolver, conversationStore }`

Already loads contacts from seed:
```typescript
const contacts = await loadContactsFromSeed();
const contactDirectory = new InMemoryContactDirectory(contacts);
const resolveContact = new ResolveContact({ contactDirectory });
```

But `contactDirectory` is NOT returned from the factory. It's only used internally by the orchestrator (`ProcessIncomingWhatsAppMessage`).

### server.ts
**File**: `apps/core/src/server.ts` (lines 21-26)

```typescript
const processChannelInboundMessage = new ProcessChannelInboundMessage({
  processInboundMessage,
  aiGuideService,
  identityResolver,
  conversationStore,
});
```

This is where `ProcessChannelInboundMessage` is instantiated. To add `knownContacts`, this would need the `ContactDirectory` dependency.

---

## 9. OpenSpec Structure (T27 Archive)

**Directory**: `openspec/changes/archive/2026-05-04-t27-ai-guide-conversation-history/`

Files:
- `proposal.md` — Intent, scope, approach, affected areas, risks, rollback
- `design.md` — Technical decisions with tradeoff tables, data flow diagram, file changes table
- `tasks.md` — Implementation checklist
- `archive-report.md` — Post-completion verification
- `specs/ai-guide-conversation-history/spec.md` — Capability spec
- `specs/ai-guide-service/spec.md` — Modified capability spec
- `specs/ai-guide-pipeline/spec.md` — Modified capability spec
- `specs/inbound-gate/spec.md` — Modified capability spec

Pattern: proposal → design → specs (multiple) → tasks → archive-report

---

## Approaches for T28

### Approach 1: Add ContactDirectory to ProcessChannelInboundMessage (Recommended)
- Add `contactDirectory: ContactDirectory` to `ProcessChannelInboundMessageDependencies`
- In `execute()`, call `contactDirectory.findAll()` and map to `displayName[]`
- Pass as `knownContacts` in `aiGuideService.execute()` call
- Flip `includeKnownContacts: true` on mediation-understand-request and mediation-clarify prompts
- Update guard test in context-policy.test.ts
- Add tests

**Pros**: Clean, follows same pattern as T27 (recentMessages), minimal changes
**Cons**: Adds async call to the hot path (findAll is O(1) in-memory but still async)
**Effort**: Low

### Approach 2: Pre-compute knownContacts in createInMemoryPipeline
- Have `createInMemoryPipeline` return `knownContacts: string[]` (pre-computed from seed)
- Pass to `ProcessChannelInboundMessage` constructor as static config
- No async call in execute()

**Pros**: No async overhead in hot path
**Cons**: Less flexible — contacts are static, can't change at runtime; breaks clean architecture (passing data instead of port)
**Effort**: Low

### Approach 3: Wire ContactDirectory only for specific prompts
- Only flip `includeKnownContacts: true` on mediation-understand-request (the prompt that needs to know who to send messages to)
- Leave other prompts as-is

**Pros**: Minimal scope, focused on the most valuable use case
**Cons**: Inconsistent across prompts; clarification might also benefit
**Effort**: Low

---

## Recommendation

**Approach 1 + Approach 3 hybrid**: Wire `ContactDirectory` into `ProcessChannelInboundMessage` (Approach 1), but only activate `includeKnownContacts: true` on `mediation-understand-request.v1` and `mediation-clarify.v1` (Approach 3). The mediation understanding prompt needs to know who the sender might be referring to. The clarification prompt might need it to suggest contacts. Conversation reply and risk review don't need contact lists.

---

## Risks

1. **Guard test flip**: The existing guard test at line 104-112 of `context-policy.test.ts` asserts ALL prompts must have `includeKnownContacts: false`. This must be updated to check specific prompts have `true` and others remain `false`.
2. **Async call in hot path**: `contactDirectory.findAll()` is called on every message. In-memory it's O(1) but still adds an async tick. Could be cached if needed later.
3. **Two ContactDirectory ports**: Need to be careful to import the full port from `contact-directory` module, not the minimal one from `inbound-gate`.
4. **Factory return**: `createInMemoryPipeline` needs to return `contactDirectory` so `server.ts` can pass it to `ProcessChannelInboundMessage`.
5. **No contact-directory barrel exports**: All imports are direct subpaths — no `index.ts` barrel files. Must follow existing import patterns.

## Ready for Proposal

**Yes**. The codebase is well-structured for this change. The infrastructure (AiGuideInput, ExecutionPipeline, ContextBuilder) already supports `knownContacts`. The only gaps are:
1. Wire `ContactDirectory` into `ProcessChannelInboundMessage`
2. Fetch and pass `knownContacts` in the aiGuideService call
3. Flip `includeKnownContacts: true` on relevant prompts
4. Update guard tests and add wiring tests
