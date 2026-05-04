# AI Guide Tests Specification

## Purpose

Define testing requirements for the `ai-guide` module: framework constraints, coverage scope, and isolation rules.

## Requirements

### Requirement: Test Framework

The system SHALL use `node:test` as the test framework and `node:assert/strict` for assertions. No external test frameworks (jest, vitest, mocha, etc.) SHALL be used. All test files SHALL be located in `apps/core/src/modules/ai-guide/tests/`.

#### Scenario: Tests run with node:test

- GIVEN the ai-guide module tests
- WHEN executed with `node --test`
- THEN all tests pass without requiring any external test runner

### Requirement: PromptRegistry Tests

The system SHALL include tests for `InMemoryPromptRegistry` covering: registering and retrieving each of the 4 prompts by ID, getting an unknown prompt throws with the promptId in the error message, listing returns all 4 prompts, duplicate IDs throw on construction, deterministic behavior (same input → same output), and isolation (no external dependencies).

#### Scenario: Registry returns each prompt by ID

- GIVEN an InMemoryPromptRegistry with default prompts
- WHEN `get()` is called for each of the 4 promptIds
- THEN each returns its corresponding PromptDefinition

#### Scenario: Registry fails for missing prompt

- GIVEN an InMemoryPromptRegistry
- WHEN `get("serena.fake.v99")` is called
- THEN an error is thrown containing the promptId

### Requirement: ContextPolicy Tests

The system SHALL include tests for `ContextPolicy` covering: each of the 4 use cases has the correct ContextPolicy matching the REQ-4 table, `includeFullConversation` is false for all use cases, conversation.reply uses text output, and the 3 JSON use cases use json output.

#### Scenario: Conversation reply contextPolicy

- GIVEN the ContextPolicy for `serena.conversation.reply`
- WHEN evaluated
- THEN includeCurrentMessage=true, includeResolvedIdentity=true, includeActorContext=true, includeChannelMetadata=true, includeConversationHistory=false, includeKnownContacts=false, includeSafetyMemory=false, includeFullConversation=false

#### Scenario: Risk review contextPolicy

- GIVEN the ContextPolicy for `serena.risk.review`
- WHEN evaluated
- THEN includeCurrentMessage=true, includeResolvedIdentity=true, includeActorContext=true, includeChannelMetadata=true, includeConversationHistory=false, includeKnownContacts=false, includeSafetyMemory=false, includeFullConversation=false

### Requirement: ContextBuilder Tests

The system SHALL include tests for `ContextBuilder` covering: building with all data available, handling missing optional data gracefully, NOT including full conversation when the flag is false, respecting maxRecentMessages limit, not crossing tenant boundaries, and handling empty current message gracefully.

#### Scenario: ContextBuilder with all data

- GIVEN a ContextPolicy with includeCurrentMessage=true, includeConversationHistory=true (maxRecentMessages=3), includeResolvedIdentity=true
- WHEN ContextBuilder.build() is called in isolation with currentMessage="Hola", 4 recent messages, resolvedIdentity="Abuela Rosa"
- THEN the output includes "Hola", "Abuela Rosa", and only the 3 most recent messages (note: Phase 1 prompts set includeConversationHistory=false, but the builder supports the flag when enabled)

#### Scenario: ContextBuilder handles missing optional data

- GIVEN a ContextPolicy with includeKnownContacts=true, includeSafetyMemory=true
- WHEN ContextBuilder.build() is called in isolation WITHOUT knownContacts or safetyMemory (note: Phase 1 prompts set these to false, but the builder handles them gracefully when enabled)

### Requirement: Registry Tests

Tests SHALL cover: registering a new contract, retrieving a registered contract, attempting to retrieve an unregistered contract (returns undefined), attempting to register a duplicate contract (throws), and listing all registered contracts.

#### Scenario: Register and retrieve contract

- GIVEN an empty UseCaseRegistry
- WHEN a contract is registered and then retrieved by its ID
- THEN the retrieved contract matches the registered one

#### Scenario: Unregistered contract returns undefined

- GIVEN a UseCaseRegistry with no contracts
- WHEN get is called with any ID
- THEN undefined is returned

### Requirement: Pipeline Tests

Tests SHALL cover: successful execution with valid contract, PromptRegistry, and provider; pipeline records audit with promptId and promptVersion; pipeline builds user prompt via ContextBuilder; pipeline fails gracefully when prompt not in registry; empty result handling; provider error handling with and without retry; output contract validation failures (invalid JSON, missing required fields, invalid enum values) treated as hard failures with no retry, audit recording success=false and preserving provider output.

#### Scenario: Pipeline executes successfully with prompt metadata

- GIVEN a valid contract, PromptRegistry, ContextBuilder, and MockLlmProvider
- WHEN the pipeline executes with input
- THEN a GuideResult is returned with promptId, promptVersion in metadata and audited=true

#### Scenario: Pipeline fails when prompt not in registry

- GIVEN a contract with a promptId not in the registry
- WHEN the pipeline executes
- THEN it returns a failed GuideResult

#### Scenario: Pipeline fails on output contract validation

- GIVEN a provider that returns invalid JSON for a JSON contract
- WHEN the pipeline executes
- THEN it returns a failed GuideResult with "Output contract validation failed:" prefix
- AND audit records success=false with the provider output preserved
- AND the pipeline does NOT retry even with retryOnFailure=true

#### Scenario: Pipeline fails on missing required field

- GIVEN a provider that returns JSON missing a required field
- WHEN the pipeline executes
- THEN it returns a failed GuideResult

#### Scenario: Pipeline fails on invalid enum value

- GIVEN a provider that returns JSON with an enum value outside allowedValues
- WHEN the pipeline executes
- THEN it returns a failed GuideResult

### Requirement: Service Tests

Tests SHALL cover: executing each registered use case (serena.conversation.reply, serena.risk.review, serena.mediation.understand_request), unregistered use case ID throwing, and clarification use case returning "not implemented" error.

#### Scenario: Service executes conversation use case

- GIVEN AiGuideService with all contracts and PromptRegistry
- WHEN execute is called with useCaseId="serena.conversation.reply"
- THEN the result has useCaseId="serena.conversation.reply"

#### Scenario: Service rejects unregistered use case

- GIVEN AiGuideService
- WHEN execute is called with an unregistered useCaseId
- THEN an error is thrown

### Requirement: MockLlmProvider Tests

Tests SHALL cover: canned responses keyed by promptId (not systemPrompt text), mock does not depend on exact prompt text, fallback for unconfigured use cases generates deterministic response using promptId + userPrompt hash, and backward compatibility (unconfigured mock still returns a deterministic response).

#### Scenario: Canned response by promptId

- GIVEN a MockLlmProvider configured with a canned response for promptId `serena.conversation.reply.v1`
- WHEN invoked with that promptId and a different systemPrompt
- THEN the same canned response is returned

#### Scenario: Mock fallback for unconfigured use case

- GIVEN a MockLlmProvider with no canned response
- WHEN invoke() is called
- THEN a deterministic fallback response is generated

### Requirement: InMemoryAiInvocationAudit Tests

Tests SHALL cover: records invocation with auditId, promptId, promptVersion and retrieves it; systemPrompt MUST NOT be present in AuditRecord; multiple invocations stored in order; and audit input includes promptId/promptVersion.

#### Scenario: Audit records prompt metadata

- GIVEN an InMemoryAiInvocationAudit
- WHEN record() is called with promptId and promptVersion
- THEN the stored AuditRecord contains promptId and promptVersion

#### Scenario: Audit does not store systemPrompt

- GIVEN an AuditRecord
- WHEN the record is inspected
- THEN it does NOT have a systemPrompt field

### Requirement: All Existing Tests Pass

The system SHALL ensure that all tests continue to pass after each change. The full test suite (core + gateway-wa) SHALL pass with zero failures, and all tests SHALL use only mock implementations without external dependencies.

#### Scenario: Full test suite passes

- GIVEN all test files are up to date
- WHEN `npm run test` is executed
- THEN all tests pass with zero failures

### Requirement: OutputContract Validation Tests

The system SHALL include tests for `validateOutputContract()` covering all supported field types and edge cases: text format empty/valid, JSON parse errors, JSON non-object input, missing required fields, type mismatches for each supported type, allowedValues for string/enum/string[]/enum[] fields, optional fields, and integration with the 4 real contracts.

### Requirement: Test Isolation

Tests SHALL NOT require a real LLM provider. All tests SHALL use `MockLlmProvider`, `InMemoryPromptRegistry`, and `InMemoryAiInvocationAudit`. No network calls SHALL be made during test execution.

#### Scenario: All tests pass offline

- GIVEN no network connectivity
- WHEN all ai-guide tests are executed
- THEN all tests pass using only mock implementations
