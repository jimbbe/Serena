# Delta for Inbound Gate

## ADDED Requirements

### Requirement: ProcessChannelInboundMessage Accepts ContactDirectory Dependency

The system SHALL add `contactDirectory: ContactDirectory` (the full port from the contact-directory module) to `ProcessChannelInboundMessageDependencies`. This dependency SHALL be optional in the constructor to maintain backward compatibility.

#### Scenario: ContactDirectory accepted as dependency

- GIVEN a ProcessChannelInboundMessage constructed with a ContactDirectory
- WHEN execute() is called
- THEN the use case can access contactDirectory.findAll()

#### Scenario: ProcessChannelInboundMessage works without ContactDirectory

- GIVEN a ProcessChannelInboundMessage constructed WITHOUT a ContactDirectory
- WHEN execute() is called
- THEN the pipeline continues functioning normally with knownContacts: []

### Requirement: ProcessChannelInboundMessage Fetches and Passes Known Contacts for Mediation

The system SHALL, within `ProcessChannelInboundMessage.execute()`, for mediation routes (`mediation_understanding` and `clarification`), call `contactDirectory.findAll()`, filter out any contacts marked as not-allowed or blocked, map remaining contacts to the format `"DisplayName (id: contact-id)"`, and pass them as `knownContacts` in the `AiGuideInput` to `aiGuideService.execute()`.

The `knownContacts` field SHALL be passed alongside `recentMessages`, `actorRole`, `channel`, and `resolvedIdentity` in the same `AiGuideInput` object.

#### Scenario: mediation_understanding passes knownContacts

- GIVEN a ContactDirectory with contacts [María (c1), Carlos (c2), Juan (c3)]
- AND an inbound message routed to `mediation_understanding`
- WHEN ProcessChannelInboundMessage.execute() calls aiGuideService.execute()
- THEN the AiGuideInput includes `knownContacts: ["María (id: c1)", "Carlos (id: c2)", "Juan (id: c3)"]`

#### Scenario: clarification passes knownContacts

- GIVEN a ContactDirectory with contacts [María (c1), Carlos (c2)]
- AND an inbound message routed to `clarification`
- WHEN ProcessChannelInboundMessage.execute() calls aiGuideService.execute()
- THEN the AiGuideInput includes `knownContacts: ["María (id: c1)", "Carlos (id: c2)"]`

#### Scenario: blocked contacts filtered out before passing to AI Guide

- GIVEN a ContactDirectory where some contacts are marked as not-allowed or blocked
- AND an inbound message routed to `mediation_understanding`
- WHEN ProcessChannelInboundMessage.execute() builds knownContacts
- THEN blocked/not-allowed contacts are NOT included in the knownContacts array

#### Scenario: ContactDirectory not provided yields empty knownContacts

- GIVEN a ProcessChannelInboundMessage constructed without ContactDirectory
- AND an inbound message routed to `mediation_understanding`
- WHEN ProcessChannelInboundMessage.execute() calls aiGuideService.execute()
- THEN the AiGuideInput includes `knownContacts: []` or omits the field entirely

### Requirement: Non-Mediation Routes Do Not Pass Known Contacts

The system SHALL NOT pass `knownContacts` (or SHALL pass `knownContacts: []`) to `aiGuideService.execute()` for non-mediation routes: `conversation` (conversation-reply) and `risk_review` (risk-review).

#### Scenario: conversation route does not pass knownContacts

- GIVEN an inbound message routed to `conversation`
- AND a ContactDirectory with contacts available
- WHEN ProcessChannelInboundMessage.execute() calls aiGuideService.execute()
- THEN the AiGuideInput does NOT include knownContacts, or includes `knownContacts: []`

#### Scenario: risk_review route does not pass knownContacts

- GIVEN an inbound message routed to `risk_review`
- AND a ContactDirectory with contacts available
- WHEN ProcessChannelInboundMessage.execute() calls aiGuideService.execute()
- THEN the AiGuideInput does NOT include knownContacts, or includes `knownContacts: []`

### Requirement: Blocked and Discard Routes Do Not Invoke AI Guide

The system SHALL NOT invoke `aiGuideService.execute()` nor fetch contacts for blocked identity or discard routes. These routes SHALL short-circuit before any AI Guide interaction.

#### Scenario: blocked identity short-circuits without AI

- GIVEN an inbound message from a blocked identity
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN contactDirectory.findAll() is NOT called AND aiGuideService.execute() is NOT called

#### Scenario: discard route short-circuits without AI

- GIVEN an inbound message that results in a discard route
- WHEN ProcessChannelInboundMessage.execute() runs
- THEN contactDirectory.findAll() is NOT called AND aiGuideService.execute() is NOT called
