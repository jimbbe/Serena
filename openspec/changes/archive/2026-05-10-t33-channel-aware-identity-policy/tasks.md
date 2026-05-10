# Tasks: T33 — Channel-Aware Identity Policy

## Phase 1: Data Model & Ports

- [x] 1.1 `shared/channel.ts` — Add `ChannelBinding` type with `channel`, `externalId`, `ownerPersonId`, `role`, `authorized`, `bindingKind`
- [x] 1.2 `contact-directory/domain/contact.ts` — Add optional `externalBindings?: ChannelBinding[]` to `Contact`; keep `whatsappId`
- [x] 1.3 `contact-directory/application/ports/contact-directory.ts` — Add `findByChannelBinding(channel, externalId)` returning `Contact | undefined`

## Phase 2: Infrastructure

- [x] 2.1 `in-memory-contact-directory.ts` — Index contacts by normalized `channel:externalId`; derive WhatsApp binding from `whatsappId`
- [x] 2.2 `contacts.seed.json` — Add `externalBindings` for WhatsApp contacts (María, Carlos, Juan, José, José María) + elder voice device + elder web_chat session
- [x] 2.3 `in-memory-external-identity-resolver.ts` — Accept binding entries from constructor; keep override support; remove hardcoded demo branching
- [x] 2.4 `create-in-memory-pipeline.ts` — Prime identity resolver from contact bindings + explicit elder device binding (voice + web_chat)

## Phase 3: Policy Gate

- [x] 3.1 `process-channel-inbound-message.ts` — After profile selection, gate: unknown identity blocked from mediation/clarification profiles → force to conversation. Keep risk_review allowed for all.

## Phase 4: Tests

- [x] 4.1 New `inbound-gate/tests/identity-resolution.test.ts` — WhatsApp contact resolved (DR1), elder on voice (DR3), elder on web_chat (DR3), unknown WhatsApp (DR2), unknown voice (DR4), blocked (DR1)
- [x] 4.2 `mediation-flow/__tests__/integration-scenarios.test.ts` — Scenario: unknown WhatsApp cannot create mediation flow (DR2, AC2)
- [x] 4.3 `mediation-flow/__tests__/integration-scenarios.test.ts` — Scenario: unknown voice cannot create mediation flow (DR4, AC4)
- [x] 4.4 `mediation-flow/__tests__/integration-scenarios.test.ts` — Scenario: resolved elder on voice starts T32 mediation flow (DR3, AC3, T32 compatibility)

## Phase 5: Validation

- [x] 5.1 Run `npm run check` — all tests pass, no TS errors, no regressions in T32 behavior
- [x] 5.2 Update `state.yaml` — set status to `tasks-complete`, update artifacts list
