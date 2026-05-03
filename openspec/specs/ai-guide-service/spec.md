# AI Guide Service Specification

## Purpose

Define the AiGuideService as the public facade that accepts a `GuideUseCaseId` directly and executes the pipeline. Internal profile ID mapping is a future concern (post-T19).

## Requirements

### Requirement: Execute by Use Case ID

The system SHALL define `AiGuideService.execute(useCaseId, input)` where `useCaseId` is a `GuideUseCaseId` and `input` is a `Record<string, string>`. The method SHALL: (1) retrieve the corresponding `UseCaseContract` from the registry, (2) throw if no contract is registered for the given ID, (3) execute the pipeline with the contract and input, and (4) return a `GuideResult`.

#### Scenario: Conversation use case executed

- GIVEN AiGuideService with all contracts registered
- WHEN execute is called with useCaseId="serena.conversation.reply" and input={text: "Hello", senderId: "user1"}
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
