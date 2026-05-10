# Design: T33 — Channel-Aware Identity Policy

## Technical Approach

Keep `ProcessChannelInboundMessage` channel-agnostic: it continues to call only `ExternalIdentityResolver.resolve(cmd)` before gate evaluation. Channel-aware identity policy lives behind the resolver, backed by data-driven bindings. The local Serena device MVP reuses the existing `voice` channel for device-mediated speech and may reuse `web_chat` for a local typed session; no new channel enum is added.

T32 remains compatible because mediation flow starts only after identity resolution creates a conversation for a resolved actor. Unknown or blocked actors do not get an active mediation conversation/flow.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Local device channel | Reuse `voice` for elder-bound local device; reuse `web_chat` for local typed UI if needed | Add `elder_device` | Existing `InboundChannel` already models transport. The missing concept is binding/policy, not a new channel. Avoids validation/test ripple. |
| Policy location | Resolver/adapter layer | Hardcode channel/person rules in `ProcessChannelInboundMessage` | Keeps the use case clean and preserves the `ExternalIdentityResolver` port as the identity boundary. |
| Binding model | Add channel bindings to contact/identity seed data | Keep hardcoded resolver map | Adding/removing channel identities becomes data-driven, matching project standards. |
| Unknown sensitive access | Unknown identities stay unresolved and are blocked before mediation-sensitive paths by gate/policy | Let unknowns enter mediation and fail later | Safer default for mediation; still allows non-sensitive discard/conversation handling where current gate permits. |

## Data Flow

```text
InboundMessageCommand(channel, externalSenderId)
  → ExternalIdentityResolver
    → IdentityBindingStore: tenantId + channel + externalSenderId
    → ResolvedInboundActor(status, personId, role, authorized, binding)
  → ProcessChannelInboundMessage
    → blocked: short-circuit
    → unknown: gate discard / non-sensitive handling
    → resolved: conversation + T32 mediation flow
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/core/src/modules/shared/channel.ts` | Keep | No new channel value. |
| `apps/core/src/modules/contact-directory/domain/contact.ts` | Modify | Add optional `externalBindings?: ChannelBinding[]`; keep `whatsappId` for compatibility. |
| `apps/core/src/modules/contact-directory/application/ports/contact-directory.ts` | Modify | Add `findByChannelBinding(channel, externalId)`; keep WhatsApp methods as wrappers. |
| `apps/core/src/modules/contact-directory/infrastructure/memory/in-memory-contact-directory.ts` | Modify | Index contacts by normalized `channel:externalId`; derive WhatsApp binding from `whatsappId`. |
| `apps/core/src/modules/contact-directory/infrastructure/seed/contacts.seed.json` | Modify | Add bindings for WhatsApp contacts and elder local-device binding data where appropriate. |
| `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | Modify | Replace hardcoded per-channel demo branching with binding-store construction. |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Build resolver entries from contact bindings plus elder local-device binding. |
| `apps/core/src/modules/inbound-gate/tests/*identity*.test.ts` | Modify | Cover WhatsApp contact, voice elder-device, web_chat binding, unknown, blocked. |
| `apps/core/src/modules/mediation-flow/__tests__/*.test.ts` | Modify/Add | Add unknown identity cannot create/continue mediation flow. |

## Interfaces / Contracts

```ts
type ChannelBinding = {
  tenantId?: string;
  channel: InboundChannel;
  externalId: string;
  ownerPersonId: string;
  role: "elder" | "contact" | "system";
  displayName: string;
  authorized: boolean;
  bindingKind: "whatsapp_sender" | "local_device" | "web_session";
};
```

`ResolvedInboundActor` may include optional `bindingKind`/`bindingId` later, but T33 can keep the current result shape if tests only require behavior.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Binding normalization and lookup | Contact directory + resolver tests. |
| Unit | No hardcoded use-case policy | Mock resolver in `ProcessChannelInboundMessage`; assert it receives command and governs identity outcome. |
| Integration | T32 mediation compatibility | Simulation/scenario tests: resolved elder voice starts flow; unknown WhatsApp/voice cannot create or continue mediation. |
| Regression | Existing channels | Ensure `whatsapp`, `voice`, `web_chat`, `simulation` still compile and pass current flows. |

## Migration / Rollout

No persistent migration required. This is in-memory/seed-only. Rollout is additive: keep `whatsappId`, derive a default WhatsApp binding for existing contacts, then add explicit `externalBindings`. Existing T32 flow state shape remains unchanged.

## Out of Scope

- Real WhatsApp/Evolution API integration.
- PostgreSQL persistence or migration tooling.
- Real outbound sending or delivery receipts.
- Multi-user local speaker attribution/auth.
- Voice recognition/biometrics.
- Adding a new `InboundChannel` value.

## Open Questions

- [ ] Should `bindingKind` be exposed in `ResolvedInboundActor` now, or kept internal until outbound delivery needs it?
