# Proposal: T33 — Channel-Aware Identity Policy

## Intent

Define one identity rule set per channel so Serena can tell who is speaking before it enters sensitive flows. WhatsApp must resolve by sender ID + registered contact because that is the stable external identity available there. The local Serena device must resolve by device binding to the elder for MVP because it is a single bound endpoint, not a shared household interface. MVP does not support multiple local speakers yet; that would require extra authentication, attribution, and conflict handling we are not ready to own.

## Scope

### In Scope
- Channel-aware identity policy for WhatsApp, local device, and unknown senders.
- Restrict unknown WhatsApp/device senders from sensitive flows like mediation.
- Define the MVP identity preference for a single elder-bound local device.
- Prepare outbound draft/delivery to consume channel-targeted identity later.

### Out of Scope
- Real WhatsApp / Evolution API integration.
- PostgreSQL, persistence, or webhook delivery.
- Real outbound sending.
- Multi-user auth or multiple local speakers.
- Voice recognition or adding a new channel enum.

## Capabilities

### New Capabilities
- `channel-aware-identity-policy`: policy rules for resolving identity by channel and gating sensitive flows.

### Modified Capabilities
- `external-identity-resolution`: channel-specific resolution rules for WhatsApp sender IDs and elder device bindings.
- `mediation-flow`: block unresolved/unknown identities from mediation and other sensitive paths.

## Approach

Reuse the existing channel set (`whatsapp`, `voice`, `web_chat`, etc.) instead of introducing a new channel. Model identity as a binding problem: WhatsApp maps to registered contact sender IDs; the local device maps to the elder via device binding; unknown senders stay allowed only in non-sensitive paths. This keeps the core channel-agnostic while giving later outbound draft/delivery work a clear target-channel contract.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/specs/external-identity-resolution/spec.md` | Modified | Channel-specific identity rules |
| `openspec/specs/mediation-flow/spec.md` | Modified | Sensitive-flow gating for unknowns |
| `openspec/specs/contact-directory-integration/spec.md` | Modified | Identity/contact alignment for bindings |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Identity rules leak into business logic | Med | Keep policy in specs, adapters in later tasks |
| Multiple local speakers are assumed too early | Med | Explicit MVP single-binding rule |

## Rollback Plan

If the policy proves too broad, revert to the current channel-agnostic identity behavior and keep only the WhatsApp sender-ID resolution already supported.

## Dependencies

- Existing T20 channel-agnostic inbound pipeline.
- Existing identity resolver and mediation-flow work.

## Success Criteria

- Unknown WhatsApp/device senders never reach mediation.
- WhatsApp resolves through registered contact sender ID.
- Local device resolves to the elder by device binding only.
- Later outbound draft/delivery work has a stable channel target contract.
