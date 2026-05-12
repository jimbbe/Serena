# Gateway Evolution API Client Specification

## Purpose

Define the HTTP client that communicates with the Evolution API for instance management and message sending.

## Requirements

### Requirement: Evolution API HTTP Client

The system MUST provide an HTTP client that calls the Evolution API using `fetch` (Node.js built-in).

| Configuration | Env Var | Purpose |
|---------------|---------|---------|
| Base URL | `EVOLUTION_API_URL` | Evolution API endpoint (e.g. `http://evolution-api:8080`) |
| API Key | `EVOLUTION_API_KEY` | Evolution API global key for authentication |

| Constraint | Detail |
|------------|--------|
| Missing URL | Operations MUST fail before making HTTP request with error mentioning `EVOLUTION_API_URL` |
| Missing Key | Operations MUST fail before making HTTP request with error mentioning `EVOLUTION_API_KEY` |
| TCP timeout | 5 seconds for connection |
| HTTP timeout | 30 seconds for full response |
| Auth header | All requests MUST include `apikey: <EVOLUTION_API_KEY>` header |

### Requirement: Instance Operations

The client MUST support these Evolution API operations:

| Operation | Evolution API Endpoint | Method | Purpose |
|-----------|----------------------|--------|---------|
| Create instance | `/instance/create` | POST | Create new WhatsApp instance |
| Fetch connection | `/instance/connectionState/:name` | GET | Check instance connection status |
| Fetch QR | `/instance/connect/:name` | GET | Get QR/pairing code for instance |
| Delete instance | `/instance/delete/:name` | DELETE | Remove WhatsApp instance |

#### Scenario: Create instance calls correct endpoint

- GIVEN `EVOLUTION_API_URL=http://evo:8080` and `EVOLUTION_API_KEY=evo-key`
- WHEN creating instance `"serena-main"`
- THEN `POST http://evo:8080/instance/create` is called
- AND header includes `apikey: evo-key`
- AND body includes `{ "instanceName": "serena-main" }`

#### Scenario: Fetch QR calls correct endpoint

- GIVEN configured client
- WHEN fetching QR for `"serena-main"`
- THEN `GET http://evo:8080/instance/connect/serena-main` is called
- AND header includes `apikey: evo-key`

#### Scenario: Delete instance calls correct endpoint

- GIVEN configured client
- WHEN deleting instance `"serena-main"`
- THEN `DELETE http://evo:8080/instance/delete/serena-main` is called
- AND header includes `apikey: evo-key`

#### Scenario: Missing EVOLUTION_API_URL fails fast

- GIVEN `EVOLUTION_API_URL` is not set
- WHEN any client operation is attempted
- THEN error is returned without making HTTP request
- AND error mentions `EVOLUTION_API_URL`

### Requirement: Send Text Message

The client MUST send text messages via the Evolution API.

| Operation | Evolution API Endpoint | Method |
|-----------|----------------------|--------|
| Send text | `/message/sendText/:instanceName` | POST |

| Request Body | Field | Description |
|--------------|-------|-------------|
| `number` | WhatsApp ID with country code (e.g. `"5491111111111"`) |
| `text` | Message text content |

| Response | Field | Description |
|----------|-------|-------------|
| `key.id` | Evolution API message ID |
| `key.remoteJid` | Destination WhatsApp ID |

#### Scenario: Send text calls correct endpoint

- GIVEN configured client
- WHEN sending `"Hello"` to `"5491111111111"` via instance `"serena-main"`
- THEN `POST http://evo:8080/message/sendText/serena-main` is called
- AND body is `{ "number": "5491111111111", "text": "Hello" }`
- AND header includes `apikey: evo-key`

#### Scenario: Evolution API 500 is propagated

- GIVEN configured client
- AND Evolution API returns `500 Internal Server Error`
- WHEN sending a message
- THEN the error is propagated with status 500 and response body

#### Scenario: Evolution API unreachable returns 502

- GIVEN configured client
- AND Evolution API is not reachable (connection refused)
- WHEN sending a message
- THEN error indicates `502` with message mentioning Evolution API is unreachable
