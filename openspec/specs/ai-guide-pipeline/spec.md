# AI Guide Pipeline Specification

## Purpose

Define the ExecutionPipeline that orchestrates AI use case execution: resolving prompts from registry, building context via ContextBuilder, invoking providers, validating results, and recording audit entries.

## Requirements

### Requirement: Execute Pipeline

The system SHALL define `ExecutionPipeline` that depends on a `PromptRegistry` and `ContextBuilder`. The pipeline SHALL accept a `UseCaseContract` and input data, then produce a `GuideResult`. The pipeline SHALL: (1) load the prompt from `PromptRegistry` using `contract.promptId`, (2) build the user prompt via `ContextBuilder.build()` using the prompt's `contextPolicy`, (3) invoke the LlmProvider with promptId, promptVersion, systemPrompt, userPrompt, optional developerPrompt, and executionPolicy, (4) validate the result is not empty, (5) record an audit entry with promptId and promptVersion, and (6) return a GuideResult with promptId and promptVersion in metadata.

The pipeline SHALL NOT call `renderTemplate` — template rendering is replaced by `ContextBuilder.build()`.

#### Scenario: Successful pipeline execution

- GIVEN a PromptRegistry, ContextBuilder, and a working LlmProvider
- WHEN the pipeline executes with a valid contract and input data
- THEN it resolves the promptId from the registry, builds context via ContextBuilder, and returns a GuideResult with promptId and promptVersion in metadata

#### Scenario: Pipeline uses ContextBuilder instead of template

- GIVEN an ExecutionPipeline with a ContextBuilder
- WHEN execute() is called with input data
- THEN the userPrompt is built by ContextBuilder.build() using the contract's ContextPolicy, NOT by renderTemplate

#### Scenario: Pipeline includes promptId in metadata

- GIVEN an ExecutionPipeline executes successfully
- WHEN the GuideResult is returned
- THEN the metadata includes promptId and promptVersion

#### Scenario: Pipeline uses developer prompt when available

- GIVEN a PromptDefinition with a developerPrompt field
- WHEN the pipeline constructs the provider request
- THEN the developer prompt is included alongside the system prompt

#### Scenario: Pipeline fails gracefully when prompt not in registry

- GIVEN a contract with promptId that is not in the registry
- WHEN execute() is called
- THEN the pipeline returns a failed GuideResult with a clear error about the missing prompt

#### Scenario: Empty result rejected

- GIVEN a pipeline with an LlmProvider that returns empty content
- WHEN the pipeline executes
- THEN it returns a GuideResult indicating failure

#### Scenario: Audit recorded with prompt metadata

- GIVEN a pipeline with an AiInvocationAudit port configured
- WHEN the pipeline executes successfully
- THEN the audit record includes promptId and promptVersion

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
