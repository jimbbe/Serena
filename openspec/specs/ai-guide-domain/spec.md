# AI Guide Domain Specification

## Purpose

Define core domain types for the `ai-guide` module: use case identifiers, execution policies, contracts, structured results, prompt identifiers, context policies, and output contracts.

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

### Requirement: PromptId

The system SHALL define `PromptId` as a string literal union type with versioned dot-notation identifiers. Valid format: `{module}.{capability}.{action}.v{n}`. The union SHALL include exactly four values: `"serena.conversation.reply.v1"`, `"serena.risk.review.v1"`, `"serena.mediation.understand_request.v1"`, and `"serena.mediation.clarify.v1"`. No other values SHALL be accepted at compile time.

#### Scenario: Valid PromptId accepted

- GIVEN a PromptId string `serena.conversation.reply.v1`
- WHEN the type system validates it
- THEN it is accepted as a valid PromptId

#### Scenario: Invalid PromptId rejected

- GIVEN a PromptId string without a version suffix
- WHEN the type system validates it
- THEN it is NOT a valid PromptId (not in the union)

### Requirement: ContextPolicy

The system SHALL define `ContextPolicy` as a type that declares what context the LLM receives per use case. The type SHALL have the following fields:

- `includeCurrentMessage` (boolean)
- `includeResolvedIdentity` (boolean)
- `includeChannelMetadata` (boolean)
- `includeConversationHistory` (boolean)
- `maxRecentMessages` (number, optional) — limits history when `includeConversationHistory` is true
- `includeKnownContacts` (boolean)
- `includeSafetyMemory` (boolean)
- `includeFullConversation` (boolean)
- `notes` (string, optional)

All boolean fields SHALL be mandatory. `includeFullConversation` SHALL be `false` by default for all use cases in Phase 1.

#### Scenario: ContextPolicy constructed with all fields

- GIVEN all nine fields with valid values
- WHEN a ContextPolicy is constructed
- THEN it is a valid policy with all fields present

#### Scenario: ContextPolicy without optional fields

- GIVEN only required boolean fields
- WHEN a ContextPolicy is constructed
- THEN it is valid — maxRecentMessages and notes are optional

### Requirement: OutputContract

The system SHALL define `OutputContract` as a type with a single field `format` that is a union of `"text" | "json"`. Each PromptDefinition SHALL declare its expected output format.

#### Scenario: Text output contract

- GIVEN an OutputContract with format "text"
- WHEN inspected
- THEN it is valid

#### Scenario: JSON output contract

- GIVEN an OutputContract with format "json"
- WHEN inspected
- THEN it is valid

### Requirement: PromptDefinition

The system SHALL define `PromptDefinition` as a domain type with the following shape:

```typescript
{
  id: PromptId;
  version: number;
  useCaseId: GuideUseCaseId;
  description: string;
  systemPrompt: string;
  developerPrompt?: string;
  outputContract: OutputContract;
  contextPolicy: ContextPolicy;
  safetyNotes?: string[];
}
```

The `version` field SHALL be a positive integer. The `systemPrompt` field SHALL contain the full system prompt text. The `developerPrompt` field is optional and contains developer-facing instructions. The `safetyNotes` field is optional and contains safety considerations.

#### Scenario: PromptDefinition with all fields

- GIVEN a PromptDefinition with id, version, useCaseId, description, systemPrompt, outputContract, contextPolicy, and optional fields
- WHEN the definition is constructed
- THEN all fields are present and type-correct

#### Scenario: PromptDefinition without optional fields

- GIVEN a PromptDefinition with only required fields
- WHEN the definition is constructed
- THEN it is valid — developerPrompt, safetyNotes are optional

### Requirement: UseCaseContract

The system SHALL define `UseCaseContract` as a lean routing type with the following required fields: `id` (GuideUseCaseId), `promptId` (PromptId), and `executionPolicy` (ExecutionPolicy). The `systemPrompt`, `inputTemplate`, `outputSchemaName`, and `providerPolicy` fields SHALL be removed. The prompt content and context policy live in the PromptDefinition, not the contract.

#### Scenario: Complete contract created

- GIVEN all three required fields with valid values
- WHEN a UseCaseContract is constructed
- THEN it is a valid contract with promptId instead of systemPrompt

#### Scenario: Contract has no systemPrompt or inputTemplate

- GIVEN a UseCaseContract with promptId
- WHEN the contract is type-checked
- THEN there are no systemPrompt, inputTemplate, or providerPolicy fields

#### Scenario: Contract with invalid ID rejected

- GIVEN a useCaseId that is not a valid GuideUseCaseId
- WHEN a UseCaseContract is constructed
- THEN the type system rejects it

### Requirement: GuideResult

The system SHALL define `GuideResult` as a discriminated union with `GuideResultSuccess` and `GuideResultFailed` branches. Both branches SHALL contain: `useCaseId` (GuideUseCaseId), `output` (string), `metadata` (object), and `audited` (boolean). The `metadata` SHALL include: `provider` (string), `model` (string), `attempts` (number), `auditId` (string, optional), `auditRecorded` (boolean), `promptId` (PromptId), and `promptVersion` (number).

#### Scenario: Successful result with prompt metadata

- GIVEN a successful GuideResult from `serena.conversation.reply.v1`
- WHEN the metadata is inspected
- THEN it contains promptId: "serena.conversation.reply.v1" and promptVersion: 1, plus existing fields (provider, model, attempts, auditRecorded)

#### Scenario: Failed result with prompt metadata

- GIVEN a failed GuideResult from `serena.risk.review.v1`
- WHEN the metadata is inspected
- THEN it contains promptId: "serena.risk.review.v1" and promptVersion: 1

#### Scenario: Existing metadata fields preserved

- GIVEN a GuideResult (success or failed)
- WHEN the metadata is inspected
- THEN it contains provider, model, attempts, and auditRecorded fields
