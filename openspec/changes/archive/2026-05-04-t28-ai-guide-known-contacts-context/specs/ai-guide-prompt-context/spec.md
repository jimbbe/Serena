# Delta for AI Guide Prompt Context

## MODIFIED Requirements

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

(Previously: all prompts had `includeKnownContacts: false`)

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

The system SHALL render a `Contactos conocidos` section in the user prompt when `includeKnownContacts=true` AND `knownContacts` is a non-empty array. Each contact SHALL be formatted as `Name (id: contact-id)` in the rendered section.

When `knownContacts` is empty or `includeKnownContacts=false`, the section SHALL be omitted entirely — no empty section, no placeholder text.

(Previously: `includeKnownContacts` was always `false`, so this section was never rendered)

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

## ADDED Requirements

### Requirement: Template Rendering Receives Only String Values

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
