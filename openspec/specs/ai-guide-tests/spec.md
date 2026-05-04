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
- THEN includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=true, includeConversationHistory=true, maxRecentMessages=8, includeSafetyMemory=true, includeKnownContacts=false, includeFullConversation=false

#### Scenario: Risk review contextPolicy

- GIVEN the ContextPolicy for `serena.risk.review`
- WHEN evaluated
- THEN includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=true, includeConversationHistory=true, maxRecentMessages=5, includeSafetyMemory=true, includeKnownContacts=false, includeFullConversation=false

### Requirement: ContextBuilder Tests

The system SHALL include tests for `ContextBuilder` covering: building with all data available, handling missing optional data gracefully, NOT including full conversation when the flag is false, respecting maxRecentMessages limit, not crossing tenant boundaries, and handling empty current message gracefully.

#### Scenario: ContextBuilder with all data

- GIVEN a ContextPolicy with includeCurrentMessage=true, includeConversationHistory=true (maxRecentMessages=3), includeResolvedIdentity=true
- WHEN ContextBuilder.build() is called with currentMessage="Hola", 4 recent messages, resolvedIdentity="Abuela Rosa"
- THEN the output includes "Hola", "Abuela Rosa", and only the 3 most recent messages

#### Scenario: ContextBuilder handles missing optional data

- GIVEN a ContextPolicy with includeKnownContacts=true, includeSafetyMemory=true
- WHEN ContextBuilder.build() is called WITHOUT knownContacts or safetyMemory
- THEN the output is built successfully without those sections

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

Tests SHALL cover: successful execution with valid contract, PromptRegistry, and provider; pipeline records audit with promptId and promptVersion; pipeline builds user prompt via ContextBuilder; pipeline fails gracefully when prompt not in registry; empty result handling; provider error handling with and without retry.

#### Scenario: Pipeline executes successfully with prompt metadata

- GIVEN a valid contract, PromptRegistry, ContextBuilder, and MockLlmProvider
- WHEN the pipeline executes with input
- THEN a GuideResult is returned with promptId, promptVersion in metadata and audited=true

#### Scenario: Pipeline fails when prompt not in registry

- GIVEN a contract with a promptId not in the registry
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

The system SHALL ensure that all 28 existing tests continue to pass after the prompt-registry update, with updated contract factories and mock keying. The total test count SHALL be 334 (28 existing + 3 new test files with 28 new tests + cross-module updates).

#### Scenario: Full test suite passes

- GIVEN all test files are updated to the new prompt-registry shape
- WHEN `npm run check` is executed
- THEN all 334 tests pass with zero failures

### Requirement: Test Isolation

Tests SHALL NOT require a real LLM provider. All tests SHALL use `MockLlmProvider`, `InMemoryPromptRegistry`, and `InMemoryAiInvocationAudit`. No network calls SHALL be made during test execution.

#### Scenario: All tests pass offline

- GIVEN no network connectivity
- WHEN all ai-guide tests are executed
- THEN all tests pass using only mock implementations
