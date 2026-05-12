# Gateway HTTP Server Specification

## Purpose

Define the HTTP server that exposes the WhatsApp Gateway REST API. Uses `node:http` with zero npm dependencies. Supports two modes: `production` (HTTP server active) and `dry_run` (HTTP server disabled, only CLI dry-run available).

## Requirements

### Requirement: HTTP Server Lifecycle

The system MUST provide an HTTP server that listens on a configurable port and routes requests to the correct handlers.

| Aspect | Detail |
|--------|--------|
| Server runtime | `node:http` (built-in, zero npm deps) |
| Port | Configured via `PORT` env var, default `3001` |
| Mode gate | Server only starts when `GATEWAY_MODE` is not `dry_run` |
| Content-Type | All responses MUST include `Content-Type: application/json` unless otherwise specified |
| Method enforcement | Endpoints MUST reject unsupported HTTP methods with `405 Method Not Allowed` |
| Unknown routes | MUST return `404 Not Found` with `{ "error": "not_found", "path": "<path>" }` |

#### Scenario: Server starts on configured port

- GIVEN `GATEWAY_MODE=production` and `PORT=3001`
- WHEN the server starts
- THEN it listens on port 3001
- AND `GET /health` returns 200

#### Scenario: Server does not start in dry-run mode

- GIVEN `GATEWAY_MODE=dry_run`
- WHEN the application starts
- THEN no HTTP server is created
- AND no port is bound

#### Scenario: Unknown route returns 404

- GIVEN the server is running
- WHEN a `GET /unknown-path` request is received
- THEN the response is `404` with `{ "error": "not_found", "path": "/unknown-path" }`

#### Scenario: Wrong method returns 405

- GIVEN the server is running
- WHEN a `PUT /health` request is received
- THEN the response is `405` with `{ "error": "method_not_allowed" }`

### Requirement: Health Check Endpoint

The system MUST expose a `GET /health` endpoint that requires no authentication.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/health` |
| Auth | None |
| Success | `200 { "status": "ok", "service": "whatsapp-gateway", "mode": "<mode>" }` |

#### Scenario: Health check returns service info

- GIVEN the server is running with `GATEWAY_MODE=production`
- WHEN `GET /health` is called
- THEN response is `200` with `{ "status": "ok", "service": "whatsapp-gateway", "mode": "production" }`

#### Scenario: Health check works without auth

- GIVEN the server is running
- WHEN `GET /health` is called without any auth headers
- THEN response is `200` (no auth required)

### Requirement: Request Parsing

The system MUST parse incoming JSON request bodies for `POST` and `PUT` endpoints.

| Constraint | Detail |
|------------|--------|
| Max body size | 1 MB — larger bodies MUST return `413 Payload Too Large` |
| Invalid JSON | MUST return `400 Bad Request` with `{ "error": "invalid_json" }` |
| Missing Content-Type | `POST`/`PUT` without `application/json` MUST return `415 Unsupported Media Type` |

#### Scenario: Valid JSON body is parsed

- GIVEN `POST /instances` with `Content-Type: application/json`
- AND body `{ "name": "serena-main" }`
- WHEN the request is received
- THEN the body is parsed as `{ name: "serena-main" }`

#### Scenario: Invalid JSON returns 400

- GIVEN `POST /instances` with malformed JSON body
- WHEN the request is received
- THEN response is `400` with `{ "error": "invalid_json" }`

#### Scenario: Oversized body returns 413

- GIVEN `POST /instances` with body larger than 1 MB
- WHEN the request is received
- THEN response is `413` with `{ "error": "payload_too_large" }`

#### Scenario: Missing Content-Type returns 415

- GIVEN `POST /instances` without `Content-Type: application/json`
- WHEN the request is received
- THEN response is `415` with `{ "error": "unsupported_media_type" }`
