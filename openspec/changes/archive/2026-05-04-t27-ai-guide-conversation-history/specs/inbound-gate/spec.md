# Delta for Inbound Gate

## ADDED Requirements

### Requirement: ProcessChannelInboundMessage Fetches and Passes Conversation History

The system SHALL, within `ProcessChannelInboundMessage.execute()`, after appending the inbound message to the ConversationStore, fetch recent messages via `listMessages(conversationId)`, exclude the current message by ID, format remaining messages as `[{direction}] {personId} via {channel}: {text}`, and pass them as `recentMessages` in the `AiGuideInput` to `aiGuideService.execute()`.

The `actorRole`, `channel`, and `resolvedIdentity` fields SHALL also be passed alongside `recentMessages` in the same `AiGuideInput` object.

#### Scenario: Second message passes first message in recentMessages

- GIVEN a conversation with one prior message from person "maria" via "simulation"
- WHEN ProcessChannelInboundMessage.execute() processes a second message
- THEN aiGuideService.execute() receives `recentMessages` containing the first message formatted as `"[inbound] maria via simulation: <text>"`

#### Scenario: First message passes empty recentMessages

- GIVEN a new conversation with no prior messages
- WHEN ProcessChannelInboundMessage.execute() processes the first message
- THEN aiGuideService.execute() receives `recentMessages: []`

#### Scenario: No message duplication in history

- GIVEN a conversation with messages [msg1, msg2] and processing msg3
- WHEN recentMessages is built
- THEN msg3 is NOT in recentMessages; only msg1 and msg2 are present

#### Scenario: Chronological order preserved

- GIVEN a conversation with messages in order [msg1, msg2, msg3]
- WHEN processing msg4
- THEN recentMessages contains [msg1, msg2, msg3] in chronological order

#### Scenario: Blocked identity does not fetch history

- GIVEN an inbound message from a blocked identity
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN listMessages is NOT called and aiGuideService is NOT called

#### Scenario: Discard route does not fetch history

- GIVEN an inbound message that results in discard
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN aiGuideService is NOT called
