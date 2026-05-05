# Delta for AI Guide Service

## MODIFIED Requirements

### Requirement: Execute by Use Case ID

The system SHALL define `AiGuideService.execute(useCaseId, input)` where `useCaseId` is a `GuideUseCaseId` and `input` is an `AiGuideInput`. The method SHALL: (1) retrieve the corresponding `UseCaseContract` from the registry, (2) throw if no contract is registered for the given ID, (3) execute the pipeline with the contract and input, and (4) return a `GuideResult`.

`AiGuideInput` SHALL be a type extending `Record<string, string>` with the following optional typed fields: `actorRole?: string`, `channel?: string`, `resolvedIdentity?: string`, `recentMessages?: string[]`, `knownContacts?: string[]`, `safetyMemory?: string`. The `input` field (string) SHALL remain the primary text input for template rendering.

(Previously: input was `Record<string, string>` with no typed fields)

#### Scenario: Conversation use case executed

- GIVEN AiGuideService with all contracts registered
- WHEN execute is called with useCaseId="serena.conversation.reply" and input={input: "Hello", actorRole: "elder", recentMessages: ["msg1", "msg2"]}
- THEN the pipeline executes and returns a GuideResult

#### Scenario: Risk review use case executed

- GIVEN AiGuideService with all contracts registered
- WHEN execute is called with useCaseId="serena.risk.review"
- THEN the pipeline executes and returns a GuideResult

#### Scenario: Mediation understanding use case executed

- GIVEN AiGuideService with all contracts registered
- WHEN execute is called with useCaseId="serena.mediation.understand_request"
- THEN the pipeline executes and returns a GuideResult

#### Scenario: Unregistered use case throws

- GIVEN AiGuideService
- WHEN execute is called with a useCaseId that has no registered contract
- THEN an error is thrown

### Requirement: Internal Profile-to-UseCase Mapping (Future)

The system SHALL reserve the `serena.mediation.clarify` use case ID for future `clarification` profile mapping. The internal mapping from `LlmProfileId` to `GuideUseCaseId` is a post-T19 concern and is NOT implemented in this module. The orchestrator or a future adapter will handle this mapping.

### Requirement: Clarification Not Implemented

The system SHALL treat the `serena.mediation.clarify` use case as not yet implemented. When execute is called with useCaseId="serena.mediation.clarify", the service SHALL throw a `NotImplementedError`. No contract for `serena.mediation.clarify` is registered by default — the error occurs because no contract exists for this ID.

#### Scenario: Clarification use case not implemented

- GIVEN AiGuideService with no contract registered for "serena.mediation.clarify"
- WHEN execute is called with useCaseId="serena.mediation.clarify"
- THEN a NotImplementedError is thrown

## ADDED Requirements

### Requirement: AiGuideInput Type

The system SHALL define `AiGuideInput` as a TypeScript type in `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-input.ts`. The type SHALL extend `Record<string, string>` and include the following optional fields:

| Field | Type | Purpose |
|-------|------|---------|
| `input` | `string` | Primary text input for template rendering |
| `actorRole` | `string` | Role of the message sender (elder, contact, admin) |
| `channel` | `string` | Channel identifier (e.g. "simulation", "whatsapp") |
| `resolvedIdentity` | `string` | Display name or resolved identity of sender |
| `recentMessages` | `string[]` | Recent conversation messages formatted as strings |
| `knownContacts` | `string[]` | Known contacts for context injection |
| `safetyMemory` | `string` | Safety-related memory for context |

The type SHALL remain backward compatible: all fields except `input` are optional, and the `Record<string, string>` extension allows arbitrary string key-value pairs.

#### Scenario: AiGuideInput with only string fields

- GIVEN an AiGuideInput with only `input: "Hello"`
- WHEN passed to AiGuideService.execute()
- THEN it is accepted and behaves identically to `Record<string, string>`

#### Scenario: AiGuideInput with recentMessages

- GIVEN an AiGuideInput with `input: "Hello"` and `recentMessages: ["[inbound] Maria: hola", "[outbound] Serena: hola Maria"]`
- WHEN passed to AiGuideService.execute()
- THEN the pipeline receives the array and can pass it to ContextBuilder

#### Scenario: AiGuideInput backward compatibility

- GIVEN existing code that passes `{input: "text", actorRole: "elder", channel: "simulation"}`
- WHEN the type is changed from `Record<string, string>` to `AiGuideInput`
- THEN the code compiles without changes (all fields are optional strings)
