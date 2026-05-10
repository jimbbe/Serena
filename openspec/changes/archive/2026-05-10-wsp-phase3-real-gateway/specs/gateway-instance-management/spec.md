# Gateway Instance Management Specification

## Purpose

Define the REST endpoints for creating, listing, retrieving QR, and deleting WhatsApp instances via the Evolution API.

## Requirements

### Requirement: Create Instance

The system MUST expose `POST /instances` to create a new WhatsApp instance.

| Aspect | Detail |
|--------|--------|
| Auth | Admin key required |
| Request body | `{ "name": "<instance-name>" }` — `name` is required, non-empty, alphanumeric + hyphens |
| Success | `201` with instance info and QR/pairing code |
| Conflict | `409` if instance with same name already exists |

| Response (201) | Field | Description |
|----------------|-------|-------------|
| `name` | Instance name |
| `status` | Initial status: `"disconnected"` |
| `qr` | Pairing code string from Evolution API (NOT base64) |
| `apiKey` | App key for this instance (same as `GATEWAY_APP_KEY`) |

#### Scenario: Create instance succeeds with QR

- GIVEN valid admin key and `EVOLUTION_API_URL` configured
- WHEN `POST /instances` with `{ "name": "serena-main" }`
- THEN Evolution API creates the instance
- AND response is `201` with `{ "name": "serena-main", "status": "disconnected", "qr": "<pairing-code>", "apiKey": "<app-key>" }`

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
