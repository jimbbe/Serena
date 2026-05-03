# AI Guide Mocks Specification

## Purpose

Define in-memory mock implementations for testing: MockLlmProvider and InMemoryAiInvocationAudit.

## Requirements

### Requirement: MockLlmProvider Deterministic Responses

The system SHALL define `MockLlmProvider` that returns deterministic responses based on input. Given the same systemPrompt and userPrompt, it SHALL always return the same content. The response SHALL simulate realistic metadata including `tokensUsed`, `modelUsed`, and `executionTimeMs`.

#### Scenario: Deterministic response for same input

- GIVEN a MockLlmProvider
- WHEN invoke is called twice with identical systemPrompt and userPrompt
- THEN both calls return the same content string

#### Scenario: Response includes simulated metadata

- GIVEN a MockLlmProvider
- WHEN invoke is called
- THEN the response includes tokensUsed (number), modelUsed (string), and executionTimeMs (number)

#### Scenario: Different input produces different response

- GIVEN a MockLlmProvider
- WHEN invoke is called with different userPrompt values
- THEN the responses differ

### Requirement: InMemoryAiInvocationAudit

The system SHALL define `InMemoryAiInvocationAudit` that stores invocation records in memory. Records SHALL be accessible for test verification via a method that returns all recorded invocations. The audit SHALL store both the invocation input (useCaseId, systemPrompt, userPrompt) and the result (output, tokensUsed, executionTimeMs, success, error).

#### Scenario: Invocation recorded and retrievable

- GIVEN an empty InMemoryAiInvocationAudit
- WHEN record is called with invocation details and result
- THEN getRecords returns an array containing that record

#### Scenario: Multiple invocations stored in order

- GIVEN an InMemoryAiInvocationAudit
- WHEN record is called three times
- THEN getRecords returns all three records in the order they were recorded

#### Scenario: Records accessible for test assertions

- GIVEN an InMemoryAiInvocationAudit with recorded invocations
- WHEN a test inspects the records
- THEN the test can assert on useCaseId, success flag, and output content
