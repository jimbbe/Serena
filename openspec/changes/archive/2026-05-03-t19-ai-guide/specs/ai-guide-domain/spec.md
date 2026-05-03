# AI Guide Domain Specification

## Purpose

Define core domain types for the `ai-guide` module: use case identifiers, execution policies, contracts, and structured results.

## Requirements

### Requirement: GuideUseCaseId

The system SHALL define `GuideUseCaseId` as a string union type with exactly four valid values: `"serena.conversation.reply"`, `"serena.risk.review"`, `"serena.mediation.understand_request"`, and `"serena.mediation.clarify"`. No other values SHALL be accepted.

#### Scenario: Valid use case ID accepted

- GIVEN a valid GuideUseCaseId value
- WHEN the value is one of the four defined strings
- THEN the type system accepts it

#### Scenario: Invalid use case ID rejected

- GIVEN an arbitrary string value
- WHEN the value is not one of the four defined strings
- THEN the type system rejects it at compile time

### Requirement: ExecutionPolicy

The system SHALL define `ExecutionPolicy` with the following required fields: `maxTokens` (number), `temperature` (number), `retryOnFailure` (boolean), `maxRetries` (number), and `timeoutMs` (number). All fields SHALL be mandatory.

#### Scenario: Complete policy created

- GIVEN all five required fields with valid values
- WHEN an ExecutionPolicy is constructed
- THEN it is a valid policy

#### Scenario: Partial policy rejected

- GIVEN missing any required field
- WHEN an ExecutionPolicy is constructed
- THEN the type system rejects it

### Requirement: UseCaseContract

The system SHALL define `UseCaseContract` with the following required fields: `id` (GuideUseCaseId), `systemPrompt` (string), `inputTemplate` (string), `outputSchemaName` (string), and `executionPolicy` (ExecutionPolicy). Each contract SHALL represent one complete AI use case configuration.

#### Scenario: Complete contract created

- GIVEN all five required fields with valid values
- WHEN a UseCaseContract is constructed
- THEN it is a valid contract

#### Scenario: Contract with invalid ID rejected

- GIVEN a useCaseId that is not a valid GuideUseCaseId
- WHEN a UseCaseContract is constructed
- THEN the type system rejects it

### Requirement: GuideResult

The system SHALL define `GuideResult<T>` containing: `useCaseId` (GuideUseCaseId), `output` (generic T), `metadata` (object with `tokensUsed` optional number, `modelUsed` optional string, `executionTimeMs` required number, `retryCount` required number), and `audited` (boolean). The `audited` field SHALL indicate whether the invocation was successfully recorded in the audit log.

#### Scenario: Successful result with metadata

- GIVEN a completed AI invocation
- WHEN the pipeline produces a result
- THEN it contains useCaseId, output, metadata with executionTimeMs and retryCount, and audited flag

#### Scenario: Result with optional metadata fields

- GIVEN a completed AI invocation where provider returns token/model info
- WHEN the pipeline produces a result
- THEN metadata MAY include tokensUsed and modelUsed
