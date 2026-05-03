# Tasks: Módulo `ai-guide` para Serena

## Phase 1: Domain Types (Foundation)

- [x] 1.1 Create `apps/core/src/modules/ai-guide/domain/guide-use-case-id.ts` — branded type `GuideUseCaseId` for use case identification
- [x] 1.2 Create `apps/core/src/modules/ai-guide/domain/use-case-contract.ts` — type `UseCaseContract` defining the shape of a use case (id, systemPrompt, inputTemplate, outputSchemaName, executionPolicy)
- [x] 1.3 Create `apps/core/src/modules/ai-guide/domain/guide-result.ts` — generic type `GuideResult<T>` with output, metadata, audited (FIXED: removed extra ExecutionMetadata, made tokensUsed/modelUsed optional, typed useCaseId)
- [x] 1.4 Create `apps/core/src/modules/ai-guide/domain/execution-policy.ts` — type `ExecutionPolicy` with maxTokens, temperature, retryOnFailure, maxRetries, timeoutMs

## Phase 2: Application Ports (Contracts)

- [x] 2.1 Create `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts` — type alias `LlmProvider` with `invoke()` method signature (FIXED: removed LlmRequest/LlmResponse, added policy: ExecutionPolicy, made tokensUsed/modelUsed optional)
- [x] 2.2 Create `apps/core/src/modules/ai-guide/application/ports/ai-invocation-audit.ts` — type `AiInvocationAudit` with `record(input, result) → Promise<void>` (FIXED: removed AiInvocationRecord, two-param signature, returns Promise<void>, matches design exactly)

## Phase 3: Application Use Cases (Core Logic)

- [x] 3.1 Create `apps/core/src/modules/ai-guide/application/use-cases/contracts.ts` — define 3 pre-built use case contracts (conversation.reply, risk.review, mediation.understand_request) with placeholder prompts
- [x] 3.2 Create `apps/core/src/modules/ai-guide/application/use-cases/use-case-registry.ts` — `UseCaseRegistry` class with `register()`, `get()`, `getAll()` (FIXED: get() returns UseCaseContract | undefined per design)
- [x] 3.3 Create `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` — `ExecutionPipeline` class orchestrating LLM invocation + audit + retry + template interpolation
- [x] 3.4 Create `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-service.ts` — `AiGuideService` class as facade combining registry + pipeline; clarification throws NotImplementedError

## Phase 4: Infrastructure Memory (Mock Implementations)

- [x] 4.1 Create `apps/core/src/modules/ai-guide/infrastructure/memory/mock-llm-provider.ts` — `MockLlmProvider` implementing `LlmProvider` with configurable canned responses
- [x] 4.2 Create `apps/core/src/modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts` — `InMemoryAiInvocationAudit` implementing `AiInvocationAudit` with in-memory array storage + getRecords()

## Phase 5: Tests (Verification)

- [x] 5.1 Create `apps/core/src/modules/ai-guide/tests/use-case-registry.test.ts` — 5 tests: register/retrieve, undefined on unregistered, duplicate throws, getAll, empty getAll
- [x] 5.2 Create `apps/core/src/modules/ai-guide/tests/mock-llm-provider.test.ts` — 5 tests: determinism, content, different inputs, metadata, canned responses
- [x] 5.3 Create `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` — 8 tests: success, interpolation, audit recording, empty rejection, error no-retry, retry success, retry exhaust, audit failure
- [x] 5.4 Create `apps/core/src/modules/ai-guide/tests/ai-guide-service.test.ts` — 6 tests: conversation, risk, mediation, unregistered throws, clarification throws, clarification no-contract
- [x] 5.5 Create `apps/core/src/modules/ai-guide/tests/in-memory-ai-invocation-audit.test.ts` — 4 tests: record/retrieve, multiple in order, failed with error, empty

## Phase 6: Validation

- [x] 6.1 Run `npm run typecheck` — TypeScript compilation with zero errors
- [x] 6.2 Run `npm run test` — all 193 tests pass (28 new ai-guide + 165 existing)
- [x] 6.3 Verify zero imports from other Serena modules in all ai-guide files (independence principle)
