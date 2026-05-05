# Apply Progress: T28 — All Batches Complete

## Status: ALL 28/28 tasks complete ✅

## Batch 1 — Completed Tasks (10/10)

### Phase 1: Prompt Definitions
- [x] 28.1 Flip `includeKnownContacts: false` → `true` in `mediation-understand-request.v1.ts`
- [x] 28.2 Flip `includeKnownContacts: false` → `true` in `mediation-clarify.v1.ts`

### Phase 2: Core Implementation — Inbound Gate Wiring
- [x] 28.3 Add `contactDirectory?: ContactDirectory` to deps + import from contact-directory module
- [x] 28.4 Add `contactDirectory` private field and constructor assignment
- [x] 28.5 Add `MEDIATION_USE_CASES` Set constant (module-level)
- [x] 28.6 Add conditional: fetch contacts from `contactDirectory.findAll()`, map to `"Name (id: cid)"` format
- [x] 28.7 Pass `knownContacts` in `aiGuideService.execute()` call

### Phase 3: Factory / Bootstrap
- [x] 28.8 Add `contactDirectory: InMemoryContactDirectory` to `createInMemoryPipeline()` return type
- [x] 28.9 Update `server.ts` destructuring to extract `contactDirectory`
- [x] 28.10 Pass `contactDirectory` to `ProcessChannelInboundMessage` constructor

## Batch 1 — Files Modified

| File | Change Summary |
|------|---------------|
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-understand-request.v1.ts` | `includeKnownContacts: false` → `true` |
| `apps/core/src/modules/ai-guide/application/prompts/definitions/mediation-clarify.v1.ts` | `includeKnownContacts: false` → `true` |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Added `ContactDirectory` import, optional dep, `MEDIATION_USE_CASES` set, knownContacts fetch + pass-through to AI guide |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Added `contactDirectory` to return type and return object |
| `apps/core/src/server.ts` | Destructure + inject `contactDirectory` into `ProcessChannelInboundMessage` |

## Batch 2 — Completed Tasks (14/14)

### Phase 4: Testing — Context Policy
- [x] 28.11 Replace guard test `"ALL prompts must have includeKnownContacts=false"` → selective assertions (mediation=true, others=false)
- [x] 28.12 Update `mediation.understand_request` individual test: assert `includeKnownContacts: true`
- [x] 28.13 Update `mediation.clarify` individual test: assert `includeKnownContacts: true`

### Phase 5: Testing — Execution Pipeline
- [x] 28.14 Test: `knownContacts` flows to ContextBuilder, renders "Contactos conocidos" when `includeKnownContacts: true`
- [x] 28.15 Test: empty `knownContacts: []` does NOT add section
- [x] 28.16 Test: `includeKnownContacts: false` omits section even with contacts
- [x] 28.17 Test: `recentMessages` and `knownContacts` coexist without breaking

### Phase 6: Testing — ProcessChannelInboundMessage
- [x] 28.18 Test: `mediation_understanding` route → `knownContacts` passed with formatted contacts
- [x] 28.19 Test: `clarification` route → `knownContacts` passed
- [x] 28.20 Test: `conversation` route → `knownContacts` NOT passed (`[]` or `undefined`)
- [x] 28.21 Test: `risk_review` route → `knownContacts` NOT passed
- [x] 28.22 Test: `contactDirectory` not provided → mediation works gracefully (no contacts)
- [x] 28.23 Test: blocked identity → `findAll()` NOT called, AI NOT called
- [x] 28.24 Test: discard route → `findAll()` NOT called, AI NOT called

## Batch 2 — Files Modified

| File | Change Summary |
|------|---------------|
| `apps/core/src/modules/ai-guide/tests/context-policy.test.ts` | Replaced blanket `false` guard with selective assertions; updated individual mediation tests to `true` |
| `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` | Added 4 T28 tests: contacts rendering, empty contacts, contacts disabled, coexistence with recentMessages |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | Added `ContactDirectory` import; added 7 T28 tests: mediation routes pass contacts, non-mediation don't, graceful degradation, short-circuits |

## Batch 3 — Completed Tasks (4/4) ✅

### Phase 7: Documentation & Validation
- [x] 28.25 Update `docs/ai-guide-prompts.md` — ContextPolicy table updated, T28 note added
- [x] 28.26 Update `docs/project-status.md` — T28 section added, test count updated
- [x] 28.27 `npm run check` — PASSES (typecheck all projects clean)
- [x] 28.28 `npm test` — PASSES: 496 tests (458 core + 38 gateway-wa)

## Batch 3 — Files Modified

| File | Change Summary |
|------|---------------|
| `docs/ai-guide-prompts.md` | ContextPolicy table: mediation contacts ❌→✅; added T28 note; updated Restricciones MVP section |
| `docs/project-status.md` | Added T28 section; updated Current Phase; test count 485→496 |
| `README.md` | Updated Current Phase to mention T28; test count 485→496 |
| `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Fixed `exactOptionalPropertyTypes` error: `contactDirectory?: ContactDirectory` → `contactDirectory: ContactDirectory \| undefined` |
| `openspec/changes/t28-ai-guide-known-contacts-context/tasks.md` | Marked 28.25–28.28 as complete |

## Validation Results

- **`npm run check`**: PASS (structure check + typecheck core + typecheck gateway-wa + typecheck scripts)
- **`npm test`**: 496 tests pass, 0 failures (458 core + 38 gateway-wa)

## Fixes Applied During Validation

- **TypeScript `exactOptionalPropertyTypes` error**: Changed field declaration from `private readonly contactDirectory?: ContactDirectory` to `private readonly contactDirectory: ContactDirectory | undefined` to satisfy strict optional property type checking. The `?` syntax with `exactOptionalPropertyTypes: true` makes the property type strictly `ContactDirectory` (not `ContactDirectory | undefined`), causing assignment from `deps.contactDirectory?` to fail.

## Test Details

### Context Policy (3 tests modified)
- Guard test renamed and logic flipped: mediation prompts assert `true`, others `false`
- `mediation.understand_request` individual test: `includeKnownContacts` → `true`
- `mediation.clarify` individual test: `includeKnownContacts` → `true`
- `conversation.reply` and `risk.review` tests: unchanged (`false`)

### Execution Pipeline (4 tests added)
- **28.14**: Uses `mediation.understand_request.v1` (real default prompt), passes `knownContacts: string[]`, spies on `req.userPrompt`. Asserts `"Contactos conocidos"`, `"María (id: c1)"`, `"Carlos (id: c2)"` present.
- **28.15**: Same prompt, `knownContacts: []`. Asserts `"Contactos conocidos"` absent.
- **28.16**: Uses `conversation.reply.v1` (`includeKnownContacts: false`), passes contacts. Asserts section absent.
- **28.17**: Uses `mediation.understand_request.v1` (both policies true), passes both `recentMessages` and `knownContacts`. Asserts both `"Historial reciente"` and `"Contactos conocidos"` present.

### ProcessChannelInboundMessage (7 tests added)
- **28.18/28.19**: Inline mock `ContactDirectory` with `findAll()` spy; `aiGuideService.execute()` spy captures input. Asserts `knownContacts` array with correct format `"Name (id: cid)"`.
- **28.20/28.21**: Same setup but `conversation`/`risk_review` routes. Asserts `findAll()` NOT called and `knownContacts` empty/undefined.
- **28.22**: `contactDirectory` omitted from constructor. Mediation route still succeeds; `knownContacts` empty.
- **28.23**: Blocked identity resolver. Both `findAll()` and `aiGuideService.execute()` NOT called.
- **28.24**: Discard route. Both `findAll()` and `aiGuideService.execute()` NOT called.
