# Contact Directory Integration Specification

## Purpose

Define how the full ContactDirectory port from the contact-directory module is wired into the inbound gate pipeline to provide known contacts for AI Guide mediation context. This spec covers the integration point, data formatting, and seed data availability.

## Requirements

### Requirement: Full ContactDirectory Port Used

The system SHALL use the full `ContactDirectory` port from the `contact-directory` module (not the minimal inbound-gate port). The full port provides: `hasAllowedSender()`, `findByWhatsAppId()`, `findById()`, and `findAll()`.

The minimal inbound-gate `ContactDirectory` (which only provides `hasAllowedSender()`) SHALL NOT be used for fetching known contacts.

#### Scenario: full port interface available

- GIVEN the contact-directory module's ContactDirectory port
- WHEN the interface is inspected
- THEN it provides findAll(), findById(), findByWhatsAppId(), and hasAllowedSender()

#### Scenario: minimal port not used for contact listing

- GIVEN the inbound-gate module's ContactDirectory port
- WHEN knownContacts are needed for AI Guide
- THEN the full contact-directory port is used, NOT the inbound-gate minimal port

### Requirement: findAll() as Source of Known Contacts

The system SHALL use `ContactDirectory.findAll()` as the source of known contacts for the AI Guide context. The method SHALL return `readonly Contact[]` where each Contact has `id`, `displayName`, and `whatsappId` fields.

#### Scenario: findAll returns all contacts

- GIVEN a ContactDirectory seeded with 5 contacts
- WHEN findAll() is called
- THEN it returns all 5 contacts as a readonly array

#### Scenario: findAll returns empty array for empty directory

- GIVEN a ContactDirectory with no contacts
- WHEN findAll() is called
- THEN it returns an empty array `[]`

### Requirement: Contact Formatting for Prompts

The system SHALL format contacts for AI Guide prompts using the pattern `"DisplayName (id: contact-id)"`. Phone numbers (`whatsappId`) and external identifiers SHALL NOT appear in the prompt text. Only the display name and the internal contact id SHALL be included.

#### Scenario: contact formatted with name and id

- GIVEN a Contact with `displayName: "María"` and `id: "c1"`
- WHEN formatted for the AI Guide prompt
- THEN the result is `"María (id: c1)"`

#### Scenario: no phone numbers in prompt

- GIVEN a Contact with `whatsappId: "5491112345678"`
- WHEN formatted for the AI Guide prompt
- THEN the whatsappId does NOT appear in the formatted string

#### Scenario: multiple contacts formatted as array

- GIVEN Contacts [María (c1), Carlos (c2), Juan (c3)]
- WHEN formatted for knownContacts
- THEN the result is `["María (id: c1)", "Carlos (id: c2)", "Juan (id: c3)"]`

### Requirement: Seed Contacts Available for Mediation Context

The system SHALL ensure that seed contacts from the in-memory adapter are available for mediation context. The seed data (loaded from `contacts.seed.json`) SHALL be accessible via `loadContactsFromSeed()` and instantiable as `InMemoryContactDirectory`.

#### Scenario: seed contacts load successfully

- GIVEN the contacts.seed.json file exists with 5 contacts
- WHEN loadContactsFromSeed() is called
- THEN it returns 5 Contact objects with id, displayName, and whatsappId

#### Scenario: in-memory adapter serves seed data

- GIVEN contacts loaded from seed
- WHEN InMemoryContactDirectory is constructed with those contacts
- AND findAll() is called
- THEN all seed contacts are returned

#### Scenario: seed contacts available in createInMemoryPipeline

- GIVEN createInMemoryPipeline() is called
- WHEN the factory completes
- THEN the contactDirectory (built from seed data) is available for injection into ProcessChannelInboundMessage
