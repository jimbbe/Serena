# AI Guide Ports Specification

## Purpose

Define abstract port interfaces that the `ai-guide` module depends on: LLM provider, invocation audit, and prompt registry.

## Requirements

### Requirement: PromptRegistry Port

The system SHALL define a `PromptRegistry` port interface with the following methods:

- `get(promptId: PromptId): PromptDefinition` — returns the matching PromptDefinition or throws a clear error containing the requested promptId if not found.
- `list(): PromptDefinition[]` — returns all registered prompts.

The port SHALL have NO external infrastructure dependencies (no DB, no network, no file I/O). The port SHALL be deterministic and fully testable.

#### Scenario: Registry returns prompt by ID

- GIVEN a PromptRegistry containing a prompt with id `serena.conversation.reply.v1`
- WHEN `get("serena.conversation.reply.v1")` is called
- THEN the matching PromptDefinition is returned

#### Scenario: Registry throws for missing prompt

- GIVEN a PromptRegistry that does NOT contain `serena.nonexistent.v1`
- WHEN `get("serena.nonexistent.v1")` is called
- THEN an error is thrown with a message containing "serena.nonexistent.v1"

#### Scenario: Registry lists all prompts

- GIVEN a PromptRegistry containing 4 prompts
- WHEN `list()` is called
- THEN an array of exactly 4 PromptDefinitions is returned

#### Scenario: Registry rejects duplicate IDs on construction

- GIVEN two PromptDefinitions with the same id
- WHEN the registry is constructed with both
- THEN a validation error is thrown for duplicate prompt ID

### Requirement: LlmProvider Port

The system SHALL define an `LlmProvider` interface with a single method `invoke(request)` that accepts an abstract request (containing `promptId`, `promptVersion`, `systemPrompt`, `userPrompt`, optional `developerPrompt`, and `policy`) and returns a response (containing content, optional tokens used, and optional model used). The interface SHALL be agnostic of any specific LLM provider implementation.

#### Scenario: Provider invoked with prompt metadata

- GIVEN an LlmProvider implementation
- WHEN invoke is called with promptId, promptVersion, systemPrompt, userPrompt, and policy
- THEN it returns a response with content string

#### Scenario: Provider receives developer prompt when available

- GIVEN an LlmProvider implementation
- WHEN invoke is called with a developerPrompt
- THEN the developer prompt is included alongside the system prompt

#### Scenario: Provider returns metadata

- GIVEN an LlmProvider implementation
- WHEN invoke completes successfully
- THEN the response MAY include tokensUsed and modelUsed

#### Scenario: Provider throws on failure

- GIVEN an LlmProvider implementation
- WHEN the underlying provider call fails
- THEN invoke SHALL throw an error

### Requirement: AiInvocationAudit Port

The system SHALL define an `AiInvocationAudit` interface with a single method `record(invocation)` that accepts invocation details (use case ID, promptId, promptVersion, user prompt) and result information (output, tokens used, execution time, success flag, optional error). The `systemPrompt` field SHALL NOT be part of the audit input or stored record — prompts are versioned and resolved through the PromptRegistry, not duplicated in audit logs. The method SHALL return void.

#### Scenario: Successful invocation recorded with prompt metadata

- GIVEN an AiInvocationAudit implementation
- WHEN record is called with a successful invocation including promptId and promptVersion
- THEN the invocation details are persisted with promptId and promptVersion

#### Scenario: Failed invocation recorded

- GIVEN an AiInvocationAudit implementation
- WHEN record is called with a failed invocation including error message
- THEN the failure details are persisted with success=false

#### Scenario: Audit no longer stores systemPrompt

- GIVEN an AuditRecord
- WHEN the record is inspected
- THEN it does NOT have a systemPrompt field

#### Scenario: Audit is fire-and-forget

- GIVEN an AiInvocationAudit implementation
- WHEN record is called
- THEN it SHALL NOT block or throw on audit failure (audit failures are logged, not propagated)
