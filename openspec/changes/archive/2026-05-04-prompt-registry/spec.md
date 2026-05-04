# Spec: Prompt Registry for AI Guide

**Change**: `prompt-registry`
**Status**: complete
**Author**: sdd-spec

---

## Executive Summary

This specification defines the requirements for replacing fragile inline `systemPrompt` + `inputTemplate` strings in `UseCaseContract` with a formal versioned prompt layer. A `PromptRegistry` resolves prompts by `promptId`, a `ContextPolicy` declares what context each use case receives, and a `ContextBuilder` assembles the input deterministically. This eliminates the code smell of `MockLlmProvider` keying canned responses by exact prompt text and enables auditable prompt versioning.

---

## REQ-1: Prompt Types

### Requirements

- **R1.1** `PromptId` is a versioned string in dot-notation with a version suffix. Valid format: `{module}.{capability}.{action}.v{n}` (e.g., `serena.conversation.reply.v1`).
- **R1.2** `PromptId` is implemented as a TypeScript string literal union, consistent with the existing `GuideUseCaseId` pattern.
- **R1.3** `PromptDefinition` has the following shape:
  ```typescript
  {
    id: PromptId;
    version: number;
    useCaseId: GuideUseCaseId;
    description: string;
    system: string;
    developer?: string;
    outputMode: "text" | "json";
    safetyNotes?: string[];
  }
  ```
- **R1.4** The `version` field is a positive integer extracted from the `PromptId` suffix (e.g., `v1` → `1`).
- **R1.5** The `system` field contains the full system prompt text (previously `systemPrompt` in `UseCaseContract`).
- **R1.6** The `developer` field is optional and contains developer-facing instructions for the LLM (equivalent to a "developer message" in some provider APIs).
- **R1.7** The `outputMode` field declares whether the prompt expects plain text or JSON output.
- **R1.8** The `safetyNotes` field is optional and contains an array of safety considerations for the prompt.

### Scenarios

**Scenario**: PromptId format validation
- **GIVEN** a PromptId string `serena.conversation.reply.v1`
- **WHEN** the type system validates it
- **THEN** it is accepted as a valid PromptId

**Scenario**: PromptId with invalid version rejected
- **GIVEN** a PromptId string `serena.conversation.reply` (no version suffix)
- **WHEN** the type system validates it
- **THEN** it is NOT a valid PromptId (not in the union)

**Scenario**: PromptDefinition with all fields
- **GIVEN** a PromptDefinition with id, version, useCaseId, description, system, developer, outputMode, and safetyNotes
- **WHEN** the definition is constructed
- **THEN** all fields are present and type-correct

**Scenario**: PromptDefinition without optional fields
- **GIVEN** a PromptDefinition with only required fields (id, version, useCaseId, description, system, outputMode)
- **WHEN** the definition is constructed
- **THEN** it is valid — developer and safetyNotes are optional

---

## REQ-2: PromptRegistry

### Requirements

- **R2.1** `PromptRegistry` is an application-layer port (interface) that provides prompt resolution.
- **R2.2** `get(promptId: PromptId): PromptDefinition` returns the matching `PromptDefinition` or throws a clear error if not found.
- **R2.3** `list(): PromptDefinition[]` returns all registered prompts.
- **R2.4** On construction, the registry validates that all registered prompts have unique IDs. If duplicates exist, it throws an error.
- **R2.5** The registry has NO external infrastructure dependencies (no DB, no network, no file I/O).
- **R2.6** The registry is deterministic and fully testable.
- **R2.7** The error message for a missing prompt must include the requested `promptId` for debugging.

### Scenarios

**Scenario**: Registry returns prompt by ID
- **GIVEN** a PromptRegistry containing a prompt with id `serena.conversation.reply.v1`
- **WHEN** `get("serena.conversation.reply.v1")` is called
- **THEN** the matching PromptDefinition is returned

**Scenario**: Registry throws for missing prompt
- **GIVEN** a PromptRegistry that does NOT contain `serena.nonexistent.v1`
- **WHEN** `get("serena.nonexistent.v1")` is called
- **THEN** an error is thrown with a message containing `"serena.nonexistent.v1"`

**Scenario**: Registry lists all prompts
- **GIVEN** a PromptRegistry containing 4 prompts
- **WHEN** `list()` is called
- **THEN** an array of exactly 4 PromptDefinitions is returned

**Scenario**: Registry rejects duplicate IDs
- **GIVEN** two PromptDefinitions with the same id `serena.conversation.reply.v1`
- **WHEN** the registry is constructed with both
- **THEN** a validation error is thrown for duplicate prompt ID

**Scenario**: Registry is deterministic
- **GIVEN** a PromptRegistry constructed with the same set of prompts
- **WHEN** `get()` is called multiple times with the same promptId
- **THEN** the same PromptDefinition is returned every time (same reference or deep-equal)

**Scenario**: Registry has no external dependencies
- **GIVEN** a PromptRegistry instance
- **WHEN** its methods are called in an isolated environment (no network, no DB)
- **THEN** all methods succeed without errors

---

## REQ-3: UseCaseContract Updated

### Requirements

- **R3.1** `UseCaseContract` replaces `systemPrompt` and `inputTemplate` fields with `promptId: PromptId`.
- **R3.2** `UseCaseContract` adds `contextPolicy: ContextPolicy` field.
- **R3.3** `UseCaseContract` removes `providerPolicy` — not needed at this stage.
- **R3.4** The new `UseCaseContract` shape is:
  ```typescript
  {
    id: GuideUseCaseId;
    promptId: PromptId;
    outputSchemaName: string;
    contextPolicy: ContextPolicy;
    executionPolicy: ExecutionPolicy;
    enabled?: boolean;
  }
  ```
- **R3.5** The `promptId` in a contract MUST reference a valid entry in the PromptRegistry.
- **R3.6** The `enabled` field is optional and defaults to `true` when not specified.

### Scenarios

**Scenario**: Contract with promptId
- **GIVEN** a UseCaseContract for `serena.conversation.reply`
- **WHEN** the contract is constructed with `promptId: "serena.conversation.reply.v1"`
- **THEN** the contract has no `systemPrompt` or `inputTemplate` fields

**Scenario**: Contract with ContextPolicy
- **GIVEN** a UseCaseContract
- **WHEN** the contract is constructed
- **THEN** it includes a `contextPolicy` field with explicit context flags

**Scenario**: Contract without providerPolicy
- **GIVEN** a UseCaseContract
- **WHEN** the contract is type-checked
- **THEN** there is no `providerPolicy` field

**Scenario**: Contract enabled flag defaults
- **GIVEN** a UseCaseContract without an `enabled` field
- **WHEN** the contract is evaluated
- **THEN** it is treated as enabled (default `true`)

---

## REQ-4: ContextPolicy

### Requirements

- **R4.1** `ContextPolicy` defines what context the LLM receives per use case.
- **R4.2** The ContextPolicy type has the following fields:
  ```typescript
  {
    includeCurrentMessage: boolean;
    includeResolvedIdentity: boolean;
    includeChannelMetadata: boolean;
    includeConversationHistory: boolean;
    maxRecentMessages?: number;
    includeKnownContacts: boolean;
    includeSafetyMemory: boolean;
    includeFullConversation: boolean;
    notes?: string;
  }
  ```
- **R4.3** Each use case has an explicit ContextPolicy defined in the default contracts.
- **R4.4** `includeFullConversation` MUST be `false` by default for all use cases in Phase 1.
- **R4.5** `maxRecentMessages` limits how many recent messages are included when `includeConversationHistory` is true.
- **R4.6** The ContextPolicy for each use case is:

  | Use Case | currentMessage | resolvedIdentity | channelMetadata | history | maxRecent | contacts | safetyMemory | fullConversation |
  |----------|---------------|-----------------|-----------------|---------|-----------|----------|--------------|-----------------|
  | serena.conversation.reply | true | true | true | true | 8 | false | true | false |
  | serena.risk.review | true | true | true | true | 5 | false | true | false |
  | serena.mediation.understand_request | true | true | true | true | 4 | true | false | false |
  | serena.mediation.clarify | true | true | false | true | 3 | true | false | false |

### Scenarios

**Scenario**: ContextPolicy for conversation.reply
- **GIVEN** the ContextPolicy for `serena.conversation.reply`
- **WHEN** evaluated
- **THEN** includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=true, includeConversationHistory=true, maxRecentMessages=8, includeSafetyMemory=true, includeKnownContacts=false, includeFullConversation=false

**Scenario**: ContextPolicy for risk.review
- **GIVEN** the ContextPolicy for `serena.risk.review`
- **WHEN** evaluated
- **THEN** includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=true, includeConversationHistory=true, maxRecentMessages=5, includeSafetyMemory=true, includeKnownContacts=false, includeFullConversation=false

**Scenario**: ContextPolicy for mediation.understand_request
- **GIVEN** the ContextPolicy for `serena.mediation.understand_request`
- **WHEN** evaluated
- **THEN** includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=true, includeConversationHistory=true, maxRecentMessages=4, includeKnownContacts=true, includeSafetyMemory=false, includeFullConversation=false

**Scenario**: ContextPolicy for mediation.clarify
- **GIVEN** the ContextPolicy for `serena.mediation.clarify`
- **WHEN** evaluated
- **THEN** includeCurrentMessage=true, includeResolvedIdentity=true, includeChannelMetadata=false, includeConversationHistory=true, maxRecentMessages=3, includeKnownContacts=true, includeSafetyMemory=false, includeFullConversation=false

**Scenario**: Full conversation is always false in Phase 1
- **GIVEN** any of the 4 use case ContextPolicies
- **WHEN** evaluated
- **THEN** includeFullConversation is false

---

## REQ-5: ContextBuilder

### Requirements

- **R5.1** `ContextBuilder` is an application-layer component that builds the input string explicitly from a `ContextPolicy`.
- **R5.2** The builder accepts: `currentMessage`, `resolvedIdentity`, `channel`, `metadata`, `recentMessages` (optional), `knownContacts` (optional), and other contextual data.
- **R5.3** The builder does NOT include full conversation by default — it only includes what the `ContextPolicy` flags specify.
- **R5.4** The builder does NOT mix conversations across tenants or `personId` boundaries.
- **R5.5** The builder gracefully handles missing optional data:
  - If `safetyMemory` is unavailable but `includeSafetyMemory=true`, the builder omits it without error.
  - If `knownContacts` is unavailable but `includeKnownContacts=true`, the builder omits it without error.
  - If `recentMessages` is unavailable but `includeConversationHistory=true`, the builder omits history without error.
- **R5.6** The builder respects `maxRecentMessages` — if more messages are available than the limit, only the most recent N are included.
- **R5.7** The builder produces a plain string suitable as the `userPrompt` for the LLM provider.
- **R5.8** The builder lives in `application/prompt/context-builder.ts` and depends only on domain types (no infrastructure dependencies).

### Scenarios

**Scenario**: ContextBuilder builds from policy with all data available
- **GIVEN** a ContextPolicy with includeCurrentMessage=true, includeConversationHistory=true (maxRecentMessages=3), includeResolvedIdentity=true
- **WHEN** ContextBuilder.build() is called with currentMessage="Hola", recentMessages=["msg1", "msg2", "msg3", "msg4"], resolvedIdentity="Abuela Rosa"
- **THEN** the output includes "Hola", "Abuela Rosa", and only the 3 most recent messages (msg2, msg3, msg4)

**Scenario**: ContextBuilder handles missing optional data
- **GIVEN** a ContextPolicy with includeKnownContacts=true, includeSafetyMemory=true
- **WHEN** ContextBuilder.build() is called WITHOUT knownContacts or safetyMemory data
- **THEN** the output is built successfully without those sections (no error thrown)

**Scenario**: ContextBuilder does not include full conversation
- **GIVEN** a ContextPolicy with includeFullConversation=false (the default)
- **WHEN** ContextBuilder.build() is called with a fullConversationHistory of 50 messages
- **THEN** the full conversation is NOT included in the output

**Scenario**: ContextBuilder respects maxRecentMessages
- **GIVEN** a ContextPolicy with maxRecentMessages=2
- **WHEN** ContextBuilder.build() is called with 10 recent messages
- **THEN** only the 2 most recent messages appear in the output

**Scenario**: ContextBuilder does not cross tenant boundaries
- **GIVEN** ContextBuilder.build() is called with messages from personId="A"
- **WHEN** the builder processes the data
- **THEN** no messages from personId="B" are included

**Scenario**: ContextBuilder with empty current message
- **GIVEN** a ContextPolicy with includeCurrentMessage=true
- **WHEN** ContextBuilder.build() is called with currentMessage=""
- **THEN** the builder handles the empty message gracefully (produces output without the message section or with a placeholder)

---

## REQ-6: Prompt Content

### Requirements

- **R6.1** The PromptRegistry defines exactly 4 prompts at launch:
  1. `serena.conversation.reply.v1`
  2. `serena.risk.review.v1`
  3. `serena.mediation.understand_request.v1`
  4. `serena.mediation.clarify.v1`
- **R6.2** `serena.conversation.reply.v1`:
  - **system**: "Eres Serena, un acompañante conversacional para una persona mayor. Responde con calidez, empatía y brevedad. Mantenés un tono respetuoso y afectuoso. No des consejos médicos ni legales."
  - **outputMode**: "text"
  - **useCaseId**: `serena.conversation.reply`
  - **version**: 1
- **R6.3** `serena.risk.review.v1`:
  - **system**: "Revisá el siguiente mensaje en busca de señales de riesgo: urgencia médica, peligro físico, abuso, abandono, o situaciones que requieran intervención inmediata. Devolvé un análisis objetivo."
  - **outputMode**: "json"
  - **useCaseId**: `serena.risk.review`
  - **version**: 1
  - **JSON schema**: `{ riskLevel: "low" | "medium" | "high" | "critical", signals: string[], requiresImmediateAction: boolean, reasoning: string }`
- **R6.4** `serena.mediation.understand_request.v1`:
  - **system**: "Analizá el siguiente mensaje para entender si contiene un pedido de mediación: la persona quiere que le avises algo a alguien, que contactes a un tercero, o que transmitas un recado. Identificá el destinatario, el contenido del recado, y la urgencia si existe."
  - **outputMode**: "json"
  - **useCaseId**: `serena.mediation.understand_request`
  - **version**: 1
  - **JSON schema**: `{ hasMediationRequest: boolean, recipient?: string, messageContent?: string, urgency: "low" | "medium" | "high", confidence: number, reasoning: string }`
- **R6.5** `serena.mediation.clarify.v1`:
  - **system**: Prompt for generating clarification questions when a mediation request is ambiguous.
  - **outputMode**: "json"
  - **useCaseId**: `serena.mediation.clarify`
  - **version**: 1
  - **JSON schema**: `{ clarificationQuestions: string[], ambiguousElements: string[], suggestedResponse: string }`
- **R6.6** Each prompt has a `description` field explaining its purpose.
- **R6.7** Each prompt has `safetyNotes` where applicable (especially for risk.review and conversation.reply).

### Scenarios

**Scenario**: Conversation reply returns plain text
- **GIVEN** the prompt `serena.conversation.reply.v1` is registered
- **WHEN** its outputMode is checked
- **THEN** outputMode is "text"

**Scenario**: Risk review returns JSON
- **GIVEN** the prompt `serena.risk.review.v1` is registered
- **WHEN** its outputMode is checked
- **THEN** outputMode is "json"

**Scenario**: Mediation understand_request returns JSON
- **GIVEN** the prompt `serena.mediation.understand_request.v1` is registered
- **WHEN** its outputMode is checked
- **THEN** outputMode is "json"

**Scenario**: Mediation clarify returns JSON
- **GIVEN** the prompt `serena.mediation.clarify.v1` is registered
- **WHEN** its outputMode is checked
- **THEN** outputMode is "json"

**Scenario**: All 4 prompts are registered
- **GIVEN** the InMemoryPromptRegistry is initialized with default prompts
- **WHEN** `list()` is called
- **THEN** exactly 4 prompts are returned with IDs matching the 4 defined promptIds

**Scenario**: Each prompt has correct useCaseId mapping
- **GIVEN** each of the 4 prompts
- **WHEN** the useCaseId is checked
- **THEN** each prompt's useCaseId matches its corresponding GuideUseCaseId

---

## REQ-7: ExecutionPipeline Updated

### Requirements

- **R7.1** `ExecutionPipeline` loads the prompt from `PromptRegistry` using `contract.promptId`.
- **R7.2** The pipeline constructs the provider request using the prompt's `system` field and optionally `developer` field.
- **R7.3** The pipeline includes `promptId` and `promptVersion` in the metadata passed to the LLM provider and audit.
- **R7.4** The pipeline respects the prompt's `outputMode` when processing the response.
- **R7.5** The pipeline passes context built by `ContextBuilder` (not raw template rendering) as the user prompt.
- **R7.6** The pipeline's `execute` method signature changes to accept a `PromptRegistry` and `ContextBuilder` as dependencies.
- **R7.7** The pipeline no longer calls `renderTemplate` — template rendering is replaced by `ContextBuilder.build()`.

### Scenarios

**Scenario**: Pipeline loads prompt from registry
- **GIVEN** an ExecutionPipeline with a PromptRegistry and a contract with promptId `serena.conversation.reply.v1`
- **WHEN** execute() is called
- **THEN** the pipeline resolves the prompt from the registry using the promptId

**Scenario**: Pipeline uses ContextBuilder instead of template
- **GIVEN** an ExecutionPipeline with a ContextBuilder
- **WHEN** execute() is called with input data
- **THEN** the userPrompt is built by ContextBuilder.build() using the contract's ContextPolicy, NOT by renderTemplate

**Scenario**: Pipeline includes promptId in metadata
- **GIVEN** an ExecutionPipeline executes successfully
- **WHEN** the GuideResult is returned
- **THEN** the metadata includes `promptId: "serena.conversation.reply.v1"` and `promptVersion: 1`

**Scenario**: Pipeline uses developer prompt when available
- **GIVEN** a PromptDefinition with a `developer` field
- **WHEN** the pipeline constructs the provider request
- **THEN** the developer prompt is included in the request alongside the system prompt

**Scenario**: Pipeline fails when prompt not in registry
- **GIVEN** a contract with promptId `serena.nonexistent.v1`
- **WHEN** execute() is called
- **THEN** the pipeline throws or returns a failed GuideResult with a clear error about the missing prompt

---

## REQ-8: GuideResult Metadata

### Requirements

- **R8.1** `GuideResultSuccess.metadata` includes `promptId: PromptId` and `promptVersion: number`.
- **R8.2** `GuideResultFailed.metadata` includes `promptId: PromptId` and `promptVersion: number`.
- **R8.3** Existing metadata fields are preserved: `provider`, `model`, `attempts`, `auditId?`, `auditRecorded`.
- **R8.4** The new metadata shape for success:
  ```typescript
  {
    provider: string;
    model: string;
    attempts: number;
    auditId?: string;
    auditRecorded: boolean;
    promptId: PromptId;
    promptVersion: number;
  }
  ```
- **R8.5** The new metadata shape for failed is identical to success.

### Scenarios

**Scenario**: Success result includes prompt metadata
- **GIVEN** a successful GuideResult from `serena.conversation.reply.v1`
- **WHEN** the metadata is inspected
- **THEN** it contains `promptId: "serena.conversation.reply.v1"` and `promptVersion: 1`

**Scenario**: Failed result includes prompt metadata
- **GIVEN** a failed GuideResult from `serena.risk.review.v1`
- **WHEN** the metadata is inspected
- **THEN** it contains `promptId: "serena.risk.review.v1"` and `promptVersion: 1`

**Scenario**: Existing metadata fields preserved
- **GIVEN** a GuideResult (success or failed)
- **WHEN** the metadata is inspected
- **THEN** it contains provider, model, attempts, and auditRecorded fields

---

## REQ-9: Audit Updated

### Requirements

- **R9.1** `AiInvocationAudit.record()` input includes `promptId: PromptId` and `promptVersion: number`.
- **R9.2** `AuditRecord` includes `promptId: PromptId` and `promptVersion: number` fields.
- **R9.3** The audit port interface changes from:
  ```typescript
  record(
    input: { useCaseId; systemPrompt; userPrompt },
    result: { output; tokensUsed?; executionTimeMs; success; error? }
  )
  ```
  to:
  ```typescript
  record(
    input: { useCaseId; promptId; promptVersion; userPrompt },
    result: { output; tokensUsed?; executionTimeMs; success; error? }
  )
  ```
- **R9.4** `InMemoryAiInvocationAudit` stores `promptId` and `promptVersion` in each record.
- **R9.5** The `systemPrompt` field is removed from both the input and the stored `AuditRecord`.

### Scenarios

**Scenario**: Audit records promptId and version
- **GIVEN** an InMemoryAiInvocationAudit
- **WHEN** record() is called with promptId `serena.conversation.reply.v1` and promptVersion 1
- **THEN** the stored AuditRecord contains promptId and promptVersion

**Scenario**: Audit no longer stores systemPrompt
- **GIVEN** an AuditRecord
- **WHEN** the record is inspected
- **THEN** it does NOT have a systemPrompt field

**Scenario**: Audit input includes prompt metadata
- **GIVEN** the AiInvocationAudit port interface
- **WHEN** record() is called
- **THEN** the input parameter includes promptId and promptVersion

---

## REQ-10: MockLlmProvider Updated

### Requirements

- **R10.1** `MockLlmProvider` does NOT depend on exact prompt text for keying canned responses.
- **R10.2** MockLlmProvider keys canned responses by `useCaseId`, `promptId`, `outputMode`, or explicit metadata — NOT by `systemPrompt` string.
- **R10.3** The mock maintains backward compatibility: tests that don't configure specific mock responses still get a deterministic fallback response.
- **R10.4** The fallback deterministic hash uses `promptId + userPrompt` instead of `systemPrompt + userPrompt`.
- **R10.5** The mock's `invoke` signature changes to accept `promptId` instead of `systemPrompt`.
- **R10.6** The mock can be configured with canned responses keyed by useCaseId for test convenience.

### Scenarios

**Scenario**: Mock keys by useCaseId
- **GIVEN** a MockLlmProvider configured with a canned response for useCaseId `serena.conversation.reply`
- **WHEN** invoke() is called with promptId `serena.conversation.reply.v1`
- **THEN** the canned response for that useCaseId is returned

**Scenario**: Mock does not depend on exact prompt text
- **GIVEN** a MockLlmProvider
- **WHEN** invoke() is called with a different system prompt text but the same useCaseId
- **THEN** the same canned response is returned (keying is NOT by systemPrompt text)

**Scenario**: Mock fallback for unconfigured use case
- **GIVEN** a MockLlmProvider with NO canned response for a specific useCaseId
- **WHEN** invoke() is called
- **THEN** a deterministic fallback response is generated using promptId + userPrompt hash

**Scenario**: Mock backward compatibility
- **GIVEN** a test that creates a MockLlmProvider without configuring canned responses
- **WHEN** invoke() is called
- **THEN** a deterministic response is returned (test does not crash)

---

## REQ-11: Tests

### Requirements

- **R11.1** PromptRegistry tests verify each of the 4 prompts is returned by its promptId.
- **R11.2** PromptRegistry tests verify a clear error is thrown for a missing prompt.
- **R11.3** Tests verify all UseCaseContracts have valid promptId references.
- **R11.4** Tests verify each UseCaseContract has an explicit ContextPolicy.
- **R11.5** Tests verify `serena.conversation.reply` uses outputMode "text".
- **R11.6** Tests verify `serena.risk.review`, `serena.mediation.understand_request`, `serena.mediation.clarify` use outputMode "json".
- **R11.7** Tests verify AiGuideService loads the correct prompt from the registry.
- **R11.8** Tests verify GuideResult includes promptId and promptVersion in metadata.
- **R11.9** Tests verify ContextBuilder does NOT include full conversation by default.
- **R11.10** Tests verify ContextBuilder respects maxRecentMessages limit.
- **R11.11** Tests verify MockLlmProvider does NOT depend on exact prompt text.
- **R11.12** All 28 existing tests pass after the update (with updated contract factories and mock keying).

### Scenarios

**Scenario**: Registry returns each prompt by ID
- **GIVEN** the InMemoryPromptRegistry with default prompts
- **WHEN** `get()` is called for each of the 4 promptIds
- **THEN** each returns its corresponding PromptDefinition

**Scenario**: Registry fails for missing prompt
- **GIVEN** the InMemoryPromptRegistry
- **WHEN** `get("serena.fake.v99")` is called
- **THEN** an error is thrown

**Scenario**: All contracts have valid promptId
- **GIVEN** the defaultContracts array
- **WHEN** each contract's promptId is validated against the registry
- **THEN** all promptIds resolve successfully

**Scenario**: Conversation reply uses text output
- **GIVEN** the prompt `serena.conversation.reply.v1`
- **WHEN** its outputMode is checked
- **THEN** it equals "text"

**Scenario**: JSON output prompts
- **GIVEN** the prompts for risk.review, mediation.understand_request, mediation.clarify
- **WHEN** their outputMode is checked
- **THEN** all equal "json"

**Scenario**: AiGuideService loads correct prompt
- **GIVEN** an AiGuideService with a PromptRegistry
- **WHEN** guide() is called for useCaseId `serena.conversation.reply`
- **THEN** the pipeline resolves promptId `serena.conversation.reply.v1` from the registry

**Scenario**: GuideResult includes prompt metadata
- **GIVEN** a successful guide execution
- **WHEN** the result metadata is inspected
- **THEN** it contains promptId and promptVersion

**Scenario**: ContextBuilder excludes full conversation
- **GIVEN** a ContextBuilder with includeFullConversation=false
- **WHEN** build() is called with fullConversationHistory data
- **THEN** the output does NOT contain the full conversation

**Scenario**: ContextBuilder respects maxRecentMessages
- **GIVEN** a ContextBuilder with maxRecentMessages=3
- **WHEN** build() is called with 10 messages
- **THEN** only 3 messages appear in the output

**Scenario**: MockLlmProvider independent of prompt text
- **GIVEN** a MockLlmProvider configured for useCaseId `serena.risk.review`
- **WHEN** invoked with different system prompt texts
- **THEN** the same canned response is returned

**Scenario**: All existing tests pass
- **GIVEN** all test files are updated to the new contract shape
- **WHEN** `npm run check` is executed
- **THEN** all 28 tests pass with zero failures

---

## REQ-12: Documentation

### Requirements

- **R12.1** Create `docs/ai-guide-prompts.md` as the authoritative documentation for the AI Guide prompt system.
- **R12.2** The document explains the `PromptRegistry` concept: what it is, why it exists, how prompts are resolved.
- **R12.3** The document explains the `UseCaseContract` shape: `promptId`, `contextPolicy`, `outputSchemaName`, `executionPolicy`, `enabled`.
- **R12.4** The document explains `ContextPolicy`: what each flag means, how it affects the input the LLM receives.
- **R12.5** The document explains `OutputContract` (or `outputMode`): text vs JSON output expectations.
- **R12.6** The document documents the full flow: `profileId → useCaseId → promptId → PromptRegistry → ContextBuilder → ExecutionPipeline → GuideResult`.
- **R12.7** The document explains WHY prompts don't live in WhatsApp adapters or controllers (separation of concerns, domain ownership).
- **R12.8** The document documents the context each use case receives (table format matching REQ-4).
- **R12.9** The document documents how to version a new prompt (naming convention, registry update process).
- **R12.10** The document documents how to audit which prompt version produced a given GuideResult (via metadata.promptId and metadata.promptVersion).

### Scenarios

**Scenario**: Documentation exists at expected path
- **GIVEN** the change is complete
- **WHEN** checking `docs/ai-guide-prompts.md`
- **THEN** the file exists and is non-empty

**Scenario**: Documentation covers PromptRegistry
- **GIVEN** the documentation file
- **WHEN** read
- **THEN** it contains a section explaining PromptRegistry

**Scenario**: Documentation covers ContextPolicy
- **GIVEN** the documentation file
- **WHEN** read
- **THEN** it contains a section explaining ContextPolicy with flag descriptions

**Scenario**: Documentation covers the full flow
- **GIVEN** the documentation file
- **WHEN** read
- **THEN** it documents the profileId → useCaseId → promptId → ... → GuideResult flow

**Scenario**: Documentation explains prompt versioning
- **GIVEN** the documentation file
- **WHEN** read
- **THEN** it contains instructions on how to add/version a new prompt

**Scenario**: Documentation explains auditability
- **GIVEN** the documentation file
- **WHEN** read
- **THEN** it explains how to trace which prompt version produced a GuideResult

---

## Files Affected

### New Files (6)
| File | Purpose |
|------|---------|
| `domain/prompt-id.ts` | PromptId type and PromptDefinition |
| `domain/context-policy.ts` | ContextPolicy type |
| `domain/output-contract.ts` | OutputContract type (outputMode + schema) |
| `application/ports/prompt-registry.ts` | PromptRegistry port interface |
| `application/prompt/context-builder.ts` | ContextBuilder implementation |
| `infrastructure/memory/in-memory-prompt-registry.ts` | Default PromptRegistry with 4 prompts |

### Modified Files (8)
| File | Change |
|------|--------|
| `domain/use-case-contract.ts` | Replace systemPrompt/inputTemplate with promptId + contextPolicy |
| `domain/guide-result.ts` | Add promptId/promptVersion to metadata |
| `application/ports/llm-provider.ts` | Change invoke input from systemPrompt to promptId |
| `application/ports/ai-invocation-audit.ts` | Add promptId/promptVersion to record input |
| `application/use-cases/execution-pipeline.ts` | Resolve prompt from registry, use ContextBuilder |
| `application/use-cases/contracts.ts` | Reference promptId instead of inline text |
| `infrastructure/memory/mock-llm-provider.ts` | Key by useCaseId/promptId, not systemPrompt text |
| `infrastructure/memory/in-memory-ai-invocation-audit.ts` | Store promptId/promptVersion in records |

### Test Files (5)
| File | Change |
|------|--------|
| `tests/use-case-registry.test.ts` | Updated contract factories |
| `tests/mock-llm-provider.test.ts` | Updated mock keying strategy |
| `tests/in-memory-ai-invocation-audit.test.ts` | Updated audit input shape |
| `tests/execution-pipeline.test.ts` | Updated to use registry + ContextBuilder |
| `tests/ai-guide-service.test.ts` | Updated contract factories |

### Documentation (1)
| File | Purpose |
|------|---------|
| `docs/ai-guide-prompts.md` | Architecture documentation for prompt system |

---

## Non-Functional Requirements

- **NFR-1**: TypeScript strict mode — no `any`, no implicit `any`, no `@ts-ignore`.
- **NFR-2**: ESM module format — use `.ts` extensions in imports.
- **NFR-3**: node:test + node:assert/strict for all tests.
- **NFR-4**: No secrets or credentials in code.
- **NFR-5**: Clean/Hexagonal architecture — domain types have zero dependencies, application layer depends only on domain, infrastructure implements ports.
- **NFR-6**: All existing 28 tests must pass after the update.
- **NFR-7**: `npm run check` passes with zero errors.

---

## Out of Scope (Explicit)

- Real OpenAI/OpenRouter adapter implementation
- Database-persisted prompts or admin panel
- Real message sending, WhatsApp integration, or semantic memory
- External tools or summarizer
- Multi-tenant conversation storage (only the builder must not cross boundaries)
- Prompt templating engine beyond ContextBuilder string assembly

---

## next_recommended: tasks
