# Exploration: T33 — Channel-Aware Identity Policy

## Current State

### Channel Architecture

The system has a channel-agnostic inbound pipeline defined in T20:

- **`InboundChannel`** (`apps/core/src/modules/shared/channel.ts`): union of `"whatsapp" | "voice" | "web_chat" | "telegram" | "system" | "simulation"` — 6 channels.
- **`InboundMessageCommand`** (`inbound-gate/domain/inbound-message-command.ts`): channel-agnostic input with `channel`, `externalSenderId`, `text`, optional `tenantId`, `personId`, `conversationId`, `occurredAt`, `metadata`.
- **`ResolvedInboundActor`** (`channel-inbound/application/results/resolved-inbound-actor.ts`): maps external identity → internal identity with `status`, `tenantId`, `channel`, `externalSenderId`, `personId`, `actorId`, `role`, `displayName`, `authorized`, `reason`.
- **`ExternalIdentityResolver`** port (`inbound-gate/application/ports/external-identity-resolver.ts`): `resolve(cmd: InboundMessageCommand) → Promise<ResolvedInboundActor>`.

### Identity Resolution (Current)

**`InMemoryExternalIdentityResolver`** (`inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts`):
- Key format: `tenantId:channel:externalSenderId`
- Default demo data: Marta (elder_001) on 3 channels (whatsapp, voice, web_chat) + 1 blocked sender
- Constructor accepts optional `extraEntries` to extend/override

**`createInMemoryPipeline()`** (`bootstrap/create-in-memory-pipeline.ts`):
- Primes identity resolver with contacts from seed (María, Carlos, Juan, José, José María) — **WhatsApp only** (`demo:whatsapp:{whatsappId}`), role `"contact"`
- Adds `elder_001` and contact IDs to inbound gate's allowed sender list
- Mediation flow store, conversation store, and contact directory are all wired

### Contact Domain

**`Contact`** type (`contact-directory/domain/contact.ts`):
```typescript
{ id: string; displayName: string; whatsappId: string }
```
- **WhatsApp-specific**: `whatsappId` is the only external identifier field
- No `channel` field, no multi-channel binding concept

**Seed data** (`contact-directory/infrastructure/seed/contacts.seed.json`):
- 5 contacts: María (c1), Carlos (c2), Juan (c3), José (c4), José María (c5)
- All have WhatsApp IDs only (e.g., `"5491111111111"`)

### T32 Mediation Flow (Already Implemented)

- `MediationFlowStore` port + `InMemoryMediationFlowStore` adapter
- `MediationFlowState`: `idle | clarifying | confirming | paused | resolved`
- `ProcessChannelInboundMessage` integrates flow checks at points [A] (before gate) and [B] (after AI guide)
- 100 simulation acceptance tests passing
- `ChannelInboundResult` includes `flowState` and `promptText` fields

### Simulation API

- `POST /dev/simulate/inbound-message` — single-step pipeline execution
- `POST /dev/simulate/scenario` — multi-step scenario runner with state propagation
- Both use `ProcessChannelInboundMessage` under the hood
- Scenario runner auto-propagates `conversationId` between steps
- T32 flow state is already propagated between steps

### Test Baseline

- **578 tests passing** (519 core + 59 gateway-wa)
- Key test files:
  - `inbound-gate/tests/in-memory-external-identity-resolver.test.ts` — 7 tests for identity resolution
  - `inbound-gate/tests/process-channel-inbound-message.test.ts` — 40+ tests for pipeline with identity
  - `mediation-flow/__tests__/simulation-acceptance.test.ts` — 100 tests for T32 flow
  - `bootstrap/tests/scenario-endpoint.test.ts` — HTTP integration tests for scenario runner

## Affected Areas

| File | Why Affected |
|------|-------------|
| `contact-directory/domain/contact.ts` | `Contact` type is WhatsApp-only; needs channel-agnostic external ID model |
| `contact-directory/infrastructure/seed/contacts.seed.json` | Seed data has only WhatsApp IDs; needs multi-channel bindings |
| `contact-directory/application/ports/contact-directory.ts` | Port methods are WhatsApp-specific (`findByWhatsAppId`, `hasAllowedSender`) |
| `contact-directory/infrastructure/memory/in-memory-contact-directory.ts` | Indexes only by WhatsApp ID; needs channel-aware indexing |
| `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | Demo data has hardcoded voice/web_chat entries; should derive from contact bindings |
| `bootstrap/create-in-memory-pipeline.ts` | Primes identity resolver only for WhatsApp contacts; needs multi-channel priming |
| `inbound-gate/application/results/channel-inbound-result.ts` | May need outbound draft channel info for T33 outbound work |
| `channel-inbound/application/use-cases/process-channel-inbound-message.ts` | May need to carry channel info into outbound draft decisions |

## Approaches

### Approach A: Reuse Existing Channels + Enrich Contact Model

**Description**: Keep the 6 existing `InboundChannel` values. Enrich the `Contact` domain to support multi-channel bindings (WhatsApp ID, voice device IDs, web chat session IDs). Update the identity resolver to derive from contact bindings instead of hardcoded demo data.

**Changes**:
1. `Contact` type gains `channelBindings: ChannelBinding[]` (or similar) alongside existing `whatsappId` (backward-compatible)
2. `contacts.seed.json` gains voice device IDs and web chat session IDs for contacts
3. `InMemoryContactDirectory` indexes by `(channel, externalSenderId)` tuple
4. `InMemoryExternalIdentityResolver` derives entries from contact bindings at construction
5. `createInMemoryPipeline()` primes all channel bindings, not just WhatsApp
6. Outbound draft gets `targetChannel` field from the inbound channel or flow context

**Pros**:
- Zero changes to `InboundChannel` union — no migration risk
- Identity resolution becomes truly data-driven (contact bindings → identity entries)
- Existing tests need minimal updates (mock shapes unchanged)
- T32 mediation flow tests are completely unaffected
- Outbound draft naturally knows which channel to target

**Cons**:
- `Contact` domain changes may ripple to contact-directory tests
- Need to maintain backward compatibility for `whatsappId` field
- Seed data enrichment needs realistic device/session IDs

**Effort**: Medium

### Approach B: Add New Channel (`elder_device`)

**Description**: Add a new `InboundChannel` value `"elder_device"` to represent device-mediated communication from the elder. This creates a dedicated channel for voice assistant / IoT device interactions.

**Changes**:
1. `InboundChannel` gains `"elder_device"` — 7 values total
2. All `VALID_CHANNELS` arrays in simulation handler, scenario handler need updating
3. All tests that enumerate channels need updating
4. `Contact` domain may still need enrichment for device bindings
5. `InMemoryExternalIdentityResolver` demo data updated
6. All channel-aware modules need to handle the new value

**Pros**:
- Semantically distinct channel for device-mediated elder communication
- Clear separation between "voice call" and "IoT device" concepts

**Cons**:
- `InboundChannel` union change ripples to every file that imports it
- Simulation handler, scenario handler, and all validation arrays need updating
- Test files that enumerate channels (e.g., `process-channel-inbound-message.test.ts` line 1295) need updating
- `ChannelInboundResult.channel` type widens — downstream consumers may need updates
- `voice` channel already exists and covers the semantic space
- Migration cost: ~15-20 files touched for a type union addition

**Effort**: Medium-High

### Approach C: Refactor Identity Model Only

**Description**: Keep everything as-is in the channel layer. Only refactor `ExternalIdentityResolver` to be truly data-driven: the in-memory adapter reads from a generic "identity bindings" store instead of a hardcoded Map.

**Changes**:
1. New domain type `ChannelBinding { channel: InboundChannel; externalId: string }`
2. `InMemoryExternalIdentityResolver` backed by a list of `(personId, role, displayName, bindings[])` entries
3. `createInMemoryPipeline()` builds entries from contact seed + demo elder data
4. No changes to `Contact` type, no changes to `InboundChannel`

**Pros**:
- Minimal scope — only touches identity resolution
- Clean separation: contact domain stays WhatsApp-focused, identity resolver handles multi-channel
- Zero risk to T32 mediation flow

**Cons**:
- Doesn't address the `Contact` type limitation for future multi-channel features
- Outbound draft still doesn't know which channel to target
- Partial solution — pushes the contact model problem to a future task

**Effort**: Low

## Recommendation

**Approach A (Reuse Existing Channels + Enrich Contact Model)** is the cleanest design:

1. **The system already has `voice` and `web_chat` channels** — they work in the pipeline, have tests, and are validated. Adding `"elder_device"` provides no material benefit when `"voice"` already covers the device-mediated elder communication case.

2. **The real gap is in the `Contact` domain**, not the channel type. The `Contact` model only has `whatsappId` — it can't represent that Carlos can be reached via WhatsApp AND voice AND web_chat. Enriching `Contact` with channel bindings solves this at the root.

3. **The identity resolver should be data-driven** — instead of hardcoded demo entries per channel, it should derive its registry from contact bindings. This makes adding new contacts/channels a data change, not a code change.

4. **Outbound draft needs channel targeting** — when a mediation flow resolves, the draft should know which channel to target. The inbound channel is the natural default, but the contact's channel bindings tell us what channels are actually available for that recipient.

5. **Migration cost is low** — the `Contact` type change is backward-compatible (add optional fields, keep `whatsappId`). The identity resolver change is internal. T32 tests don't touch identity resolution. Total: ~8-10 files, mostly additive.

### Specific Design Decisions

1. **`Contact` type evolution**: Add `externalBindings: ChannelBinding[]` where `ChannelBinding = { channel: InboundChannel; externalId: string }`. Keep `whatsappId` as a derived/convenience field for backward compatibility.

2. **`ContactDirectory` port**: Add `findByChannelBinding(channel, externalId)` method. Keep existing `findByWhatsAppId` as a convenience wrapper.

3. **Identity resolver priming**: `createInMemoryPipeline()` builds identity entries from ALL contact bindings, not just WhatsApp. Demo elder data (voice device, web_chat session) becomes contact bindings.

4. **Outbound draft**: Add `targetChannel: InboundChannel` to `MediationDraft` or `ChannelInboundResult.flowState`. Defaults to the inbound channel; can be overridden by contact availability.

5. **No new channels**: Reuse `voice` for device-mediated elder communication. If a genuinely new channel is needed later, the enriched `Contact` model supports it without further changes.

## Risks

1. **`Contact` type change ripples to contact-directory tests** — 17 tests may need updates for the new field shape. Mitigation: keep `whatsappId` as a required field; add `externalBindings` as optional with default derivation.

2. **Identity resolver priming change may affect existing test expectations** — the `createInMemoryPipeline()` factory is used by ~50+ tests. Mitigation: the change is additive (more identity entries, not fewer); existing entries remain valid.

3. **`ChannelInboundResult` type change may affect gateway-wa** — if `flowState` or outbound draft fields change, the gateway-wa contract may need updating. Mitigation: all new fields are optional; existing shape preserved.

4. **T32 mediation flow tests could regress if `ProcessChannelInboundMessage` signature changes** — Mitigation: the use case constructor is unchanged; only the identity resolver's internal data changes.

5. **Seed data changes affect simulation acceptance tests** — 100 tests rely on specific identity resolution behavior. Mitigation: existing seed entries are preserved; new entries are additive.

## Explicit Out of Scope

- Real WhatsApp / Evolution API integration
- PostgreSQL persistence for contacts or identity
- New `InboundChannel` values (reuse existing 6)
- Multi-tenant identity isolation (tenantId is still `"demo"`)
- Contact CRUD API or admin interface
- Outbound message real sending (drafts only)
- Flow state timeout/expiry
- Recipient resolution to external IDs from contact name
- Cross-conversation flow state sharing

## Ready for Proposal

**Yes** — the exploration is complete. The orchestrator should tell the user:

> The cleanest design for T33 is **Approach A**: enrich the `Contact` domain with multi-channel bindings, make the identity resolver data-driven from those bindings, and add channel targeting to outbound drafts. No new `InboundChannel` values are needed — `voice` and `web_chat` already cover the semantic space. The migration cost is ~8-10 files, mostly additive, with zero risk to T32 mediation flow tests.
