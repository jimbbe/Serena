# Tasks: External Identity Resolution for Inbound Pipeline

## Change: refactor-inbound-identity-resolution

## Task Checklist

### T01 — Create ResolvedInboundActor type
- **Category**: create
- **Dependencies**: none
- **Files**: `apps/core/src/modules/inbound-gate/application/results/resolved-inbound-actor.ts` (new)
- **Description**: Define `IdentityRole` (`"elder" | "contact" | "system"`), `IdentityStatus` (`"resolved" | "unknown" | "blocked"`), and `ResolvedInboundActor` type with fields: `personId`, `actorId`, `role`, `displayName`, `authorized`, `status`. Place in `application/results/` per design decision (couples channel + internal concepts).

### T02 — Create ExternalIdentityResolver port interface
- **Category**: create
- **Dependencies**: T01
- **Files**: `apps/core/src/modules/inbound-gate/application/ports/external-identity-resolver.ts` (new)
- **Description**: Define `ExternalIdentityResolver` interface with single method `resolve(command: InboundMessageCommand): Promise<ResolvedInboundActor>`. Pure port — no implementation details. Import `InboundMessageCommand` from domain and `ResolvedInboundActor` from results.

### T03 — Create InMemoryExternalIdentityResolver
- **Category**: create
- **Dependencies**: T01, T02
- **Files**: `apps/core/src/modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` (new)
- **Description**: Implement `ExternalIdentityResolver` with a `Map<string, ResolvedInboundActor>` keyed by `tenantId:channel:externalSenderId` (tenantId defaults to `"default"`). Seed data includes Marta (elder_001) on whatsapp (`whatsapp_marta_001`), voice (`voice_device_marta`), and web_chat (`webchat_session_marta`). Constructor accepts optional seed entries. `resolve()` normalizes key, returns match or unknown sentinel. Never throws — catches errors and returns `status: "unknown"`.

### T04 — Add identity field to ChannelInboundResult
- **Category**: modify
- **Dependencies**: T01
- **Files**: `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts`
- **Description**: Add optional `identity?: ResolvedInboundActor` field after `simulatedOutbound` and before `warnings`. Import `ResolvedInboundActor` from `./resolved-inbound-actor.ts`.

### T05 — Add optional personId to ProcessInboundMessageInput
- **Category**: modify
- **Dependencies**: none
- **Files**: `apps/core/src/modules/inbound-gate/application/use-cases/process-inbound-message.ts`
- **Description**: Add `personId?: string` to `ProcessInboundMessageInput` type. Additive change — `senderId` remains required for compatibility. No logic changes in `ProcessInboundMessage` itself (the value passed comes from the caller).

### T06 — Modify ProcessChannelInboundMessage to use resolver
- **Category**: modify
- **Dependencies**: T01, T02, T04, T05
- **Files**: `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts`
- **Description**: 
  1. Add `identityResolver: ExternalIdentityResolver` to `ProcessChannelInboundMessageDependencies`
  2. Store resolver as private field in constructor
  3. Modify `execute()`: resolve identity FIRST after traceId generation
  4. If `status === "blocked"`: return early with `inboundDecision: { status: "blocked", reason: "identity_blocked" }`, `identity`, no guideResult/profileId/useCaseId
  5. If `status === "unknown"`: append warning `"Identity resolution failed"` or `"Unknown sender"`, continue to pipeline (gate still decides)
  6. If `status === "resolved"`: pass `identity.personId` to `adaptInput()` as `personId` field, use `identity.personId` as `senderId` (NOT `externalSenderId`)
  7. Wrap resolver call in try/catch — on error, treat as unknown with warning
  8. Always include `identity` in returned `ChannelInboundResult`

### T07 — Wire resolver in createInMemoryPipeline
- **Category**: modify
- **Dependencies**: T03, T06
- **Files**: `apps/core/src/bootstrap/create-in-memory-pipeline.ts`
- **Description**: Import `InMemoryExternalIdentityResolver`, create instance with demo seed data (Marta on 3 channels), pass it to `ProcessChannelInboundMessage` constructor. Update return type if needed to expose `processChannelInboundMessage`.

### T08 — Write resolver unit tests
- **Category**: test
- **Dependencies**: T03
- **Files**: `apps/core/src/modules/inbound-gate/tests/external-identity-resolver.test.ts` (new)
- **Description**: Tests for `InMemoryExternalIdentityResolver`:
  1. Known sender on whatsapp resolves to elder_001
  2. Known sender on voice resolves to elder_001
  3. Known sender on web_chat resolves to elder_001
  4. Unknown sender returns `status: "unknown"`, `authorized: false`
  5. Blocked sender (add seed entry) returns `status: "blocked"`, `authorized: false`
  6. Key normalization (tenantId defaults to "default")
  Use Node test runner, no mocks needed.

### T09 — Update ProcessChannelInboundMessage tests with resolver mock
- **Category**: test
- **Dependencies**: T06, T08
- **Files**: `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts`
- **Description**: 
  1. Add `identityResolver` mock factory that returns configurable `ResolvedInboundActor`
  2. Update all 17 existing tests to include resolver mock (default: returns `status: "resolved"`)
  3. Add new test: unknown identity short-circuits (no ProcessInboundMessage or AiGuideService called)
  4. Add new test: blocked identity short-circuits
  5. Add new test: resolved identity passes `personId` (not `externalSenderId`) to `ProcessInboundMessage`
  6. Add new test: `identity` field present in all results
  7. Add new test: resolver error caught, treated as unknown, warning added, no crash
  8. Verify all existing assertions still pass

### T10 — Update simulation endpoint tests with identity assertions
- **Category**: test
- **Dependencies**: T07, T09
- **Files**: `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts`
- **Description**: 
  1. Update `before()` fixture to wire resolver into `ProcessChannelInboundMessage`
  2. Add identity assertions to existing known-sender tests (verify `identity.status === "resolved"`, `identity.personId`, `identity.displayName`)
  3. Update unknown-sender test to expect `identity.status === "unknown"` (blocked by resolver, not by gate)
  4. Add test: simulation response includes identity field for resolved sender
  5. Add test: simulation response includes identity field for unknown sender
  6. Clarification test: wire resolver mock

### T11 — Update simulation API documentation
- **Category**: docs
- **Dependencies**: T06, T10
- **Files**: `docs/simulation-api.md`
- **Description**: 
  1. Add `identity` field to response shape documentation with all sub-fields
  2. Add example showing resolved identity in response
  3. Add example showing unknown identity in response
  4. Update limitations section to note identity resolution runs before gate evaluation
  5. Add note about demo seed data (Marta on whatsapp/voice/web_chat)

### T12 — Run validation
- **Category**: validate
- **Dependencies**: T01–T11
- **Files**: all
- **Description**: Run `npm run check` (TypeScript strict mode, zero errors) and `npm run test` (all tests pass). Fix any type errors or test failures.

## Dependency Graph

```
T01 (type) ──┬──→ T02 (port) ──→ T03 (impl) ──┬──→ T08 (resolver tests)
             │                                  │
             ├──→ T04 (result) ──┐              │
             │                   │              │
             │                   ├──→ T06 (use case) ──→ T09 (uc tests) ──→ T10 (e2e tests)
             │                   │              │                              │
T05 (input) ─┘                   │              ├──→ T07 (wire) ───────────────┘
                                 │              │
                                 └──────────────┘
                                                    T11 (docs) ←── T06, T10
                                                       │
                                                    T12 (validate) ←── all
```

## Execution Order (linearized)

1. T01 — Create ResolvedInboundActor type
2. T02 — Create ExternalIdentityResolver port
3. T05 — Add personId to ProcessInboundMessageInput (parallel-safe, no deps)
4. T03 — Create InMemoryExternalIdentityResolver
5. T04 — Add identity to ChannelInboundResult
6. T06 — Modify ProcessChannelInboundMessage
7. T07 — Wire resolver in pipeline
8. T08 — Write resolver tests
9. T09 — Update use case tests
10. T10 — Update simulation tests
11. T11 — Update docs
12. T12 — Run validation
