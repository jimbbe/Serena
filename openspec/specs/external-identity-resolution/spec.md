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
- **Marta** (elder_001) on `whatsapp` with external sender ID `"+5492600000000"`
- **Marta** (elder_001) on `voice` with external sender ID `"device_marta_livingroom"`
- **Marta** (elder_001) on `web_chat` with external sender ID `"session_abc"`
- A **blocked sender** on `whatsapp` with external sender ID `"+5499999999999"` for testing blocked identity flow

Each resolved seed entry SHALL map to `personId: "elder_001"`, `actorId: "elder_001"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`.

The constructor SHALL accept an optional `Record<string, ResolvedInboundActor>` of extra entries that extend or override defaults.

### Requirement: Resolver Integration in Pipeline

The `ProcessChannelInboundMessage` use case SHALL accept `ExternalIdentityResolver` as a constructor dependency and SHALL resolve identity as the first step after trace ID generation:

```
1. Generate traceId
2. Resolve identity via ExternalIdentityResolver
3. If identity.status === "blocked" → return early (blocked, no pipeline)
4. If identity.status === "unknown" → continue to gate (externalSenderId passes through)
5. If identity.status === "resolved" → adapt input: use personId as senderId
6. Execute ProcessInboundMessage
7-8. Route decision → AI guide → return result with identity field
```

## Constraints

1. **Clean Architecture boundaries**: The resolver port lives in `application/ports/`, the implementation in `infrastructure/memory/`, and the result type in `application/results/`. No cross-layer violations.
2. **No real database**: The `InMemoryExternalIdentityResolver` is the only implementation. No PostgreSQL or persistent storage.
3. **Resolver never crashes the pipeline**: Errors in the resolver are caught and treated as `status: "unknown"` with a warning.
