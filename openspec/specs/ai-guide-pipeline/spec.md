# AI Guide Pipeline Specification

## Purpose

Define the ExecutionPipeline that orchestrates AI use case execution: building requests, invoking providers, validating results, and recording audit entries.

## Requirements

### Requirement: Execute Pipeline

The system SHALL define `ExecutionPipeline` that accepts a `UseCaseContract` and input data, then produces a `GuideResult`. The pipeline SHALL: (1) build an abstract request from the contract's systemPrompt, the rendered input, the contract's executionPolicy, and the outputSchemaName, (2) invoke the LlmProvider with that request, (3) validate the result is not empty, (4) record an audit entry, and (5) return a GuideResult with all required fields.

#### Scenario: Successful pipeline execution

- GIVEN a UseCaseRegistry with a valid contract and a working LlmProvider
- WHEN the pipeline executes with valid input data
- THEN it returns a GuideResult with useCaseId, output, metadata, and audited=true

#### Scenario: Empty result rejected

- GIVEN a pipeline with an LlmProvider that returns empty content
- WHEN the pipeline executes
- THEN it SHALL throw an error indicating the result is empty

#### Scenario: Audit recorded after execution

- GIVEN a pipeline with an AiInvocationAudit port configured
- WHEN the pipeline executes successfully
- THEN the audit record method is called with the invocation details and result

### Requirement: Error Handling

The system SHALL handle provider errors without crashing the pipeline. When the LlmProvider throws, the pipeline SHALL catch the error, record a failed audit entry, and either retry (if the contract's executionPolicy has retryOnFailure=true and retry count is below maxRetries) or return a GuideResult indicating failure.

#### Scenario: Provider error without retry

- GIVEN a contract with retryOnFailure=false
- WHEN the LlmProvider throws an error
- THEN the pipeline catches the error, records a failed audit, and returns a failed GuideResult

#### Scenario: Provider error with retry succeeds

- GIVEN a contract with retryOnFailure=true and maxRetries=2
- WHEN the LlmProvider fails on first attempt but succeeds on second
- THEN the pipeline returns a successful GuideResult with retryCount=1

#### Scenario: Provider error exhausts retries

- GIVEN a contract with retryOnFailure=true and maxRetries=2
- WHEN the LlmProvider fails on all attempts
- THEN the pipeline returns a failed GuideResult with retryCount=2

#### Scenario: Audit failure does not crash pipeline

- GIVEN a pipeline where the AiInvocationAudit port throws on record
- WHEN the pipeline executes
- THEN the pipeline catches the audit error and still returns the GuideResult
