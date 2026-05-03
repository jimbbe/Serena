# Inbound Simulation Use Case Specification

## Purpose

Define `ProcessChannelInboundMessage` as the use case that executes the full Serena pipeline for a channel-agnostic `InboundMessageCommand`: inbound evaluation → routing decision → AI guide execution → structured result. This use case is the core building block that the simulation endpoint and future real channel adapters will invoke.

## Requirements

### Requirement: ProcessChannelInboundMessage Use Case

The system SHALL define `ProcessChannelInboundMessage` in `inbound-gate/application/use-cases/process-channel-inbound-message.ts` as a class with the following constructor dependencies:

```typescript
{
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  generateTraceId?: () => string;  // defaults to crypto.randomUUID
}
```

The use case SHALL expose an `execute(cmd: InboundMessageCommand): Promise<ChannelInboundResult>` method.

#### Scenario: Use case constructs with required dependencies

- GIVEN `ProcessInboundMessage` and `AiGuideService` instances
- WHEN `ProcessChannelInboundMessage` is instantiated
- THEN it is ready to execute commands

#### Scenario: Optional trace ID generator defaults to randomUUID

- GIVEN no `generateTraceId` is provided
- WHEN the use case is constructed
- THEN it uses `crypto.randomUUID` as the default trace ID generator

### Requirement: ChannelInboundResult Response Type

The system SHALL define `ChannelInboundResult` in `inbound-gate/domain/channel-inbound-result.ts` with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | `string` | Correlation ID for the entire execution |
| `channel` | `InboundChannel` | Echo of the input channel |
| `inboundDecision` | `InboundDecision` | Decision from the inbound gate |
| `profileId` | `LlmProfileId \| undefined` | Profile selected (undefined if discarded) |
| `useCaseId` | `GuideUseCaseId \| undefined` | AI use case invoked (undefined if discarded) |
| `guideResult` | `GuideResult \| undefined` | AI guide output (undefined if discarded or error) |
| `guideError` | `{ message: string; code?: string } \| undefined` | Structured error if AI guide failed |
| `simulatedOutbound` | `SimulatedOutbound \| undefined` | Simulated outbound draft when mediation is involved |
| `warnings` | `string[]` | Non-fatal issues encountered |
| `errors` | `string[]` | Fatal errors encountered |

#### Scenario: Result includes trace ID

- GIVEN a command is executed
- WHEN the result is returned
- THEN `traceId` is a non-empty string (UUID format)

#### Scenario: Result echoes input channel

- GIVEN a command with `channel: "simulation"`
- WHEN the result is returned
- THEN `result.channel === "simulation"`

### Requirement: Execution Flow — Blocked Sender

When the inbound gate returns a `blocked` decision, the use case SHALL:

1. Generate a trace ID
2. Execute `ProcessInboundMessage` with adapted input (`externalSenderId`, `text`, `occurredAt`)
3. Detect the `blocked` decision
4. Return a `ChannelInboundResult` with:
   - `inboundDecision` = the blocked decision
   - `profileId` = `undefined`
   - `useCaseId` = `undefined`
   - `guideResult` = `undefined`
   - `guideError` = `undefined`
   - `warnings` = empty array
   - `errors` = empty array (blocking is expected behavior, not an error)

#### Scenario: Blocked sender returns without AI execution

- GIVEN a command from an unknown sender
- WHEN `execute` is called
- THEN `ProcessInboundMessage` returns a blocked decision
- AND `AiGuideService` is NOT called
- AND the result has `profileId: undefined`, `useCaseId: undefined`, `guideResult: undefined`

#### Scenario: Invalid sender (blank) is blocked

- GIVEN a command with `externalSenderId: "   "`
- WHEN `execute` is called
- THEN the result contains a blocked decision with reason `invalid_sender`

#### Scenario: Invalid text (blank) is blocked

- GIVEN a command with `text: "   "`
- WHEN `execute` is called
- THEN the result contains a blocked decision with reason `invalid_text`

### Requirement: Execution Flow — Allowed or Needs Mediation

When the inbound gate returns `allowed` or `needs_mediation`, the use case SHALL:

1. Generate a trace ID
2. Execute `ProcessInboundMessage` with adapted input
3. Extract `profileId` from the route
4. Map `profileId` → `useCaseId` via `profileToUseCaseId`
5. Call `AiGuideService.execute(useCaseId, { senderId, text })`
6. Return a `ChannelInboundResult` with the decision, profile, use case, and guide result

#### Scenario: Conversation flow executes AI guide

- GIVEN a command from a known sender with ordinary text
- WHEN `execute` is called
- THEN the inbound decision is `allowed`
- AND `profileId` is `"conversation"`
- AND `useCaseId` is `"serena.conversation.reply"`
- AND `guideResult` contains the AI response

#### Scenario: Risk review flow executes AI guide

- GIVEN a command from a known sender with urgent/risk signals
- WHEN `execute` is called
- THEN the inbound decision is `needs_mediation` with reason `urgent_or_risk_content`
- AND `profileId` is `"risk_review"`
- AND `useCaseId` is `"serena.risk.review"`
- AND `guideResult` contains the AI response

#### Scenario: Mediation understanding flow executes AI guide

- GIVEN a command from a known sender with mediation signals
- WHEN `execute` is called
- THEN the inbound decision is `needs_mediation` with reason `third_party_mediation_request`
- AND `profileId` is `"mediation_understanding"`
- AND `useCaseId` is `"serena.mediation.understand_request"`
- AND `guideResult` contains the AI response

### Requirement: Clarification Use Case Error Handling

When the AI guide throws `NotImplementedError` for `serena.mediation.clarify`, the use case SHALL:

1. Catch the error
2. Return a `ChannelInboundResult` with:
   - `inboundDecision` = the decision that led to clarification
   - `profileId` = `"clarification"`
   - `useCaseId` = `"serena.mediation.clarify"`
   - `guideResult` = `undefined`
   - `guideError` = `{ message: "Clarification use case not yet implemented", code: "not_implemented" }`
   - `warnings` = `["clarification profile maps to a not-yet-implemented use case"]`

#### Scenario: Clarification returns structured error, not 500

- GIVEN a command that routes to the `clarification` profile
- WHEN `execute` is called
- THEN `AiGuideService` throws `NotImplementedError`
- AND the use case catches it
- AND the result has `guideError` with code `"not_implemented"`
- AND the result does NOT throw to the caller

### Requirement: Command-to-Input Adaptation

The use case SHALL adapt `InboundMessageCommand` to `ProcessInboundMessageInput`:

- `externalSenderId` → `senderId`
- `text` → `text`
- `occurredAt` (if present, parse as ISO string) → `receivedAt` (as Date); if absent, use current time

#### Scenario: occurredAt is parsed correctly

- GIVEN a command with `occurredAt: "2025-01-15T10:30:00Z"`
- WHEN the command is adapted
- THEN `receivedAt` is a Date representing that timestamp

#### Scenario: Missing occurredAt defaults to now

- GIVEN a command without `occurredAt`
- WHEN the command is adapted
- THEN `receivedAt` is approximately the current time

### Requirement: No Real Message Sending

The use case SHALL NOT send any real messages (WhatsApp, email, etc.). It ONLY reads from the inbound gate and AI guide, returning a structured result. Any outbound action is the responsibility of the caller (simulation endpoint or future channel adapter).

#### Scenario: Execution is read-only

- GIVEN a command is executed
- WHEN the execution completes
- THEN no external messages have been sent
- AND only in-memory state may have been modified (decision audit, AI audit)

### Requirement: SimulatedOutbound for Mediation Results

When the pipeline produces a mediation-related result (mediation session started, mediation reply recorded), the use case SHALL populate `simulatedOutbound` with a `SimulatedOutbound` object:

```typescript
type SimulatedOutbound = {
  toParticipantId: string;
  text: string;
  includesSerenaIntroduction: boolean;
  attribution: {
    fromParticipantId: string;
    fromDisplayName: string;
  };
};
```

This mirrors the existing `OutboundDraft` from mediation-bridge but is included directly in the simulation result for convenience.

#### Scenario: Mediation reply includes simulated outbound

- GIVEN a command that results in a mediation reply being recorded
- WHEN `execute` is called
- THEN `simulatedOutbound` is populated with the draft text and participant info

#### Scenario: Non-mediation flows have no simulated outbound

- GIVEN a command that results in a simple conversation reply
- WHEN `execute` is called
- THEN `simulatedOutbound` is `undefined`
