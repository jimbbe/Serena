# Delta for Gateway Instance Management

## MODIFIED Requirements

### Requirement: Create Instance

The system MUST expose `POST /instances` to create a new WhatsApp instance without returning raw secrets.
(Previously: success returned instance info, QR/pairing code, and raw `apiKey`.)

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
