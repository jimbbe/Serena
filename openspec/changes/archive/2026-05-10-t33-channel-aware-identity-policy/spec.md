# Spec: T33 — Channel-Aware Identity Policy

## Purpose

Define channel-specific identity resolution rules so Serena can tell who is speaking before entering sensitive flows. WhatsApp resolves by registered sender ID; the authorized local device resolves to the elder (Marta) via device binding; unknown senders on any channel are restricted from sensitive mediation. The pipeline remains free of hardcoded identity logic — all policy lives in the resolver/policy layer.

This spec adds delta requirements to `external-identity-resolution`, `mediation-flow`, and `contact-directory-integration` without changing existing behavior for `telegram`, `web_chat`, `simulation`, or `system` channels unless explicitly stated.

---

## Delta Requirements

### DR1 — WhatsApp Known Sender Resolution (MUST)

The system MUST resolve a WhatsApp sender as a known identity when the `externalSenderId` matches a registered contact's `whatsappId` in the contact directory.

**Key format**: `tenantId:whatsapp:externalSenderId`

#### Scenario: registered contact sends WhatsApp message

- GIVEN a contact with `whatsappId: "5491111111111"` exists in the contact directory
- AND the identity resolver has an entry for `demo:whatsapp:5491111111111`
- WHEN a WhatsApp message arrives with `externalSenderId: "5491111111111"`
- THEN the resolver returns `status: "resolved"`, `role: "contact"`, `authorized: true`, with the contact's `personId` and `displayName`

#### Scenario: elder (Marta) sends WhatsApp message

- GIVEN the identity resolver has an entry for `demo:whatsapp:+5492600000000` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`
- WHEN a WhatsApp message arrives with `externalSenderId: "+5492600000000"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`, `personId: "marta"`

#### Scenario: WhatsApp sender is blocked

- GIVEN the identity resolver has an entry for `demo:whatsapp:+5499999999999` with `status: "blocked"`
- WHEN a WhatsApp message arrives with `externalSenderId: "+5499999999999"`
- THEN the resolver returns `status: "blocked"`, `authorized: false`, `reason: "sender_blocked"`

### DR2 — WhatsApp Unknown Sender Restriction (MUST)

A WhatsApp sender that does NOT match any registered contact or elder binding MUST resolve as `status: "unknown"` and MUST be restricted from sensitive mediation flows.

#### Scenario: unregistered WhatsApp sender

- GIVEN no identity entry exists for `demo:whatsapp:5498888888888`
- WHEN a WhatsApp message arrives with `externalSenderId: "5498888888888"`
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`

#### Scenario: unknown WhatsApp sender cannot trigger mediation

- GIVEN a WhatsApp message resolves to `status: "unknown"`
- WHEN the message enters the channel-inbound pipeline
- THEN the message MAY be processed for conversational responses
- BUT the message MUST NOT enter mediation confirmation or any sensitive flow that requires trusted identity

### DR3 — Authorized Local Device Resolution (MUST)

The authorized local device (MVP: single elder-bound device) MUST resolve automatically as the elder (Marta) without requiring explicit sender identification. The preferred conceptual `externalSenderId` for the local device is `serena_device_001`.

**Design principle**: The local device is a single bound endpoint, not a shared household interface. MVP does not support multiple local speakers.

#### Scenario: authorized voice device sends message

- GIVEN the identity resolver has an entry for `demo:voice:serena_device_001` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`
- WHEN a voice channel message arrives with `externalSenderId: "serena_device_001"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`

#### Scenario: authorized web_chat session sends message

- GIVEN the identity resolver has an entry for `demo:web_chat:session_abc` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`
- WHEN a web_chat message arrives with `externalSenderId: "session_abc"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`

### DR4 — Unknown Local Device Restriction (MUST)

A voice or web_chat sender that does NOT match any authorized device binding MUST resolve as `status: "unknown"` and MUST be restricted from sensitive mediation flows.

#### Scenario: unrecognized voice device

- GIVEN no identity entry exists for `demo:voice:unknown_device_001`
- WHEN a voice channel message arrives with `externalSenderId: "unknown_device_001"`
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`
- AND the message MUST NOT enter mediation confirmation or sensitive flows

#### Scenario: unrecognized web_chat session

- GIVEN no identity entry exists for `demo:web_chat:session_xyz`
- WHEN a web_chat message arrives with `externalSenderId: "session_xyz"`
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`

### DR5 — Risk Messages from Authorized Local Device (MUST)

Risk signals detected in messages from an authorized local device (resolved as elder) MUST route to risk review and MUST NOT fall into mediation confirmation.

#### Scenario: elder sends risk message via authorized device

- GIVEN a voice message from `serena_device_001` resolves to `status: "resolved"`, `role: "elder"`
- AND the AI guide or mediation understanding detects `riskSignal: true`
- WHEN the pipeline processes the message
- THEN the flow MUST transition to risk review (pause any active mediation flow)
- AND the message MUST NOT proceed to mediation confirmation

#### Scenario: elder sends risk message via WhatsApp

- GIVEN a WhatsApp message from `+5492600000000` resolves to `status: "resolved"`, `role: "elder"`
- AND the AI guide or mediation understanding detects `riskSignal: true`
- WHEN the pipeline processes the message
- THEN the flow MUST transition to risk review (pause any active mediation flow)
- AND the message MUST NOT proceed to mediation confirmation

### DR6 — No Hardcoded Marta Logic in Pipeline (MUST)

The channel-inbound pipeline MUST NOT contain hardcoded references to "Marta", "marta", or any specific identity. All identity resolution MUST be delegated to the `ExternalIdentityResolver` port. Identity policy lives in the resolver/policy layer, not in business logic.

#### Scenario: pipeline uses resolver for all identity decisions

- GIVEN any inbound message on any channel
- WHEN the pipeline processes the message
- THEN identity resolution is performed exclusively via `ExternalIdentityResolver.resolve()`
- AND no hardcoded person IDs, names, or role checks exist in the pipeline use case

### DR7 — Channel Policy Gate for Sensitive Flows (MUST)

The system MUST enforce a channel-aware identity policy gate before allowing entry into sensitive mediation flows. The gate checks:

1. `identity.status === "resolved"` AND `identity.authorized === true` → allow
2. `identity.status === "blocked"` → reject entirely (return early)
3. `identity.status === "unknown"` → allow only non-sensitive paths (conversational, informational); block mediation

#### Scenario: resolved identity enters mediation

- GIVEN identity resolves to `status: "resolved"`, `authorized: true`
- WHEN the message is classified as a mediation request
- THEN the mediation flow proceeds normally

#### Scenario: unknown identity blocked from mediation

- GIVEN identity resolves to `status: "unknown"`
- WHEN the message is classified as a mediation request
- THEN the system returns a response indicating the sender is not recognized
- AND no mediation flow state is created

#### Scenario: blocked identity rejected

- GIVEN identity resolves to `status: "blocked"`
- WHEN the message enters the pipeline
- THEN the pipeline returns early with a blocked result
- AND no further processing occurs

### DR8 — Contact Directory Channel Bindings (SHOULD)

The `Contact` domain SHOULD support multi-channel external bindings so that identity resolution can derive from contact data rather than hardcoded demo entries.

#### Scenario: contact has WhatsApp binding

- GIVEN a contact with `whatsappId: "5491111111111"`
- WHEN the identity resolver is primed from contact data
- THEN an entry exists for `demo:whatsapp:5491111111111` with `role: "contact"`

#### Scenario: contact directory provides channel-aware lookup

- GIVEN a contact directory with contacts that have channel bindings
- WHEN `findByChannelBinding("whatsapp", "5491111111111")` is called
- THEN the matching contact is returned

### DR9 — Existing Channel Behavior Preserved (MUST)

The behavior for `telegram`, `web_chat`, `simulation`, and `system` channels MUST remain unchanged unless a sender is explicitly registered in the identity resolver. Unknown senders on these channels resolve as `status: "unknown"` (existing behavior).

#### Scenario: telegram unknown sender

- GIVEN no identity entry exists for `demo:telegram:some_user`
- WHEN a telegram message arrives
- THEN the resolver returns `status: "unknown"` (existing behavior preserved)

#### Scenario: simulation channel works as before

- GIVEN the simulation channel is used for testing
- WHEN a simulation message arrives with a known identity entry
- THEN the resolver returns the registered identity
- WHEN a simulation message arrives with no identity entry
- THEN the resolver returns `status: "unknown"`

#### Scenario: system channel works as before

- GIVEN a system-generated message
- WHEN the system channel is used
- THEN existing system identity behavior is preserved

---

## Non-Scope (Explicit)

The following are explicitly OUT OF SCOPE for T33:

| Item | Reason |
|------|--------|
| Real WhatsApp / Evolution API integration | Infrastructure, not policy |
| PostgreSQL persistence for contacts or identity | Persistence layer, deferred |
| New `InboundChannel` enum values | Reuse existing 6 channels |
| Multi-user authentication on local device | MVP is single elder-bound device |
| Voice recognition or speaker identification | Requires audio processing, deferred |
| Multi-tenant identity isolation | `tenantId` remains `"demo"` |
| Contact CRUD API or admin interface | Admin features, deferred |
| Real outbound message sending | Outbound work is separate |
| Flow state timeout/expiry | Deferred to future task |
| Cross-conversation-flow state sharing | Not needed for MVP |
| Hardcoded "Marta" checks in pipeline | Violates DR6 |
| Changes to `telegram`, `simulation`, `system` channel behavior | Preserved per DR9 |

---

## Affected Specifications

| Spec | Change Type | Description |
|------|-------------|-------------|
| `external-identity-resolution/spec.md` | Modified | Add channel-specific resolution rules (DR1-DR4, DR6-DR7) |
| `mediation-flow/spec.md` | Modified | Add identity gate requirements for sensitive flows (DR2, DR4, DR5, DR7) |
| `contact-directory-integration/spec.md` | Modified | Add channel binding support (DR8) |

## Affected Code Areas

| Area | Impact | Description |
|------|--------|-------------|
| `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | Modified | Demo data and resolution logic for channel-aware entries |
| `contact-directory/domain/contact.ts` | Modified | Add `externalBindings` field for multi-channel support |
| `contact-directory/infrastructure/memory/in-memory-contact-directory.ts` | Modified | Add channel-aware indexing and lookup |
| `bootstrap/create-in-memory-pipeline.ts` | Modified | Prime identity resolver from all contact bindings |
| `channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modified | Add identity policy gate before sensitive flows |

## Acceptance Criteria

### AC1 — WhatsApp known sender resolves correctly
```
Given: Contact with whatsappId exists in directory
When: WhatsApp message arrives with matching externalSenderId
Then: status = "resolved", role = "contact", authorized = true
```

### AC2 — WhatsApp unknown sender blocked from mediation
```
Given: No identity entry for WhatsApp sender
When: WhatsApp message classified as mediation
Then: No mediation flow created, sender not recognized
```

### AC3 — Authorized local device resolves as elder
```
Given: serena_device_001 entry exists in resolver
When: Voice message from that device arrives
Then: status = "resolved", role = "elder", personId = "marta"
```

### AC4 — Unknown local device blocked from mediation
```
Given: No identity entry for voice/web_chat sender
When: Message classified as mediation
Then: No mediation flow created
```

### AC5 — Risk messages from elder go to risk review
```
Given: Resolved elder sends message with riskSignal = true
When: Pipeline processes message
Then: Active mediation flow paused, risk review triggered
AND: Mediation NOT confirmed
```

### AC6 — No hardcoded Marta logic in pipeline
```
When: Pipeline code is inspected
Then: No hardcoded references to "Marta", "marta", or specific identities
AND: All identity decisions go through ExternalIdentityResolver
```

### AC7 — Existing channel behavior preserved
```
Given: telegram/simulation/system channel message
When: Processed through pipeline
Then: Existing behavior unchanged (unknown → "unknown", known → "resolved")
```

### AC8 — All existing tests pass
```
When: npm run check
Then: exit code 0, all tests pass, no TypeScript errors
```
