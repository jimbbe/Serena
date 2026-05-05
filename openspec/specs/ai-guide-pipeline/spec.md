# AI Guide Pipeline Specification

## Purpose

Define the ExecutionPipeline that orchestrates AI use case execution: resolving prompts from registry, building context via ContextBuilder, invoking providers, validating results, and recording audit entries.

## Requirements

### Requirement: Execute Pipeline

The system SHALL define `ExecutionPipeline` that depends on a `PromptRegistry` and `ContextBuilder`. The pipeline SHALL accept a `UseCaseContract` and `AiGuideInput` data, then produce a `GuideResult`. The pipeline SHALL: (1) load the prompt from `PromptRegistry` using `contract.promptId`, (2) build the user prompt via `ContextBuilder.build()` using the prompt's `contextPolicy`, (3) invoke the LlmProvider with promptId, promptVersion, systemPrompt, userPrompt, optional developerPrompt, and executionPolicy, (4) validate the result is not empty, (5) record an audit entry with promptId and promptVersion, and (6) return a GuideResult with promptId and promptVersion in metadata.

The pipeline SHALL NOT call `renderTemplate` — template rendering is replaced by `ContextBuilder.build()`. The `buildUserPrompt()` method SHALL extract only string-valued fields from `AiGuideInput` for template rendering (via `renderTemplate()`). Array fields (`recentMessages`, `knownContacts`) SHALL bypass template rendering and be passed directly to `ContextBuilder.build()`.

#### Scenario: Successful pipeline execution

- GIVEN a PromptRegistry, ContextBuilder, and a working LlmProvider
- WHEN the pipeline executes with a valid contract and AiGuideInput
- THEN it resolves the promptId from the registry, builds context via ContextBuilder, and returns a GuideResult with promptId and promptVersion in metadata

#### Scenario: Pipeline uses ContextBuilder instead of template

- GIVEN an ExecutionPipeline with a ContextBuilder
- WHEN execute() is called with AiGuideInput
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

### Requirement: ExecutionPipeline Flows recentMessages to ContextBuilder

The system SHALL pass `recentMessages` from `AiGuideInput` to `ContextBuilder.build()` within the `buildUserPrompt()` method. The `recentMessages` array SHALL be passed as-is (not stringified or templated) to the `build()` call alongside `currentMessage`, `resolvedIdentity`, `actorContext`, and `channelMetadata`.

#### Scenario: recentMessages flows to ContextBuilder

- GIVEN an ExecutionPipeline with AiGuideInput containing `recentMessages: ["[inbound] Maria: hola"]`
- WHEN buildUserPrompt() is called
- THEN ContextBuilder.build() receives `{ recentMessages: ["[inbound] Maria: hola"], ... }`

#### Scenario: recentMessages appears in userPrompt when policy enables it

- GIVEN a ContextPolicy with `includeConversationHistory: true` and `maxRecentMessages: 3`
- AND AiGuideInput with `recentMessages: ["msg1", "msg2", "msg3", "msg4"]`
- WHEN the pipeline executes
- THEN the userPrompt contains the last 3 messages formatted as a conversation history section

#### Scenario: Empty recentMessages produces no history section

- GIVEN a ContextPolicy with `includeConversationHistory: true`
- AND AiGuideInput with `recentMessages: []` or `recentMessages: undefined`
- WHEN the pipeline executes
- THEN the userPrompt does NOT contain a conversation history section

#### Scenario: Undefined recentMessages does not break pipeline

- GIVEN AiGuideInput without a `recentMessages` field
- WHEN the pipeline executes
- THEN the pipeline completes normally without error

### Requirement: ExecutionPipeline Flows knownContacts to ContextBuilder

The system SHALL pass `knownContacts` from `AiGuideInput` to `ContextBuilder.build()` within the `buildUserPrompt()` method. The `knownContacts` array SHALL be passed as-is (not stringified or templated) to the `build()` call alongside `currentMessage`, `resolvedIdentity`, `actorContext`, `channelMetadata`, and `recentMessages`.

#### Scenario: knownContacts flows to ContextBuilder

- GIVEN an ExecutionPipeline with AiGuideInput containing `knownContacts: ["María (id: c1)", "Carlos (id: c2)"]`
- WHEN buildUserPrompt() is called
- THEN ContextBuilder.build() receives `{ knownContacts: ["María (id: c1)", "Carlos (id: c2)"], ... }`

#### Scenario: Empty knownContacts produces no contacts section

- GIVEN a ContextPolicy with `includeKnownContacts: true`
- AND AiGuideInput with `knownContacts: []` or `knownContacts: undefined`
- WHEN the pipeline executes
- THEN the userPrompt does NOT contain a `Contactos conocidos` section

#### Scenario: Undefined knownContacts does not break pipeline

- GIVEN AiGuideInput without a `knownContacts` field
- WHEN the pipeline executes
- THEN the pipeline completes normally without error

### Requirement: Known Contacts Activation in Prompt Definitions

The system SHALL activate `includeKnownContacts: true` in the `contextPolicy` of the following prompt definitions:

| Prompt | includeKnownContacts |
|--------|---------------------|
| `mediation-understand-request.v1` | `true` |
| `mediation-clarify.v1` | `true` |

All other prompts SHALL keep `includeKnownContacts: false`:

| Prompt | includeKnownContacts |
|--------|---------------------|
| `conversation-reply.v1` | `false` |
| `risk-review.v1` | `false` |

#### Scenario: mediation.understand_request enables known contacts

- GIVEN the mediation-understand-request.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeKnownContacts` is `true`

#### Scenario: mediation.clarify enables known contacts

- GIVEN the mediation-clarify.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeKnownContacts` is `true`

#### Scenario: conversation.reply keeps known contacts disabled

- GIVEN the conversation-reply.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeKnownContacts` is `false`

#### Scenario: risk.review keeps known contacts disabled

- GIVEN the risk-review.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeKnownContacts` is `false`

### Requirement: ContextBuilder Renders Known Contacts Section

The system SHALL render a `Contactos conocidos` section in the user prompt when `includeKnownContacts=true` AND `knownContacts` is a non-empty array. Each contact SHALL be formatted as `DisplayName (id: contact-id)` in the rendered section.

When `knownContacts` is empty or `includeKnownContacts=false`, the section SHALL be omitted entirely — no empty section, no placeholder text.

#### Scenario: contacts present renders section

- GIVEN a ContextPolicy with `includeKnownContacts: true`
- AND ContextData with `knownContacts: ["María (id: c1)", "Carlos (id: c2)"]`
- WHEN ContextBuilder.build() is called
- THEN the userPrompt contains `Contactos conocidos: María (id: c1), Carlos (id: c2)`

#### Scenario: empty contacts produces no section

- GIVEN a ContextPolicy with `includeKnownContacts: true`
- AND ContextData with `knownContacts: []` or `knownContacts: undefined`
- WHEN ContextBuilder.build() is called
- THEN the userPrompt does NOT contain a `Contactos conocidos` section

#### Scenario: includeKnownContacts=false omits section even with contacts

- GIVEN a ContextPolicy with `includeKnownContacts: false`
- AND ContextData with `knownContacts: ["María (id: c1)"]`
- WHEN ContextBuilder.build() is called
- THEN the userPrompt does NOT contain a `Contactos conocidos` section

### Requirement: Array Fields Bypass Template Engine

The system SHALL ensure that `renderTemplate()` receives only string-valued fields from `AiGuideInput`. Array fields (`recentMessages`, `knownContacts`) SHALL NOT enter the template engine — they bypass `renderTemplate()` and are passed directly to `ContextBuilder.build()`.

#### Scenario: knownContacts bypasses template engine

- GIVEN an AiGuideInput with `knownContacts: ["María (id: c1)"]`
- WHEN buildUserPrompt() extracts fields for renderTemplate()
- THEN only string fields are passed to renderTemplate(); knownContacts is NOT included

#### Scenario: recentMessages and knownContacts both bypass templates

- GIVEN an AiGuideInput with both `recentMessages` and `knownContacts` arrays
- WHEN buildUserPrompt() processes the input
- THEN neither array enters renderTemplate(); both go to ContextBuilder.build()

### Requirement: recentMessages and knownContacts Coexist Without Breaking Prompt

The system SHALL support both `recentMessages` and `knownContacts` in the same `AiGuideInput` without conflict. When both are present and their respective policies are enabled, the user prompt SHALL contain both the conversation history section AND the known contacts section, in the order determined by ContextBuilder.

#### Scenario: both sections present when both enabled

- GIVEN a ContextPolicy with `includeConversationHistory: true` and `includeKnownContacts: true`
- AND AiGuideInput with `recentMessages: ["[inbound] maria via simulation: hola"]` and `knownContacts: ["Carlos (id: c2)"]`
- WHEN the pipeline executes
- THEN the userPrompt contains BOTH the conversation history section AND the known contacts section

#### Scenario: only history section when contacts disabled

- GIVEN a ContextPolicy with `includeConversationHistory: true` and `includeKnownContacts: false`
- AND AiGuideInput with both `recentMessages` and `knownContacts` populated
- WHEN the pipeline executes
- THEN the userPrompt contains ONLY the conversation history section; no known contacts section

#### Scenario: only contacts section when history disabled

- GIVEN a ContextPolicy with `includeConversationHistory: false` and `includeKnownContacts: true`
- AND AiGuideInput with both `recentMessages` and `knownContacts` populated
- WHEN the pipeline executes
- THEN the userPrompt contains ONLY the known contacts section; no conversation history section
