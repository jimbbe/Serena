# AI Guide Mocks Specification

## Purpose

Define in-memory mock implementations for testing: MockLlmProvider, InMemoryPromptRegistry, and InMemoryAiInvocationAudit.

## Requirements

### Requirement: InMemoryPromptRegistry

The system SHALL define `InMemoryPromptRegistry` that implements the `PromptRegistry` port. On construction, it SHALL validate that all registered prompts have unique IDs — if duplicates exist, it SHALL throw an error. It SHALL provide `get(promptId)` that returns a PromptDefinition or throws with the promptId in the error message, and `list()` that returns all registered prompts.

#### Scenario: Register and retrieve

- GIVEN an InMemoryPromptRegistry with 4 default prompts
- WHEN `get()` is called for each promptId
- THEN each returns its corresponding PromptDefinition

#### Scenario: Missing prompt throws with ID

- GIVEN an InMemoryPromptRegistry
- WHEN `get()` is called with an unknown promptId
- THEN an error is thrown containing the unknown promptId

#### Scenario: Duplicate IDs rejected on construction

- GIVEN two PromptDefinitions with the same ID
- WHEN the registry is constructed with both
- THEN a validation error is thrown

### Requirement: MockLlmProvider Deterministic Responses

The system SHALL define `MockLlmProvider` that returns deterministic responses based on input. The mock SHALL key canned responses by `useCaseId` or `promptId`, NOT by `systemPrompt` text. Given the same promptId and userPrompt, it SHALL always return the same content. The fallback deterministic hash SHALL use `promptId + userPrompt` instead of `systemPrompt + userPrompt`. The response SHALL simulate realistic metadata including `tokensUsed`, `modelUsed`, and `executionTimeMs`.

#### Scenario: Canned responses keyed by promptId

- GIVEN a MockLlmProvider configured with a canned response for promptId `serena.conversation.reply.v1`
- WHEN invoke is called with that promptId
- THEN the canned response is returned

#### Scenario: Mock does not depend on exact prompt text

- GIVEN a MockLlmProvider configured for a given promptId
- WHEN invoked with different systemPrompt text but the same promptId
- THEN the same canned response is returned (keying is NOT by systemPrompt text)

#### Scenario: Deterministic fallback for unconfigured promptId

- GIVEN a MockLlmProvider with no canned response for a specific promptId
- WHEN invoke is called
- THEN a deterministic fallback response is generated using promptId + userPrompt hash

#### Scenario: Response includes simulated metadata

- GIVEN a MockLlmProvider
- WHEN invoke is called
- THEN the response includes tokensUsed (number), modelUsed (string), and executionTimeMs (number)

#### Scenario: Backward compatibility

- GIVEN a test that creates a MockLlmProvider without configuring canned responses
- WHEN invoke is called
- THEN a deterministic response is returned (test does not crash)

### Requirement: InMemoryAiInvocationAudit

The system SHALL define `InMemoryAiInvocationAudit` that stores invocation records in memory. Records SHALL be accessible for test verification via a method that returns all recorded invocations. The audit SHALL store the invocation input (useCaseId, promptId, promptVersion, userPrompt) and the result (output, tokensUsed, executionTimeMs, success, error). The `systemPrompt` field SHALL NOT be stored in records.

#### Scenario: Invocation recorded with prompt metadata

- GIVEN an empty InMemoryAiInvocationAudit
- WHEN record is called with invocation details including promptId and promptVersion
- THEN getRecords returns an array containing that record with promptId and promptVersion

#### Scenario: Multiple invocations stored in order

- GIVEN an InMemoryAiInvocationAudit
- WHEN record is called three times
- THEN getRecords returns all three records in the order they were recorded

#### Scenario: Records accessible for test assertions

- GIVEN an InMemoryAiInvocationAudit with recorded invocations
- WHEN a test inspects the records
- THEN the test can assert on useCaseId, promptId, promptVersion, success flag, and output content

#### Scenario: Audit does not store systemPrompt

- GIVEN an AuditRecord
- WHEN the record is inspected
- THEN it does NOT have a systemPrompt field
