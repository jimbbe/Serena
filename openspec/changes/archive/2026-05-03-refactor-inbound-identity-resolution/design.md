# Design: Refactor Inbound Identity Resolution

## Technical Approach

Insert an `ExternalIdentityResolver` port between channel intake and pipeline evaluation. The resolver translates `tenantId + channel + externalSenderId` → `ResolvedInboundActor`. The use case resolves identity first, short-circuits blocked/unknown actors, and passes `personId` downstream for resolved actors. All new types live in `application/results/` following the existing `ChannelInboundResult` pattern.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| `ResolvedInboundActor` location | `domain/` vs `application/results/` | `application/results/` | Couples channel concepts (externalSenderId) with internal identity (personId, role). Same rationale as `ChannelInboundResult` (cf. its JSDoc). Domain must not import cross-module concepts. |
| Resolver port shape | Command → Actor (full cmd) vs (tenantId, channel, externalSenderId) tuple | Full `InboundMessageCommand` | Allows resolver to inspect metadata, text, or occurredAt if needed. No cost to pass the command — the port is internal, not serialized. |
| Resolver failure → crash vs degrade | Crash pipeline vs treat as unknown | Treat as unknown with warning | Degrade preserves availability. Warning in result signals resolution failure to operators. Follows existing pattern (AI guide failure → guideError, not throw). |
| Key format for in-memory map | `channel:externalSenderId` vs `tenantId:channel:externalSenderId` | `tenantId:channel:externalSenderId` with `tenantId` defaulting to `"default"` | Tenant-aware from day one. Avoids key collision when multi-tenant arrives. |
| Demo data source | Hardcoded literals vs derived from ContactDirectory seed | Hardcoded demo entries + ContactDirectory seed for additional contacts | Demo identities (Marta on 3 channels) are project-specific and don't exist in current seed. Contacts seed supplements with Maria/Carlos/etc. as `role: "contact"`. |

## Data Flow

```
InboundMessageCommand
     │
     ▼
ExternalIdentityResolver.resolve(cmd)
     │
     ├── status:"blocked" ──→ ChannelInboundResult{identity, inboundDecision:{status:"blocked"}}
     │                         (no pipeline execution)
     │
     ├── status:"unknown"  ──→ ChannelInboundResult{identity, warnings:["identity unknown"]}
     │                         (continues to pipeline — gate decides)
     │
     └── status:"resolved" ──→ adaptInput(cmd, personId)
                                    │
                                    ▼
                              ProcessInboundMessage.execute({senderId, personId, text, receivedAt})
                                    │
                                    ▼
                              [existing pipeline: evaluate → profile → AI guide]
                                    │
                                    ▼
                              ChannelInboundResult{..., identity}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `inbound-gate/application/results/resolved-inbound-actor.ts` | **New** | `ResolvedInboundActor` type |
| `inbound-gate/application/ports/external-identity-resolver.ts` | **New** | `ExternalIdentityResolver` port interface |
| `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | **New** | Map-based resolver with demo data |
| `inbound-gate/application/results/channel-inbound-result.ts` | Modify | Add optional `identity` field |
| `inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modify | New dependency, resolve-before-evaluate flow, updated `adaptInput` |
| `inbound-gate/application/use-cases/process-inbound-message.ts` | Modify | Add optional `personId` to `ProcessInboundMessageInput` |
| `inbound-gate/tests/process-channel-inbound-message.test.ts` | Modify | Add resolver mock, identity scenarios |
| `inbound-gate/tests/external-identity-resolver.test.ts` | **New** | Resolver contract tests |
| `bootstrap/create-in-memory-pipeline.ts` | Modify | Create resolver, prime with demo data, return `processChannelInboundMessage` |
| `bootstrap/simulation-handler.ts` | Modify | Response includes identity field |
| `bootstrap/tests/simulation-endpoint.test.ts` | Modify | Use pipeline result with identity; add identity assertion |
| `server.ts` | Modify | Destructure `processChannelInboundMessage` from `createInMemoryPipeline` |
| `docs/simulation-api.md` | Modify | Document `identity` in response shape |

## Interfaces / Contracts

```typescript
// application/results/resolved-inbound-actor.ts
export type IdentityRole = "elder" | "contact" | "system";
export type IdentityStatus = "resolved" | "unknown" | "blocked";

export type ResolvedInboundActor = {
  personId: string;
  actorId: string;
  role: IdentityRole;
  displayName: string;
  authorized: boolean;
  status: IdentityStatus;
};

// application/ports/external-identity-resolver.ts
import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";
import type { ResolvedInboundActor } from "../results/resolved-inbound-actor.ts";

export interface ExternalIdentityResolver {
  resolve(command: InboundMessageCommand): Promise<ResolvedInboundActor>;
}

// infrastructure/memory/in-memory-external-identity-resolver.ts
// Constructor accepts Record<string, ResolvedInboundActor> keyed by
// "tenantId:channel:externalSenderId" (tenantId defaults to "default").
// resolve() normalises the key, returns match or {status:"unknown"} sentinel.
```

```typescript
// Modified: ProcessInboundMessageInput (additive)
export type ProcessInboundMessageInput = {
  senderId: string;     // external sender ID (kept for compatibility)
  personId?: string;    // resolved person ID (new, optional)
  text: string;
  receivedAt?: Date;
};

// Modified: ProcessChannelInboundMessageDependencies (additive)
export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  identityResolver: ExternalIdentityResolver;  // NEW
  generateTraceId?: () => string;
};
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Resolver throws (network, bug) | Caught in execute(). Returns `status:"unknown"` sentinel identity. Warning appended: `"Identity resolution failed: <message>"`. Pipeline continues normally (gate decides). |
| Resolver returns `status:"blocked"` | Short-circuit. Return `ChannelInboundResult` with `inboundDecision:{status:"blocked", reason:"identity_blocked"}`. No pipeline evaluation, no AI guide. |
| Resolver returns `status:"unknown"` | Warning appended. Continue to pipeline — the gate's own contact directory check still runs and may block or allow. |
| Resolver returns `status:"resolved"` but `personId` is empty | Treat as unknown (defensive). |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — resolver | `InMemoryExternalIdentityResolver.resolve()` returns correct actor for known keys; unknown sentinel for missing keys; normalisation (whitespace, case) | Node test runner, no mocks |
| Unit — use case | `ProcessChannelInboundMessage` with mock resolver: blocked returns early without AI call; unknown continues with warning; resolved passes personId to adaptInput; resolver throw is caught | Mock `ExternalIdentityResolver`, `ProcessInboundMessage`, `AiGuideService` |
| Integration | Simulation endpoint returns `identity` field; blocked actor response shape; unknown actor continues to gate | Use `createInMemoryPipeline()` wired with resolver |

## Migration / Rollout

No migration required — all changes are additive. `personId` is optional on `ProcessInboundMessageInput`. Existing `senderId` field preserved. Rollback: remove resolver dependency from constructor, delete 3 new files, revert `adaptInput` to 1-param.

## Open Questions

- [ ] Should `IdentityRole` include `"caregiver"` or `"family"` in addition to `"elder"`, `"contact"`, `"system"`? (Current scope only needs these three.)
- [ ] Should the `actorId` format be opaque UUID or structured (e.g., `whatsapp/5492600000000`)? (Leaving as opaque string for now — resolver implementer chooses format.)
