# AI Guide Conversation History Specification

## Purpose

Define how recent conversation messages are fetched, formatted, and wired through the AiGuide pipeline so the LLM receives conversation context. This spec covers the data flow from ConversationStore through ProcessChannelInboundMessage, AiGuideService, ExecutionPipeline, and ContextBuilder.

## Requirements

### Requirement: Conversation History Fetch in ProcessChannelInboundMessage

The system SHALL, within `ProcessChannelInboundMessage.execute()`, after appending the inbound message to the ConversationStore, fetch recent messages via `listMessages(conversationId)` and format them as `string[]` for the `recentMessages` field of `AiGuideInput`. Each message SHALL be formatted as: `[inbound] {personId} via {channel}: {text}` for inbound messages and `[outbound] {personId} via {channel}: {text}` for outbound messages.

The current message (the one just appended) SHALL be excluded from `recentMessages` by comparing message IDs. For the first message in a conversation, `recentMessages` SHALL be an empty array `[]`.

For blocked or discard flows, no history fetch SHALL occur.

#### Scenario: Second message includes first in history

- GIVEN a conversation with one existing message `[inbound] maria via simulation: hola`
- WHEN a second inbound message is processed
- THEN `recentMessages` contains `["[inbound] maria via simulation: hola"]`

#### Scenario: First message has empty history

- GIVEN a newly created conversation with no prior messages
- WHEN the first inbound message is processed
- THEN `recentMessages` is `[]`

#### Scenario: Current message excluded from history

- GIVEN a conversation with messages [msg1, msg2] and a new message msg3 being appended
- WHEN `recentMessages` is built
- THEN msg3 is NOT included in `recentMessages`

#### Scenario: Blocked identity skips history fetch

- GIVEN an inbound message from a blocked identity
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN `listMessages` is NOT called for history

#### Scenario: Discard route skips history fetch

- GIVEN an inbound message that results in a discard route
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN `recentMessages` is NOT passed to aiGuideService (aiGuideService is not called)

### Requirement: Conversation History Activation in Prompt Definitions

The system SHALL activate `includeConversationHistory: true` in the `contextPolicy` of the following prompt definitions, each with a specific `maxRecentMessages` limit:

| Prompt | includeConversationHistory | maxRecentMessages |
|--------|---------------------------|-------------------|
| `conversation-reply.v1` | `true` | 6 |
| `risk-review.v1` | `true` | 5 |
| `mediation-understand-request.v1` | `true` | 4 |
| `mediation-clarify.v1` | `true` | 3 |

All prompts SHALL keep `includeKnownContacts: false`, `includeSafetyMemory: false`, and `includeFullConversation: false`.

#### Scenario: conversation-reply includes up to 6 recent messages

- GIVEN the conversation-reply.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeConversationHistory` is `true` and `maxRecentMessages` is `6`

#### Scenario: risk-review includes up to 5 recent messages

- GIVEN the risk-review.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeConversationHistory` is `true` and `maxRecentMessages` is `5`

#### Scenario: mediation-understand-request includes up to 4 recent messages

- GIVEN the mediation-understand-request.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeConversationHistory` is `true` and `maxRecentMessages` is `4`

#### Scenario: mediation-clarify includes up to 3 recent messages

- GIVEN the mediation-clarify.v1 prompt definition
- WHEN its contextPolicy is inspected
- THEN `includeConversationHistory` is `true` and `maxRecentMessages` is `3`

#### Scenario: All prompts keep contacts and safety memory disabled

- GIVEN any prompt definition in defaultPrompts
- WHEN its contextPolicy is inspected
- THEN `includeKnownContacts` is `false`, `includeSafetyMemory` is `false`, and `includeFullConversation` is `false`

### Requirement: ProcessChannelInboundMessage Passes Context Fields

The system SHALL pass `actorRole`, `channel`, and `resolvedIdentity` alongside `recentMessages` to `aiGuideService.execute()` in the `AiGuideInput`. These fields SHALL be derived from the resolved identity and the inbound command.

#### Scenario: actorRole, channel, resolvedIdentity passed with history

- GIVEN a resolved identity with role="elder", channel="simulation", displayName="Maria"
- WHEN aiGuideService.execute() is called
- THEN the input includes `actorRole: "elder"`, `channel: "simulation"`, `resolvedIdentity: "Maria"`, and `recentMessages`

### Requirement: History Message Format

The system SHALL format each conversation message as a string with the pattern: `[{direction}] {personId} via {channel}: {text}` where `direction` is either `inbound` or `outbound`, `personId` is the sender's person ID, `channel` is the channel identifier, and `text` is the message content.

#### Scenario: Inbound message formatted correctly

- GIVEN a ConversationMessage with direction="inbound", personId="maria", channel="simulation", text="hola"
- WHEN formatted for recentMessages
- THEN the result is `"[inbound] maria via simulation: hola"`

#### Scenario: Outbound message formatted correctly

- GIVEN a ConversationMessage with direction="outbound", personId="serena", channel="simulation", text="Hola Maria"
- WHEN formatted for recentMessages
- THEN the result is `"[outbound] serena via simulation: Hola Maria"`

### Requirement: Guard Test for Conversation History Activation

The system SHALL update the guard test in `context-policy.test.ts` to assert that ALL prompts have `includeConversationHistory: true` (replacing the previous guard that asserted `false`). The guard SHALL verify the wiring is active.

#### Scenario: Guard asserts includeConversationHistory is true

- GIVEN all prompt definitions in defaultPrompts
- WHEN the guard test runs
- THEN every prompt has `includeConversationHistory: true`
