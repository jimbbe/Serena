# Gateway Instance Management Specification

## Purpose

Define the REST endpoints for creating, listing, retrieving QR, and deleting WhatsApp instances via the Evolution API.

## Requirements

### Requirement: Create Instance

The system MUST expose `POST /instances` to create a new WhatsApp instance without returning raw secrets.

| Aspect | Detail |
|--------|--------|
| Auth | Admin key required |
| Request body | `{ "name": "<instance-name>" }` — `name` is required, non-empty, alphanumeric + hyphens |
| Success | `201` with safe instance metadata and QR/pairing code |
| Conflict | `409` if instance with same name already exists |

| Response (201) | Field | Description |
|----------------|-------|-------------|
| `name` | Instance name |
| `status` | Initial status: `"disconnected"` |
| `qr` | Pairing code string from Evolution API (NOT base64) |

The success response MUST NOT include raw `apiKey`, app keys, admin keys, internal tokens, or any other credential material.

#### Scenario: Create instance succeeds with safe metadata only

- GIVEN valid admin key and `EVOLUTION_API_URL` configured
- WHEN `POST /instances` with `{ "name": "serena-main" }`
- THEN Evolution API creates the instance
- AND response is `201` with `{ "name": "serena-main", "status": "disconnected", "qr": "<pairing-code>" }`
- AND response does not include `apiKey` or any credential field

#### Scenario: Create instance with invalid name

- WHEN `POST /instances` with `{ "name": "" }`
- THEN response is `400` with `{ "error": "invalid_instance_name" }`

#### Scenario: Create duplicate instance

- GIVEN instance `"serena-main"` already exists
- WHEN `POST /instances` with `{ "name": "serena-main" }`
- THEN response is `409` with `{ "error": "instance_exists", "name": "serena-main" }`

### Requirement: List Instances

The system MUST expose `GET /instances` to list all managed instances.

| Aspect | Detail |
|--------|--------|
| Auth | Admin key required |
| Success | `200` with array of instance summaries |

| Response Item | Field | Description |
|---------------|-------|-------------|
| `name` | Instance name |
| `status` | Connection status: `"disconnected"`, `"connecting"`, `"open"`, `"connected"` |
| `connectedAt` | ISO 8601 timestamp when connected (null if not connected) |

#### Scenario: List instances returns all instances

- GIVEN two instances exist: `"serena-main"` (connected) and `"test-instance"` (disconnected)
- WHEN `GET /instances` is called with valid admin key
- THEN response is `200` with array of both instances and their statuses

#### Scenario: List instances with no instances

- GIVEN no instances have been created
- WHEN `GET /instances` is called
- THEN response is `200` with empty array `[]`

### Requirement: Get Instance QR

The system MUST expose `GET /instances/:name/qr` to retrieve the QR/pairing code for an instance.

| Aspect | Detail |
|--------|--------|
| Auth | Admin key required |
| Connected | `200 { "status": "connected", "message": "Already connected" }` |
| Disconnected | `200 { "qr": "<pairing-code>", "status": "disconnected" }` |
| Not found | `404 { "error": "instance_not_found", "name": "<name>" }` |

#### Scenario: Get QR for disconnected instance

- GIVEN instance `"serena-main"` exists and is disconnected
- WHEN `GET /instances/serena-main/qr` is called
- THEN response is `200` with `{ "qr": "<pairing-code>", "status": "disconnected" }`

#### Scenario: Get QR for connected instance

- GIVEN instance `"serena-main"` exists and is connected
- WHEN `GET /instances/serena-main/qr` is called
- THEN response is `200` with `{ "status": "connected", "message": "Already connected" }`

#### Scenario: Get QR for non-existent instance

- WHEN `GET /instances/nonexistent/qr` is called
- THEN response is `404` with `{ "error": "instance_not_found", "name": "nonexistent" }`

### Requirement: Delete Instance

The system MUST expose `DELETE /instances/:name` to remove a WhatsApp instance.

| Aspect | Detail |
|--------|--------|
| Auth | Admin key required |
| Success | `200 { "name": "<name>", "deleted": true }` |
| Not found | `404 { "error": "instance_not_found", "name": "<name>" }` |

#### Scenario: Delete existing instance

- GIVEN instance `"serena-main"` exists
- WHEN `DELETE /instances/serena-main` is called with valid admin key
- THEN Evolution API deletes the instance
- AND response is `200` with `{ "name": "serena-main", "deleted": true }`

#### Scenario: Delete non-existent instance

- WHEN `DELETE /instances/nonexistent` is called
- THEN response is `404` with `{ "error": "instance_not_found", "name": "nonexistent" }`

### Requirement: Operator-Only Instance and Number Management

T41 MUST constrain WhatsApp instance, number, and selected config management to operator-only private access. Public admin exposure and end-user/self-service management are out of scope.

#### Scenario: Management uses private operator path

- GIVEN an operator manages instances or routing config
- WHEN `/instances*` or config artifacts are used
- THEN access is limited to an operator-controlled private path
- AND no public Caddy/admin route is introduced

#### Scenario: No real pairing in T41

- GIVEN instance management readiness is validated
- WHEN QR/pairing behavior is documented or smoke-checked
- THEN no real WhatsApp account is paired
- AND no real number is onboarded

### Requirement: Phase-Limited Management State

T41 MUST document that instance tracking and routing/config management remain staging-limited: in-memory instance state, file/env configuration, and no startup rehydration or durable admin store.

#### Scenario: Restart limitation is explicit

- GIVEN `gateway-wa` restarts during staging
- WHEN an operator inspects managed instances
- THEN local tracking may be empty despite Evolution source-of-truth state
- AND rehydration/persistence remains future work

### Requirement: Phase 3 In-Memory Instance Tracking

The system MUST document and treat `InstanceManager` as in-memory only for Phase 3.

| Aspect | Phase 3 behavior |
|--------|------------------|
| Local storage | JavaScript `Map` in the gateway process |
| Restart behavior | Local instance tracking is lost |
| Source of truth | Evolution API remains source of truth for WhatsApp sessions |
| Rehydration | Out of scope for Phase 3 |

#### Scenario: Gateway restart loses local instance tracking

- GIVEN Evolution API still has a WhatsApp session after gateway restart
- WHEN the gateway process restarts
- THEN `InstanceManager` starts empty
- AND the operator must recreate or revalidate local instance tracking for MVP/demo use

#### Scenario: Rehydration remains future work

- GIVEN Phase 3 is deployed or tested
- WHEN the gateway starts
- THEN it does NOT rehydrate local instances from Evolution API
- AND durable persistence or startup rehydration is reserved for a future phase

### Requirement: Private Allowlist Runtime-Config Decision

For T46 controlled rehearsal planning, allowed WhatsApp numbers and instance mappings MUST be configured outside committed code and outside repo secrets. They MUST NOT be hardcoded in application code and MUST NOT require PostgreSQL yet.

#### Scenario: Allowlist is runtime-owned

- GIVEN T45 readiness defines allowed numbers
- WHEN implementation is planned
- THEN the allowlist MUST be a private runtime/operator config concern
- AND committed examples MUST use placeholders only

#### Scenario: Hardcoded or PostgreSQL dependency is rejected

- GIVEN code, specs, or docs require committed real numbers or PostgreSQL for T45/T46 allowlist
- WHEN validation runs
- THEN readiness MUST fail closed

### Requirement: Controlled Rehearsal Instance-State Limits

The system MAY accept in-memory instance tracking only for a controlled private rehearsal. Any gateway or Evolution restart MUST abort the rehearsal and require operator revalidation before continuing.

#### Scenario: Restart requires revalidation

- GIVEN a paired or pairing-ready instance exists for controlled rehearsal
- WHEN gateway-wa or Evolution restarts
- THEN local readiness MUST be considered invalid
- AND the operator MUST revalidate instance, routing, allowlist, and evidence baseline before proceeding

#### Scenario: Sustained use needs hardening

- GIVEN the system is considered for sustained, shared, or public use
- WHEN readiness is assessed
- THEN deferred HMAC and in-memory state MUST NOT be accepted as sufficient
