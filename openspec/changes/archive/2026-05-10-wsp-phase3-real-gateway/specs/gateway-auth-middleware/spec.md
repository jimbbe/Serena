# Gateway Auth Middleware Specification

## Purpose

Define the 3-tier API key authentication system that protects all gateway endpoints except `/health`.

## Requirements

### Requirement: 3-Tier API Key Authentication

The system MUST validate API keys from environment variables against request headers. Three tiers exist with distinct permissions.

| Tier | Header | Env Var | Permissions |
|------|--------|---------|-------------|
| Admin | `X-Gateway-Admin-Key` | `GATEWAY_ADMIN_KEY` | `POST /instances`, `GET /instances`, `GET /instances/:name/qr`, `DELETE /instances/:name` |
| App | `X-Gateway-App-Key` | `GATEWAY_APP_KEY` | `POST /send` |
| Evolution | `X-Gateway-Evo-Key` | `GATEWAY_EVO_KEY` | `POST /webhook/evolution` |

| Rule | Detail |
|------|--------|
| Missing key | `401 Unauthorized` with `{ "error": "unauthorized", "message": "API key required" }` |
| Invalid key | `403 Forbidden` with `{ "error": "forbidden", "message": "Invalid API key" }` |
| Wrong tier | `403 Forbidden` — using admin key on `/send` MUST be rejected |
| Key logging | API key values MUST NOT appear in logs or error messages |
| `/health` exempt | Health check MUST NOT require any authentication |

#### Scenario: Admin key accesses instance creation

- GIVEN `GATEWAY_ADMIN_KEY=admin-secret-123`
- WHEN `POST /instances` is called with `X-Gateway-Admin-Key: admin-secret-123`
- THEN the request passes auth and proceeds to handler

#### Scenario: App key accesses send endpoint

- GIVEN `GATEWAY_APP_KEY=app-secret-456`
- WHEN `POST /send` is called with `X-Gateway-App-Key: app-secret-456`
- THEN the request passes auth and proceeds to handler

#### Scenario: Evolution key accesses webhook

- GIVEN `GATEWAY_EVO_KEY=evo-secret-789`
- WHEN `POST /webhook/evolution` is called with `X-Gateway-Evo-Key: evo-secret-789`
- THEN the request passes auth and proceeds to handler

#### Scenario: Missing key returns 401

- GIVEN the server is running
- WHEN `POST /instances` is called without any auth header
- THEN response is `401` with `{ "error": "unauthorized", "message": "API key required" }`

#### Scenario: Invalid key returns 403

- GIVEN `GATEWAY_ADMIN_KEY=admin-secret-123`
- WHEN `POST /instances` is called with `X-Gateway-Admin-Key: wrong-key`
- THEN response is `403` with `{ "error": "forbidden", "message": "Invalid API key" }`

#### Scenario: Wrong tier key is rejected

- GIVEN `GATEWAY_ADMIN_KEY=admin-secret-123` and `GATEWAY_APP_KEY=app-secret-456`
- WHEN `POST /send` is called with `X-Gateway-Admin-Key: admin-secret-123`
- THEN response is `403` (admin key not valid for app endpoints)

#### Scenario: Health check requires no auth

- GIVEN the server is running
- WHEN `GET /health` is called with no auth headers
- THEN response is `200`

### Requirement: Configuration Validation

The system MUST validate that required API key env vars are set before starting the server.

| Missing Var | Behavior |
|-------------|----------|
| `GATEWAY_ADMIN_KEY` | Server MUST NOT start; log error mentioning the missing var |
| `GATEWAY_APP_KEY` | Server MUST NOT start; log error mentioning the missing var |
| `GATEWAY_EVO_KEY` | Server MUST NOT start; log error mentioning the missing var |

#### Scenario: Missing admin key prevents startup

- GIVEN `GATEWAY_ADMIN_KEY` is not set
- WHEN the server attempts to start
- THEN startup fails with an error mentioning `GATEWAY_ADMIN_KEY`
- AND no port is bound

#### Scenario: All keys set allows startup

- GIVEN all three API key env vars are set to non-empty values
- WHEN the server attempts to start
- THEN auth validation passes and server starts normally
