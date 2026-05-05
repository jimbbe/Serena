# Tasks: T28 — Wire Known Contacts into AI Guide Mediation Context

## Phase 1: Prompt Definitions

- [x] 28.1 Flip `includeKnownContacts: false` → `true` in `mediation-understand-request.v1.ts` contextPolicy.
- [x] 28.2 Flip `includeKnownContacts: false` → `true` in `mediation-clarify.v1.ts` contextPolicy.

## Phase 2: Core Implementation — Inbound Gate Wiring

- [x] 28.3 Add optional `contactDirectory?: ContactDirectory` to `ProcessChannelInboundMessageDependencies` (import full port from `contact-directory` module, NOT inbound-gate minimal port).
- [x] 28.4 Add `contactDirectory` private field and store in `ProcessChannelInboundMessage` constructor.
- [x] 28.5 Add `MEDIATION_USE_CASES` Set constant (`"serena.mediation.understand_request"`, `"serena.mediation.clarify"`) in `process-channel-inbound-message.ts`.
- [x] 28.6 In `execute()`, after `profileToUseCaseId()` and before `aiGuideService.execute()`, add conditional: if `MEDIATION_USE_CASES.has(useCaseId)` AND `contactDirectory` is defined, call `contactDirectory.findAll()`, map to `"${c.displayName} (id: ${c.id})"`, store as `knownContacts`; else `knownContacts = undefined`.
- [x] 28.7 Pass `knownContacts` in the `aiGuideService.execute()` call alongside existing `recentMessages`, `actorRole`, `channel`, `resolvedIdentity`.

## Phase 3: Factory / Bootstrap

- [x] 28.8 Update `createInMemoryPipeline()` return type to include `contactDirectory: InMemoryContactDirectory` (from contact-directory module, already constructed at line ~70).
- [x] 28.9 Update `server.ts` destructuring to extract `contactDirectory` from `createInMemoryPipeline()`.
- [x] 28.10 Pass `contactDirectory` to `ProcessChannelInboundMessage` constructor in `server.ts`.

## Phase 4: Testing — Context Policy

- [x] 28.11 Replace guard test `"ALL prompts must have includeKnownContacts=false"` in `context-policy.test.ts` with: mediation prompts assert `true`, non-mediation prompts assert `false`.
- [x] 28.12 Update `serena.mediation.understand_request` individual test: assert `includeKnownContacts: true` (was `false`).
- [x] 28.13 Update `serena.mediation.clarify` individual test: assert `includeKnownContacts: true` (was `false`).

## Phase 5: Testing — Execution Pipeline

- [x] 28.14 Add test: `knownContacts` flows to ContextBuilder and renders "Contactos conocidos" section in userPrompt when `includeKnownContacts: true`.
- [x] 28.15 Add test: empty `knownContacts: []` does NOT add "Contactos conocidos" section even when `includeKnownContacts: true`.
- [x] 28.16 Add test: `knownContacts` and `recentMessages` coexist — both sections present when both policies enabled.
- [x] 28.17 Add test: `includeKnownContacts: false` omits section even with `knownContacts` populated.

## Phase 6: Testing — ProcessChannelInboundMessage

- [x] 28.18 Add test: mediation route (`mediation_understanding`) → `aiGuideService.execute()` receives `knownContacts` with formatted contacts from mock `ContactDirectory`.
- [x] 28.19 Add test: mediation route (`clarification`) → `aiGuideService.execute()` receives `knownContacts`.
- [x] 28.20 Add test: non-mediation route (`conversation`) → `aiGuideService.execute()` does NOT receive `knownContacts` (or receives `undefined`).
- [x] 28.21 Add test: non-mediation route (`risk_review`) → `aiGuideService.execute()` does NOT receive `knownContacts`.
- [x] 28.22 Add test: `contactDirectory` not provided → mediation route still works, `knownContacts` is `undefined` (graceful degradation).
- [x] 28.23 Add test: blocked identity → `contactDirectory.findAll()` NOT called, `aiGuideService.execute()` NOT called.
- [x] 28.24 Add test: discard route → `contactDirectory.findAll()` NOT called, `aiGuideService.execute()` NOT called.

## Phase 7: Documentation & Validation

- [x] 28.25 Update `docs/ai-guide-prompts.md`: document `includeKnownContacts: true` on mediation prompts, explain contact format.
- [x] 28.26 Update `docs/project-status.md`: mark T28 as complete.
- [x] 28.27 Run `npm run check` — must pass (type check, lint).
- [x] 28.28 Run `npm test` — must pass (all existing + new tests).
