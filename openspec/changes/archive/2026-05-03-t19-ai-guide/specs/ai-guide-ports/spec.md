# AI Guide Ports Specification

## Purpose

Define abstract port interfaces that the `ai-guide` module depends on: LLM provider and invocation audit.

## Requirements

### Requirement: LlmProvider Port

The system SHALL define an `LlmProvider` interface with a single method `invoke(request)` that accepts an abstract request (containing system prompt, user prompt, and execution policy) and returns a response (containing content, optional tokens used, and optional model used). The interface SHALL be agnostic of any specific LLM provider implementation.

#### Scenario: Provider invoked with valid request

- GIVEN an LlmProvider implementation
- WHEN invoke is called with systemPrompt, userPrompt, and policy
- THEN it returns a response with content string

#### Scenario: Provider returns metadata

- GIVEN an LlmProvider implementation
- WHEN invoke completes successfully
- THEN the response MAY include tokensUsed and modelUsed

#### Scenario: Provider throws on failure

- GIVEN an LlmProvider implementation
- WHEN the underlying provider call fails
- THEN invoke SHALL throw an error

### Requirement: AiInvocationAudit Port

The system SHALL define an `AiInvocationAudit` interface with a single method `record(invocation)` that accepts invocation details (use case ID, system prompt, user prompt) and result information (output, tokens used, execution time, success flag, optional error). The method SHALL return void.

#### Scenario: Successful invocation recorded

- GIVEN an AiInvocationAudit implementation
- WHEN record is called with a successful invocation and its result
- THEN the invocation details are persisted

#### Scenario: Failed invocation recorded

- GIVEN an AiInvocationAudit implementation
- WHEN record is called with a failed invocation including error message
- THEN the failure details are persisted with success=false

#### Scenario: Audit is fire-and-forget

- GIVEN an AiInvocationAudit implementation
- WHEN record is called
- THEN it SHALL NOT block or throw on audit failure (audit failures are logged, not propagated)
