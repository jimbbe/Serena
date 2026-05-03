# Inbound Simulation Mapping Specification

## Purpose

Define the pure function `profileToUseCaseId` that maps `LlmProfileId` (inbound-gate domain) to `GuideUseCaseId` (ai-guide domain). This is the single source of truth for translating inbound routing decisions into AI guide use case invocations.

## Requirements

### Requirement: Profile-to-UseCase Mapping Function

The system SHALL define `profileToUseCaseId(profileId: LlmProfileId): GuideUseCaseId` as a pure function in `inbound-gate/domain/profile-to-usecase.ts`. The function SHALL implement the following mapping:

| LlmProfileId | GuideUseCaseId |
|---|---|
| `conversation` | `serena.conversation.reply` |
| `risk_review` | `serena.risk.review` |
| `mediation_understanding` | `serena.mediation.understand_request` |
| `clarification` | `serena.mediation.clarify` |

#### Scenario: Conversation profile maps correctly

- GIVEN `profileId = "conversation"`
- WHEN `profileToUseCaseId` is called
- THEN it returns `"serena.conversation.reply"`

#### Scenario: Risk review profile maps correctly

- GIVEN `profileId = "risk_review"`
- WHEN `profileToUseCaseId` is called
- THEN it returns `"serena.risk.review"`

#### Scenario: Mediation understanding profile maps correctly

- GIVEN `profileId = "mediation_understanding"`
- WHEN `profileToUseCaseId` is called
- THEN it returns `"serena.mediation.understand_request"`

#### Scenario: Clarification profile maps correctly

- GIVEN `profileId = "clarification"`
- WHEN `profileToUseCaseId` is called
- THEN it returns `"serena.mediation.clarify"`

### Requirement: Pure Function — No Side Effects

The `profileToUseCaseId` function SHALL be pure: no I/O, no mutable state, no dependencies on external services. It SHALL accept a `LlmProfileId` and return a `GuideUseCaseId` deterministically.

#### Scenario: Same input always produces same output

- GIVEN any valid LlmProfileId
- WHEN the function is called multiple times with the same input
- THEN it returns the same output every time

#### Scenario: No exceptions thrown for valid input

- GIVEN any of the four valid LlmProfileId values
- WHEN the function is called
- THEN it returns a GuideUseCaseId without throwing

### Requirement: Type Safety via Exhaustive Mapping

The mapping SHALL be typed so that adding a new `LlmProfileId` value without updating the mapping causes a TypeScript compile error. This ensures the mapping stays in sync with the domain type.

#### Scenario: New profile ID causes compile error

- GIVEN a new value is added to `LlmProfileId` (e.g., `"escalation"`)
- WHEN the code is compiled
- THEN TypeScript reports an error because the mapping record is missing the new key

### Requirement: Cross-Module Import Boundary

The function SHALL import `LlmProfileId` from `inbound-gate/domain/llm-profile.ts` (same module) and `GuideUseCaseId` from `ai-guide/domain/guide-use-case-id.ts` (cross-module). This cross-module import is intentional and documented — it is the ONLY place where inbound-gate references ai-guide domain types. The import is acceptable because:

1. It imports only a type (no runtime dependency)
2. It is a pure function (no side effects)
3. It lives at the conceptual boundary where the mapping is needed

#### Scenario: No runtime dependency on ai-guide

- GIVEN the profile-to-usecase module
- WHEN loaded at runtime
- THEN it does not import any ai-guide implementation code, only the type definition

### Requirement: No Reverse Mapping

The system SHALL NOT define a reverse mapping (`GuideUseCaseId` → `LlmProfileId`). The mapping is unidirectional: inbound decisions flow to AI guide, not the other way around. If a reverse mapping is needed in the future, it SHALL be a separate function with its own spec.
