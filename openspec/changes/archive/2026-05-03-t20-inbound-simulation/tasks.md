# Tasks: T20 — Channel-Agnostic Simulation Endpoint

## Phase 1: Domain Types

### 1.1 — Create `InboundMessageCommand` and `InboundChannel` types
**File**: `apps/core/src/modules/inbound-gate/domain/inbound-message-command.ts` (NEW) ✅

Define:
- `InboundChannel` type union: `"whatsapp" | "voice" | "web_chat" | "telegram" | "system" | "simulation"`
- `InboundMessageCommand` type with fields: `channel`, `externalSenderId`, `text` (required); `tenantId`, `personId`, `conversationId`, `occurredAt`, `metadata` (optional)

**Acceptance**: TypeScript compiles; types match spec `inbound-simulation-command`.

---

### 1.2 — Create `profileToUseCaseId` pure mapping function
**File**: `apps/core/src/modules/inbound-gate/domain/profile-to-usecase.ts` (NEW) ✅

Define:
- Pure function `profileToUseCaseId(profileId: LlmProfileId): GuideUseCaseId`
- Exhaustive switch/record mapping: `conversation` → `serena.conversation.reply`, `mediation_understanding` → `serena.mediation.understand_request`, `risk_review` → `serena.risk.review`, `clarification` → `serena.mediation.clarify`
- Cross-module import: `GuideUseCaseId` from `ai-guide/domain/guide-use-case-id.ts`

**Acceptance**: Function is pure (no I/O), TypeScript exhaustiveness ensures new profiles cause compile error.

---

### 1.3 — Create `ChannelInboundResult` response type
**File**: `apps/core/src/modules/inbound-gate/domain/channel-inbound-result.ts` (NEW) ✅

Define:
- `SimulatedOutbound` type: `{ toParticipantId, text, includesSerenaIntroduction, attribution: { fromParticipantId, fromDisplayName } }`
- `ChannelInboundResult` type with fields: `traceId`, `channel`, `inboundDecision`, `profileId` (undefined), `useCaseId` (undefined), `guideResult` (undefined), `guideError` (optional `{ message, code? }`), `simulatedOutbound` (optional), `warnings: string[]`, `errors: string[]`
- Imports: `InboundDecision` from same module, `LlmProfileId` from same module, `GuideUseCaseId` from ai-guide, `GuideResult` from ai-guide

**Acceptance**: Type matches spec `inbound-simulation-usecase` ChannelInboundResult requirements.

---

## Phase 2: Application Use Case

### 2.1 — Create `ProcessChannelInboundMessage` use case
**File**: `apps/core/src/modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts` (NEW) ✅

Define:
- `ProcessChannelInboundMessageDependencies` type: `{ processInboundMessage: { execute(...) }, aiGuideService: { execute(...) }, generateTraceId?: () => string }`
- `ProcessChannelInboundMessage` class with constructor(deps) and `async execute(cmd: InboundMessageCommand): Promise<ChannelInboundResult>`

Execute flow:
1. Generate traceId (via `generateTraceId` or `crypto.randomUUID`)
2. Adapt command to `ProcessInboundMessageInput`: `externalSenderId` → `senderId`, `text` → `text`, `occurredAt` → `receivedAt` (parse ISO or use `new Date()`)
3. Call `processInboundMessage.execute(adaptedInput)`
4. If `route.nextStep === "discard"` → return result with null profileId/useCaseId/guideResult
5. If `route.nextStep === "llm_profile_required"` → map profileId via `profileToUseCaseId`, call `aiGuideService.execute(useCaseId, { senderId: cmd.externalSenderId, text: cmd.text })`
6. Catch `Error` with message containing "Not implemented" (clarification) → return structured `guideError`, `warnings`, no throw
7. Return full `ChannelInboundResult`

**Acceptance**: Use case handles discard, conversation, mediation, risk_review, and clarification paths. Does NOT send real messages.

---

## Phase 3: Infrastructure / Bootstrap

### 3.1 — Add `enableSimulationEndpoints` to `AppEnv`
**File**: `apps/core/src/config/env.ts` (MODIFY) ✅

Changes:
- Add `enableSimulationEndpoints: boolean` to `AppEnv` type
- Parse `ENABLE_SIMULATION_ENDPOINTS` in `loadAppEnv`: only `"true"` (case-insensitive) → `true`, everything else → `false`

**Acceptance**: `loadAppEnv()` returns `enableSimulationEndpoints: false` by default; `"true"` or `"TRUE"` returns `true`; `"false"`, `"0"`, unset all return `false`.

---

### 3.2 — Wire `AiGuideService` in `createInMemoryPipeline`
**File**: `apps/core/src/bootstrap/create-in-memory-pipeline.ts` (MODIFY) ✅

Changes:
- Import `AiGuideService`, `UseCaseRegistry`, `defaultContracts`, `MockLlmProvider`, `InMemoryAiInvocationAudit`, `ExecutionPipeline`
- Create and wire: `UseCaseRegistry` + register all `defaultContracts` + `MockLlmProvider` + `InMemoryAiInvocationAudit` + `ExecutionPipeline` → `AiGuideService`
- Extend return type to include `aiGuideService: AiGuideService`

**Acceptance**: `createInMemoryPipeline()` returns `{ orchestrator, bridgeStore, processedMessageStore, aiGuideService }`. AiGuideService uses MockLlmProvider (no real LLM calls).

---

### 3.3 — Add 4th optional param and simulation route to `createHttpServer`
**File**: `apps/core/src/bootstrap/server.ts` (MODIFY) ✅

Changes:
- Add `simulationHandler?: PipelineRequestHandler` as 4th optional parameter to `createHttpServer`
- Before the "Unknown route" fallback, add route check for `/dev/simulate/inbound-message`:
  - If `simulationHandler` is provided → invoke it
  - If not provided → fall through to 404
- No token guard for this route (dev-only)

**Acceptance**: Existing callers work unchanged (backward compatible). When handler provided, route is mounted. When absent, 404.

---

### 3.4 — Create `createSimulationHandler` HTTP handler
**File**: `apps/core/src/bootstrap/simulation-handler.ts` (NEW) ✅

Define:
- `createSimulationHandler(useCase: ProcessChannelInboundMessage): PipelineRequestHandler`
- Handler logic:
  1. Check `req.method === "POST"` → 405 if not
  2. Read and parse JSON body → 400 with `{ error: "invalid_json" }` if invalid
  3. Validate required fields: `channel` (one of 6 values), `externalSenderId` (non-empty trimmed), `text` (non-empty trimmed) → 400 with `{ error: "invalid_payload", fields: [...] }` if invalid
  4. Validate optional fields if present: `occurredAt` (ISO 8601), `tenantId`/`personId`/`conversationId` (non-empty strings), `metadata` (object)
  5. Build `InboundMessageCommand` and call `useCase.execute(cmd)`
  6. Return 200 with `ChannelInboundResult` as JSON
  7. Catch unexpected errors → 500 with `{ error: "pipeline_execution_failed" }`

**Acceptance**: Handler validates, dispatches, responds correctly. No uncaught exceptions.

---

### 3.5 — Wire simulation handler in `server.ts` bootstrap
**File**: `apps/core/src/server.ts` (MODIFY) ✅

Changes:
- Import `createSimulationHandler` and `ProcessChannelInboundMessage`
- Destructure `aiGuideService` from `createInMemoryPipeline()`
- If `env.enableSimulationEndpoints` is true:
  - Create `ProcessChannelInboundMessage` with `processInboundMessage` from pipeline and `aiGuideService`
  - Create `simulationHandler = createSimulationHandler(useCase)`
  - Pass `simulationHandler` as 4th arg to `createHttpServer`
- If disabled: pass `undefined` as 4th arg
- Log simulation route status on startup

**Acceptance**: Server starts with simulation disabled by default. When `ENABLE_SIMULATION_ENDPOINTS=true`, route is available.

---

## Phase 4: Tests

### 4.1 — Unit tests for `profileToUseCaseId`
**File**: `apps/core/src/modules/inbound-gate/tests/profile-to-usecase.test.ts` (NEW) ✅

Tests:
- All four profile → use case mappings (conversation, mediation_understanding, risk_review, clarification)
- Deterministic behavior (same input → same output)
- Pure function (no side effects)

**Acceptance**: 100% branch and line coverage for `profile-to-usecase.ts`.

---

### 4.2 — Unit tests for `ProcessChannelInboundMessage`
**File**: `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` (NEW) ✅

Tests:
- Blocked sender flow (no AI call, null profileId/useCaseId/guideResult)
- Invalid sender (blank) → blocked with `invalid_sender`
- Invalid text (blank) → blocked with `invalid_text`
- Allowed sender → conversation flow (AI called with `serena.conversation.reply`)
- Needs mediation → risk review flow (AI called with `serena.risk.review`)
- Needs mediation → mediation understanding flow (AI called with `serena.mediation.understand_request`)
- Clarification flow (Error with "Not implemented" caught, structured guideError returned)
- Trace ID generated (non-empty string)
- Custom trace ID generator is used when provided
- occurredAt parsed correctly from ISO string
- Missing occurredAt defaults to current time
- Result structure completeness (all fields present)

**Acceptance**: At least 90% line coverage for `process-channel-inbound-message.ts`.

---

### 4.3 — Integration tests for simulation endpoint
**File**: `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` (NEW) ✅

Tests:
- Endpoint disabled → 404 with `{ error: "simulation_not_enabled" }`
- Valid payload (known sender) → 200 with full trace (traceId, inboundDecision, profileId, useCaseId, guideResult)
- Invalid JSON → 400 with `{ error: "invalid_json" }`
- Missing required fields → 400 with `{ error: "invalid_payload", fields: [...] }`
- Invalid channel value → 400 with field error
- Blocked sender (unknown) → 200 with `inboundDecision.status === "blocked"`, no guideResult
- Conversation (known sender) → 200 with guideResult present
- Clarification → 200 with `guideError.code === "not_implemented"` (NOT 500)
- Wrong HTTP method (GET) → 405 with `{ error: "method_not_allowed" }`
- Existing pipeline endpoint (`POST /internal/pipeline/process`) unchanged — no regression

**Acceptance**: All 10 scenarios pass. Uses same `request()` helper pattern as `internal-pipeline-http.test.ts`.

---

## Phase 5: Documentation

### 5.1 — Create `docs/simulation-api.md`
**File**: `docs/simulation-api.md` (NEW) ✅

Structure:
1. **Overview** — What the endpoint does, when to use it
2. **Prerequisites** — `ENABLE_SIMULATION_ENDPOINTS=true`
3. **Endpoint** — `POST /dev/simulate/inbound-message`
4. **Request** — JSON schema with field table (channel, externalSenderId, text, tenantId, personId, conversationId, occurredAt, metadata)
5. **Response** — JSON schema with `ChannelInboundResult` field table
6. **Examples** — curl for conversation, blocked sender, clarification
7. **Error codes** — 400, 404, 405, 500
8. **Limitations** — No real LLM, empty simulatedOutbound in Phase 1, MockLlmProvider determinism

**Acceptance**: Document is clear, complete, and matches actual implementation.

---

## Phase 6: Validation

### 6.1 — Run `npm run check` and fix any issues
**Action**: Execute `npm run check` from project root ✅

**Acceptance**: Zero errors, zero warnings. TypeScript compilation, linting, and type checking all pass.

---

### 6.2 — Run full test suite and verify no regressions
**Action**: Execute `npm test` from project root ✅

**Acceptance**: All existing 239+ tests pass. New T20 tests pass. No regression in existing behavior.
  - Core: 239 tests (0 fail)
  - Gateway-WA: 38 tests (0 fail)
  - Total: 277 tests passing
