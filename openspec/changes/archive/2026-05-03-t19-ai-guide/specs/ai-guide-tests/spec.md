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

Tests SHALL cover: successful execution with valid contract and provider, empty result rejection, provider error without retry, provider error with retry that succeeds, provider error that exhausts retries, and audit recording after execution.

#### Scenario: Pipeline executes successfully

- GIVEN a valid contract and a MockLlmProvider
- WHEN the pipeline executes with input
- THEN a GuideResult is returned with correct useCaseId and audited=true

#### Scenario: Pipeline handles provider error

- GIVEN a contract with retryOnFailure=false
- WHEN the provider throws
- THEN the pipeline catches the error and returns a failed result

### Requirement: Service Tests

Tests SHALL cover: executing each registered use case (serena.conversation.reply, serena.risk.review, serena.mediation.understand_request), unregistered use case ID throwing, and clarification use case returning "not implemented" error.

#### Scenario: Service executes conversation use case

- GIVEN AiGuideService with all contracts registered
- WHEN execute is called with useCaseId="serena.conversation.reply"
- THEN the result has useCaseId="serena.conversation.reply"

#### Scenario: Service rejects unregistered use case

- GIVEN AiGuideService
- WHEN execute is called with an unregistered useCaseId
- THEN an error is thrown

### Requirement: Test Isolation

Tests SHALL NOT require a real LLM provider. All tests SHALL use `MockLlmProvider` and `InMemoryAiInvocationAudit`. No network calls SHALL be made during test execution.

#### Scenario: All tests pass offline

- GIVEN no network connectivity
- WHEN all ai-guide tests are executed
- THEN all tests pass using only mock implementations
