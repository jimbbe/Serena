# External Identity Resolution Specification

## Purpose

Define the `ExternalIdentityResolver` port that translates external channel sender identifiers (`tenantId + channel + externalSenderId`) into internal domain identity (`personId`, `role`, `displayName`, `authorized`, `status`). This decouples external channel identity from internal domain identity, fixing the bug where `externalSenderId` was used directly as `senderId` for internal processing.

## Requirements

### Requirement: ResolvedInboundActor Type

The system SHALL define `ResolvedInboundActor` in `inbound-gate/application/results/resolved-inbound-actor.ts` with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"resolved" \| "unknown" \| "blocked"` | Resolution outcome |
| `tenantId` | `string` | Multi-tenant identifier (echoed from command or defaulted to `"demo"`) |
| `channel` | `string` | Channel the message arrived through |
| `externalSenderId` | `string` | Sender identifier as provided by the channel |
| `personId` | `string` (optional) | Internal domain identifier for the person (set when resolved) |
| `actorId` | `string` (optional) | Actor identifier within the system (set when resolved) |
| `role` | `"elder" \| "contact" \| "system"` (optional) | Role of the sender in the Serena ecosystem |
| `displayName` | `string` (optional) | Human-readable name for display (set when resolved) |
| `authorized` | `boolean` | Whether this sender is authorized to interact |
| `reason` | `string` (optional) | Reason for status (e.g. `"unknown_sender"`, `"sender_blocked"`, `"resolution_error"`) |

### Requirement: ExternalIdentityResolver Port

The system SHALL define `ExternalIdentityResolver` in `inbound-gate/application/ports/external-identity-resolver.ts` as an interface with the following contract:

```typescript
export interface ExternalIdentityResolver {
  resolve(cmd: InboundMessageCommand): Promise<ResolvedInboundActor>;
}
```

The resolver SHALL:
- Accept an `InboundMessageCommand` as input
- Return a `ResolvedInboundActor` with the resolution result
- Never throw — errors SHALL be caught internally and returned as `status: "unknown"` with `reason: "resolution_error"`
- Default `tenantId` to `"demo"` when not present in the command

### Requirement: InMemoryExternalIdentityResolver Implementation

The system SHALL implement `InMemoryExternalIdentityResolver` in `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` with demo seed data covering multiple channels. The key format SHALL be `tenantId:channel:externalSenderId` (tenantId defaults to `"demo"`).

The default seed data SHALL include:
- **Marta** on `whatsapp` with external sender ID `"+5492600000000"`, `personId: "marta"`, `role: "elder"`
- **Marta** on `voice` with external sender ID `"serena_device_001"`, `personId: "marta"`, `role: "elder"`
- **Marta** on `web_chat` with external sender ID `"session_abc"`, `personId: "marta"`, `role: "elder"`
- A **blocked sender** on `whatsapp` with external sender ID `"+5499999999999"` for testing blocked identity flow

Each resolved seed entry SHALL map to `personId: "marta"`, `actorId: "marta"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`.

The constructor SHALL also accept an optional array of `ChannelBinding` entries (see contact-directory-integration spec) that extend or override the default seed data, enabling data-driven channel-aware identity resolution from contact bindings.

The constructor SHALL accept an optional `Record<string, ResolvedInboundActor>` of extra entries that extend or override defaults.

### Requirement: Resolver Integration in Pipeline

The `ProcessChannelInboundMessage` use case SHALL accept `ExternalIdentityResolver` as a constructor dependency and SHALL resolve identity as the first step after trace ID generation:

```
1. Generate traceId
2. Resolve identity via ExternalIdentityResolver
3. If identity.status === "blocked" → return early (blocked, no pipeline)
4. If identity.status === "unknown" → continue to gate with channel-aware identity policy:
   - Non-sensitive paths (conversational, informational) SHALL proceed
   - Sensitive paths (mediation, clarification, confirmation) SHALL be blocked
5. If identity.status === "resolved" → adapt input: use personId as senderId, continue to gate (allow sensitive paths)
6. Execute ProcessInboundMessage
7-8. Route decision → AI guide → return result with identity field
```

### Requirement: WhatsApp Known Sender Resolution

The system SHALL resolve a WhatsApp sender as a known identity when the `externalSenderId` matches a registered entry in the identity resolver with key format `tenantId:whatsapp:externalSenderId`. The entry SHALL define `personId`, `role`, `displayName`, and `authorized` fields.

#### Scenario: registered contact WhatsApp message
- GIVEN a contact with `whatsappId: "5491111111111"` exists in the contact directory
- AND the identity resolver has an entry for `demo:whatsapp:5491111111111`
- WHEN a WhatsApp message arrives with `externalSenderId: "5491111111111"`
- THEN the resolver returns `status: "resolved"`, `role: "contact"`, `authorized: true`, with the contact's `personId` and `displayName`

#### Scenario: elder (Marta) WhatsApp message
- GIVEN the identity resolver has an entry for `demo:whatsapp:+5492600000000` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`
- WHEN a WhatsApp message arrives with `externalSenderId: "+5492600000000"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`, `personId: "marta"`

#### Scenario: blocked WhatsApp sender
- GIVEN the identity resolver has an entry for `demo:whatsapp:+5499999999999` with `status: "blocked"`
- WHEN a WhatsApp message arrives with `externalSenderId: "+5499999999999"`
- THEN the resolver returns `status: "blocked"`, `authorized: false`, `reason: "sender_blocked"`

### Requirement: WhatsApp Unknown Sender Restriction

A WhatsApp sender that does NOT match any registered entry SHALL resolve as `status: "unknown"` and SHALL be restricted from sensitive mediation flows.

#### Scenario: unregistered WhatsApp sender
- GIVEN no identity entry exists for a given `externalSenderId`
- WHEN a WhatsApp message arrives
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`

#### Scenario: unknown WhatsApp blocked from mediation
- GIVEN a WhatsApp message resolves to `status: "unknown"`
- WHEN the message enters the channel-inbound pipeline
- THEN the message SHALL NOT enter mediation confirmation or any sensitive flow that requires trusted identity

### Requirement: Authorized Local Device Resolution

The authorized local device (MVP: single elder-bound device) SHALL resolve automatically as the elder (Marta) without requiring explicit sender identification. The preferred `externalSenderId` for the local device is `serena_device_001`.

#### Scenario: authorized voice device
- GIVEN the identity resolver has an entry for `demo:voice:serena_device_001` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`
- WHEN a voice channel message arrives with `externalSenderId: "serena_device_001"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`

#### Scenario: authorized web_chat session
- GIVEN the identity resolver has an entry for `demo:web_chat:session_abc` mapped to `personId: "marta"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`
- WHEN a web_chat message arrives with `externalSenderId: "session_abc"`
- THEN the resolver returns `status: "resolved"`, `role: "elder"`, `authorized: true`

### Requirement: Unknown Local Device Restriction

A voice or web_chat sender that does NOT match any authorized device binding SHALL resolve as `status: "unknown"` and SHALL be restricted from sensitive mediation flows.

#### Scenario: unrecognized voice device
- GIVEN no identity entry exists for a given voice `externalSenderId`
- WHEN a voice channel message arrives
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`
- AND the message SHALL NOT enter mediation confirmation or sensitive flows

#### Scenario: unrecognized web_chat session
- GIVEN no identity entry exists for a given web_chat `externalSenderId`
- WHEN a web_chat message arrives
- THEN the resolver returns `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`

### Requirement: No Hardcoded Identity in Pipeline

The channel-inbound pipeline SHALL NOT contain hardcoded references to "Marta", "marta", or any specific identity. All identity resolution SHALL be delegated to the `ExternalIdentityResolver` port via `resolve()`.

#### Scenario: pipeline uses resolver exclusively
- GIVEN any inbound message on any channel
- WHEN the pipeline processes the message
- THEN identity resolution is performed exclusively via `ExternalIdentityResolver.resolve()`
- AND no hardcoded person IDs, names, or role checks exist in the pipeline use case

### Requirement: Channel Policy Gate for Sensitive Flows

The system SHALL enforce a channel-aware identity policy gate before allowing entry into sensitive mediation flows:
1. `identity.status === "resolved"` AND `authorized === true` → allow sensitive flows
2. `identity.status === "blocked"` → reject entirely (return early)
3. `identity.status === "unknown"` → allow non-sensitive paths only; block mediation

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

## Constraints

1. **Clean Architecture boundaries**: The resolver port lives in `application/ports/`, the implementation in `infrastructure/memory/`, and the result type in `application/results/`. No cross-layer violations.
2. **No real database**: The `InMemoryExternalIdentityResolver` is the only implementation. No PostgreSQL or persistent storage.
3. **Resolver never crashes the pipeline**: Errors in the resolver are caught and treated as `status: "unknown"` with a warning.
