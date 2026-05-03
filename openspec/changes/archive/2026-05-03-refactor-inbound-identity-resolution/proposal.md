# Proposal: Refactor Inbound Identity Resolution

## Intent

Fix the identity confusion bug where `ProcessChannelInboundMessage.adaptInput()` maps `externalSenderId` directly to `senderId`, conflating external channel identity with internal domain identity. Insert an `ExternalIdentityResolver` port that translates `tenantId + channel + externalSenderId → personId / actorId / role / authorization`.

## Scope

### In Scope
- `ResolvedInboundActor` type in `application/results/`
- `ExternalIdentityResolver` port in `application/ports/`
- `InMemoryExternalIdentityResolver` with demo seed data in `infrastructure/memory/`
- Integration into `ProcessChannelInboundMessage` as constructor dependency
- `ChannelInboundResult` extended with `identity` field
- Simulation API response updated to expose identity resolution status
- Unit tests for resolver + updated tests for pipeline use case
- `docs/simulation-api.md` updated with identity fields

### Out of Scope
- Real PostgreSQL or any persistent database
- Contact CRUD API or admin UI
- Real WhatsApp / Evolution API / Baileys integration
- OpenAI / OpenRouter LLM calls
- Dashboard or monitoring
- Real outbound message sending
- Complex conversational memory or session management

## Capabilities

### New Capabilities
- `external-identity-resolution`: Translates external channel sender identifiers to internal person/actor identity with role and authorization status

### Modified Capabilities
- `inbound-simulation-usecase`: Execution flow changes — identity resolution runs before inbound gate evaluation; blocked/unknown identity short-circuits pipeline
- `inbound-simulation-mapping`: No change (mapping remains pure function)
- `inbound-simulation-command`: No change (command shape unchanged)
- `inbound-simulation-endpoint`: Response shape gains `identity` field
- `inbound-simulation-tests`: New test scenarios for resolver behavior

## Approach

1. Define `ResolvedInboundActor` with fields: `personId`, `actorId`, `role`, `displayName`, `authorized`, `status` (`resolved` | `unknown` | `blocked`)
2. Define `ExternalIdentityResolver` port: `resolve(cmd: InboundMessageCommand): Promise<ResolvedInboundActor>`
3. Implement `InMemoryExternalIdentityResolver` with demo seed data (Marta on whatsapp/voice/web_chat)
4. Wire resolver into `ProcessChannelInboundMessage` constructor
5. New execution flow: resolve identity → if unknown/blocked, return early → if resolved, use `personId` for `ProcessInboundMessage` input
6. Add `identity` field to `ChannelInboundResult`
7. Update simulation handler to include identity in response
8. Update docs and tests

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `inbound-gate/application/results/resolved-inbound-actor.ts` | New | ResolvedInboundActor type |
| `inbound-gate/application/ports/external-identity-resolver.ts` | New | Resolver port interface |
| `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` | New | In-memory implementation with demo data |
| `inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add `identity` field |
| `inbound-gate/application/use-cases/process-channel-inbound-message.ts` | Modified | Add resolver dependency, new execution flow |
| `inbound-gate/application/use-cases/process-inbound-message.ts` | Modified | Accept `personId` in input instead of raw `senderId` |
| `inbound-gate/tests/process-channel-inbound-message.test.ts` | Modified | Add resolver mocks, identity scenarios |
| `inbound-gate/tests/external-identity-resolver.test.ts` | New | Resolver unit tests |
| `bootstrap/simulation-handler.ts` | Modified | Response includes identity |
| `docs/simulation-api.md` | Modified | Document identity fields in response |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing `ProcessInboundMessage` input contract | Medium | Keep `senderId` as fallback; `personId` is additive |
| Resolver failure crashes pipeline | Low | Catch resolver errors, treat as "unknown" with warning |
| Demo data leaks to production | Low | InMemory implementation only wired in simulation/dev config |
| Scope creep into Contact CRUD | Medium | Explicitly out of scope; enforce in code review |

## Rollback Plan

1. Revert `ProcessChannelInboundMessage` to previous constructor (remove resolver dependency)
2. Remove `identity` field from `ChannelInboundResult`
3. Delete new files: `resolved-inbound-actor.ts`, `external-identity-resolver.ts`, `in-memory-external-identity-resolver.ts`, resolver tests
4. Restore `adaptInput()` to map `externalSenderId → senderId` directly
5. All changes are additive/new files — no data migration needed

## Dependencies

- None — this is a pure code refactor with in-memory implementation

## Success Criteria

- [ ] `ExternalIdentityResolver` port defined and implemented with in-memory adapter
- [ ] `ProcessChannelInboundMessage` uses resolver before calling `ProcessInboundMessage`
- [ ] Unknown/blocked senders return early without AI guide execution
- [ ] Resolved senders pass `personId` to internal pipeline
- [ ] `ChannelInboundResult` includes `identity` field with correct status
- [ ] All existing tests pass (no regression)
- [ ] New resolver tests cover resolved/unknown/blocked scenarios
- [ ] `npm run check` passes with zero errors
- [ ] `docs/simulation-api.md` reflects new response shape
