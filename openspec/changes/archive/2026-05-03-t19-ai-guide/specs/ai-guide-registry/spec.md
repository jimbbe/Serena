# AI Guide Registry Specification

## Purpose

Define the UseCaseRegistry that manages registration, retrieval, and listing of AI use case contracts.

## Requirements

### Requirement: Register Use Case Contract

The system SHALL allow registering a `UseCaseContract` in the registry by its `GuideUseCaseId`. Registration SHALL prevent accidental overwriting — attempting to register a contract with an ID that already exists SHALL throw an error.

#### Scenario: New contract registered successfully

- GIVEN an empty UseCaseRegistry
- WHEN a UseCaseContract with a new ID is registered
- THEN the contract is stored and retrievable

#### Scenario: Duplicate registration rejected

- GIVEN a UseCaseRegistry with an existing contract for ID "serena.conversation.reply"
- WHEN attempting to register another contract with the same ID
- THEN an error is thrown and the original contract remains unchanged

### Requirement: Retrieve Use Case Contract

The system SHALL allow retrieving a `UseCaseContract` by its `GuideUseCaseId`. Requesting a contract that has not been registered SHALL return `undefined`.

#### Scenario: Registered contract retrieved

- GIVEN a UseCaseRegistry with a registered contract for "serena.conversation.reply"
- WHEN get is called with "serena.conversation.reply"
- THEN the exact registered contract is returned

#### Scenario: Unregistered contract returns undefined

- GIVEN a UseCaseRegistry with no contract for "serena.risk.review"
- WHEN get is called with "serena.risk.review"
- THEN `undefined` is returned

### Requirement: List All Contracts

The system SHALL provide a method to retrieve all registered contracts as a read-only collection. The returned collection SHALL NOT allow mutation of the registry's internal state.

#### Scenario: All contracts listed

- GIVEN a UseCaseRegistry with three registered contracts
- WHEN getAll is called
- THEN all three contracts are returned in a read-only collection

#### Scenario: Empty registry returns empty list

- GIVEN an empty UseCaseRegistry
- WHEN getAll is called
- THEN an empty read-only collection is returned
