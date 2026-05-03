# Spec: External Identity Resolution for Inbound Pipeline

## Change: refactor-inbound-identity-resolution

## Purpose

Add an `ExternalIdentityResolver` port to the Serena inbound pipeline that translates external channel sender identifiers (`tenantId + channel + externalSenderId`) into internal domain identity (`personId`, `role`, `displayName`, `authorized`, `status`). This fixes the identity confusion bug where `ProcessChannelInboundMessage.adaptInput()` maps `externalSenderId` directly to `senderId`, conflating external channel identity with internal domain identity.

---

## Capability: external-identity-resolution

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

#### Scenario: Resolved sender has all fields populated

- GIVEN a known external sender on a registered channel
- WHEN the resolver processes the command
- THEN the result has `status: "resolved"`, `authorized: true`, and all fields populated

#### Scenario: Unknown sender has minimal fields

- GIVEN an unrecognized external sender
- WHEN the resolver processes the command
- THEN the result has `status: "unknown"`, `authorized: false`, `reason: "unknown_sender"`, and no `personId`, `actorId`, `role`, or `displayName`

#### Scenario: Blocked sender is flagged

- GIVEN a sender on a blocklist
- WHEN the resolver processes the command
- THEN the result has `status: "blocked"`, `authorized: false`, and `reason: "sender_blocked"`

---

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

#### Scenario: Resolver interface is a pure port

- GIVEN the `ExternalIdentityResolver` interface
- WHEN inspected
- THEN it has no implementation details, only the `resolve` method signature

#### Scenario: Resolver accepts channel-agnostic command

- GIVEN an `InboundMessageCommand` with `channel`, `externalSenderId`, and optional `tenantId`
- WHEN `resolve` is called
- THEN it returns a `ResolvedInboundActor`

---

### Requirement: InMemoryExternalIdentityResolver Implementation

The system SHALL implement `InMemoryExternalIdentityResolver` in `inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts` with demo seed data covering multiple channels. The key format SHALL be `tenantId:channel:externalSenderId` (tenantId defaults to `"demo"`).

The seed data SHALL include at minimum:
- **Marta** (elder_001) on `whatsapp` with external sender ID `"+5492600000000"`
- **Marta** (elder_001) on `voice` with external sender ID `"device_marta_livingroom"`
- **Marta** (elder_001) on `web_chat` with external sender ID `"session_abc"`
- A **blocked sender** on `whatsapp` with external sender ID `"+5499999999999"` for testing blocked identity flow

Each resolved seed entry SHALL map to:
- `personId: "elder_001"`
- `actorId: "elder_001"`
- `role: "elder"`
- `displayName: "Marta"`
- `authorized: true`

The blocked seed entry SHALL have:
- `authorized: false`
- `reason: "sender_blocked"`
- No `personId`, `actorId`, `role`, or `displayName`

#### Scenario: WhatsApp sender resolves to elder_001

- GIVEN a command with `channel: "whatsapp"` and `externalSenderId: "+5492600000000"`
- WHEN `resolve` is called
- THEN the result has `status: "resolved"`, `personId: "elder_001"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`

#### Scenario: Voice sender resolves to elder_001

- GIVEN a command with `channel: "voice"` and `externalSenderId: "device_marta_livingroom"`
- WHEN `resolve` is called
- THEN the result has `status: "resolved"`, `personId: "elder_001"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`

#### Scenario: Web chat sender resolves to elder_001

- GIVEN a command with `channel: "web_chat"` and `externalSenderId: "session_abc"`
- WHEN `resolve` is called
- THEN the result has `status: "resolved"`, `personId: "elder_001"`, `role: "elder"`, `displayName: "Marta"`, `authorized: true`

#### Scenario: Unknown sender returns unknown status

- GIVEN a command with `channel: "whatsapp"` and `externalSenderId: "unknown_person"`
- WHEN `resolve` is called
- THEN the result has `status: "unknown"`, `authorized: false`, and `reason: "unknown_sender"`

#### Scenario: Blocked sender returns blocked status

- GIVEN a command with `channel: "whatsapp"` and `externalSenderId: "+5499999999999"`
- WHEN `resolve` is called
- THEN the result has `status: "blocked"`, `authorized: false`, and `reason: "sender_blocked"`

#### Scenario: Resolver error returns unknown status

- GIVEN the resolver encounters an internal error
- WHEN `resolve` is called
- THEN the result has `status: "unknown"`, `authorized: false`, and `reason: "resolution_error"`
- AND a warning is logged (no crash)

---

### Requirement: ChannelInboundResult Includes Identity

The `ChannelInboundResult` type in `inbound-gate/application/results/channel-inbound-result.ts` SHALL be extended with an optional `identity` field:

```typescript
identity?: ResolvedInboundActor;
```

This field SHALL be placed after `simulatedOutbound` and before `warnings`.

#### Scenario: Result includes identity when resolved

- GIVEN a command from a known sender
- WHEN `ProcessChannelInboundMessage.execute` completes
- THEN `result.identity` contains the `ResolvedInboundActor` with `status: "resolved"`

#### Scenario: Result includes identity when unknown

- GIVEN a command from an unknown sender
- WHEN `ProcessChannelInboundMessage.execute` completes
- THEN `result.identity` contains the `ResolvedInboundActor` with `status: "unknown"`

#### Scenario: Result includes identity when blocked

- GIVEN a command from a blocked sender
- WHEN `ProcessChannelInboundMessage.execute` completes
- THEN `result.identity` contains the `ResolvedInboundActor` with `status: "blocked"`

---

### Requirement: ProcessInboundMessageInput Gains personId Field

The `ProcessInboundMessageInput` type in `inbound-gate/application/use-cases/process-inbound-message.ts` SHALL be extended with an optional `personId` field:

```typescript
export type ProcessInboundMessageInput = {
  senderId: string;     // external sender ID (kept for backward compatibility)
  personId?: string;    // resolved person ID (new, optional)
  text: string;
  receivedAt?: Date;
};
```

This is an additive change — `senderId` remains required for compatibility. The `personId` field is populated by `ProcessChannelInboundMessage.adaptInput()` when the identity resolver returns `status: "resolved"`.

--- 

### Requirement: ProcessChannelInboundMessage Uses Resolver

The `ProcessChannelInboundMessage` use case SHALL accept `ExternalIdentityResolver` as a new constructor dependency:

```typescript
export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  identityResolver: ExternalIdentityResolver;  // NEW
  generateTraceId?: () => string;
};
```

The execution flow SHALL be modified to:

1. Generate a trace ID
2. **Resolve identity** via `identityResolver.resolve(cmd)`
3. **If `status === "blocked"`**: return immediately with `inboundDecision: { status: "blocked", reason: "unknown_sender" }`, `identity`, no `guideResult`, no `profileId`, no `useCaseId`
4. **If `status === "unknown"`**: continue to the inbound gate for evaluation (the gate has its own contact directory check and may still block or allow); the external sender ID passes through as `senderId`
5. **If `status === "resolved"`**: continue with existing pipeline, using `identity.personId` as the internal `senderId` in `ProcessInboundMessageInput` (NOT `externalSenderId`)

#### Scenario: Unknown identity continues to gate

- GIVEN a command from an unknown external sender
- WHEN `execute` is called
- THEN `identityResolver.resolve` returns `status: "unknown"`
- AND `ProcessInboundMessage.execute` IS called (the gate still evaluates)
- AND the result has `identity.status === "unknown"`

#### Scenario: Blocked identity short-circuits pipeline

- GIVEN a command from a blocked external sender
- WHEN `execute` is called
- THEN `identityResolver.resolve` returns `status: "blocked"`
- AND `ProcessInboundMessage.execute` is NOT called
- AND `AiGuideService.execute` is NOT called
- AND the result has `identity.status === "blocked"`, `inboundDecision.status === "blocked"` with `reason: "unknown_sender"`, `profileId: undefined`, `useCaseId: undefined`, `guideResult: undefined`

#### Scenario: Resolved identity continues pipeline with personId

- GIVEN a command from a known external sender
- WHEN `execute` is called
- THEN `identityResolver.resolve` returns `status: "resolved"` with `personId: "elder_001"`
- AND `ProcessInboundMessage.execute` IS called with `senderId: "elder_001"` (NOT the externalSenderId)
- AND `AiGuideService.execute` IS called if the decision routes to a profile
- AND the result has `identity.status === "resolved"` and `identity.personId === "elder_001"`

#### Scenario: Resolved identity uses personId not externalSenderId

- GIVEN a command with `channel: "whatsapp"` and `externalSenderId: "+5492600000000"`
- WHEN `execute` is called and identity resolves to `personId: "elder_001"`
- THEN `ProcessInboundMessage.execute` receives `senderId: "elder_001"`
- AND NOT `senderId: "+5492600000000"`

#### Scenario: Resolver error treated as unknown

- GIVEN the `identityResolver.resolve` throws an error
- WHEN `execute` is called
- THEN the error is caught
- AND the pipeline treats the identity as `status: "unknown"` with `reason: "resolution_error"`
- AND a warning is added to `result.warnings`
- AND `ProcessInboundMessage.execute` IS called (gate still evaluates)
- AND the pipeline does NOT crash

---

### Requirement: Simulation API Response Includes Identity

The `POST /dev/simulate/inbound-message` endpoint response SHALL include the `identity` field in the JSON body, serialized from `ChannelInboundResult.identity`.

Since `createSimulationHandler` already returns the full `ChannelInboundResult` as JSON, this requirement is satisfied by the `ChannelInboundResult` type extension. No additional handler changes are needed.

#### Scenario: Simulation response includes resolved identity

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN POST `/dev/simulate/inbound-message` is called with `channel: "whatsapp"` and `externalSenderId: "+5492600000000"`
- THEN the response body contains `identity` with `status: "resolved"`, `personId: "elder_001"`, `displayName: "Marta"`

#### Scenario: Simulation response includes unknown identity

- GIVEN `ENABLE_SIMULATION_ENDPOINTS=true`
- WHEN POST `/dev/simulate/inbound-message` is called with `channel: "whatsapp"` and `externalSenderId: "nobody"`
- THEN the response body contains `identity` with `status: "unknown"` and `authorized: false`

---

### Requirement: Resolver Unit Tests

Tests SHALL exist at `inbound-gate/tests/in-memory-external-identity-resolver.test.ts` covering:

1. Known sender on whatsapp resolves correctly
2. Known sender on voice resolves correctly
3. Known sender on web_chat resolves correctly
4. Unknown sender returns unknown status
5. Blocked sender returns blocked status
6. Key normalization (tenantId defaults to "demo")
7. Custom tenantId is respected
8. Resolver never throws — errors caught internally

#### Scenario: All resolver scenarios tested

- GIVEN the `InMemoryExternalIdentityResolver`
- WHEN tested with seed data for each channel, unknown senders, blocked senders, and key normalization
- THEN each returns the correct `ResolvedInboundActor`

---

### Requirement: Pipeline Tests Updated for Identity

The existing tests at `inbound-gate/tests/process-channel-inbound-message.test.ts` SHALL be updated to:

1. Add `identityResolver` mock to all test constructors
2. Add test scenarios for unknown identity (continues to gate)
3. Add test scenarios for blocked identity (short-circuits)
4. Add test verifying `personId` (not `externalSenderId`) is passed to `ProcessInboundMessage`
5. Add test verifying `identity` field is present in all results
6. Add test for resolver error handling

#### Scenario: Existing tests still pass with resolver mock

- GIVEN all existing tests are updated with an identity resolver mock that returns `status: "resolved"`
- WHEN the test suite runs
- THEN all existing tests pass with the same assertions

#### Scenario: Unknown identity continues to gate test

- GIVEN a mock resolver that returns `status: "unknown"`
- WHEN `execute` is called
- THEN `ProcessInboundMessage.execute` IS called (gate evaluates)
- AND the result has `identity.status === "unknown"`

#### Scenario: Blocked identity short-circuit test

- GIVEN a mock resolver that returns `status: "blocked"`
- WHEN `execute` is called
- THEN `ProcessInboundMessage.execute` is NOT called
- AND `AiGuideService.execute` is NOT called
- AND the result has `identity.status === "blocked"`

#### Scenario: personId passed to ProcessInboundMessage

- GIVEN a mock resolver that returns `status: "resolved"` with `personId: "elder_001"`
- AND a mock `ProcessInboundMessage` that captures its input
- WHEN `execute` is called with `externalSenderId: "whatsapp_marta_001"`
- THEN `ProcessInboundMessage.execute` receives `senderId: "elder_001"`

---

### Requirement: Existing Simulation Tests Remain Passing

All existing simulation tests SHALL continue to pass after the identity resolution changes. This requires:

1. The `createInMemoryPipeline` function (or equivalent bootstrap wiring) SHALL provide an `InMemoryExternalIdentityResolver` instance with demo seed data
2. The resolver SHALL be wired into `ProcessChannelInboundMessage` during construction
3. Existing test commands that use known sender IDs SHALL resolve correctly (identity field populated with `status: "resolved"`)
4. Existing test commands that use unknown sender IDs SHALL resolve with `status: "unknown"` and continue to the gate for evaluation

#### Scenario: Existing known-sender tests pass

- GIVEN a simulation test with a known sender (e.g., Marta on whatsapp with `externalSenderId: "+5492600000000"`)
- WHEN the test runs
- THEN it passes with the same assertions as before, plus `identity.status === "resolved"` in the result

#### Scenario: Existing unknown-sender tests updated

- GIVEN a simulation test that previously expected unknown senders to be blocked by the inbound gate
- WHEN the test runs
- THEN it passes with `identity.status === "unknown"` in the result (gate still evaluates, may also block)

---

## Capability: inbound-simulation-usecase (Modified)

### Requirement: Execution Flow — Identity Resolution Phase

The `ProcessChannelInboundMessage` use case SHALL execute identity resolution as the FIRST step after trace ID generation, BEFORE calling `ProcessInboundMessage.execute`.

The flow SHALL be:

```
1. Generate traceId
2. Resolve identity via ExternalIdentityResolver
3. If identity.status === "blocked" → return early (blocked, no pipeline)
4. If identity.status === "unknown" → continue to step 5 (gate decides)
5. If identity.status === "resolved" → adapt input: use personId as senderId
6. Execute ProcessInboundMessage (gate evaluation)
7. Route decision → AI guide (existing flow)
8. Return ChannelInboundResult with identity field
```

#### Scenario: Identity resolution runs before gate evaluation

- GIVEN any command
- WHEN `execute` is called
- THEN `identityResolver.resolve` is called BEFORE `processInboundMessage.execute`

#### Scenario: Unknown identity continues to gate

- GIVEN identity resolves to `status: "unknown"`
- WHEN `execute` is called
- THEN steps 5-8 execute normally (externalSenderId passes through as senderId)
- AND the result includes the `identity` field with `status: "unknown"`

#### Scenario: Early return for blocked identity

- GIVEN identity resolves to `status: "blocked"`
- WHEN `execute` is called
- THEN the method returns at step 3
- AND steps 5-8 are NOT executed

#### Scenario: Pipeline continues for resolved identity

- GIVEN identity resolves to `status: "resolved"`
- WHEN `execute` is called
- THEN steps 5-8 execute normally with `personId` as the internal `senderId`
- AND the result includes the `identity` field with `status: "resolved"`

---

## Capability: inbound-simulation-endpoint (Modified)

### Requirement: Response Shape Includes Identity

The `POST /dev/simulate/inbound-message` response SHALL include the `identity` field as part of the serialized `ChannelInboundResult`. No additional handler logic is required since the handler already serializes the full result object.

---

## Capability: inbound-simulation-tests (Modified)

### Requirement: New Test Scenarios for Identity Resolution

The test suite SHALL include the following new scenarios:

| Scenario | Channel | externalSenderId | Expected identity.status | Pipeline Continues? |
|----------|---------|-----------------|-------------------------|---------------------|
| Known whatsapp sender | whatsapp | +5492600000000 | resolved | Yes |
| Known voice sender | voice | device_marta_livingroom | resolved | Yes |
| Known web_chat sender | web_chat | session_abc | resolved | Yes |
| Unknown sender | whatsapp | unknown_person | unknown | Yes (gate decides) |
| Blocked sender | whatsapp | +5499999999999 | blocked | No |
| Resolver error | whatsapp | any | unknown | Yes (gate decides) |

#### Scenario: All identity scenarios covered

- GIVEN the test suite
- WHEN it runs
- THEN all six scenarios above are tested

---

## Constraints

1. **Clean Architecture boundaries**: The resolver port lives in `application/ports/`, the implementation in `infrastructure/memory/`, and the result type in `application/results/`. No cross-layer violations.
2. **ENABLE_SIMULATION_ENDPOINTS=true** remains required for the simulation endpoint.
3. **TypeScript strict mode**: All types must be correct — no `any`, no implicit `any`.
4. **No breaking changes to ProcessInboundMessage input**: The `ProcessInboundMessageInput` type keeps `senderId: string`. The change is in what value is passed (personId instead of externalSenderId), not in the type shape.
5. **No real database**: The `InMemoryExternalIdentityResolver` is the only implementation for this change. No PostgreSQL or persistent storage.
6. **Resolver never crashes the pipeline**: Errors in the resolver are caught and treated as `status: "unknown"` with a warning.
