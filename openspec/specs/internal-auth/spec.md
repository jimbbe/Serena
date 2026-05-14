# Internal Auth Specification

## Purpose

Protect internal endpoints with a shared secret token (`X-Serena-Internal-Token`) to prevent unauthorized access to Serena Core internal routes. The health endpoint remains public.

## Requirements

### Requirement: Internal Token Authentication

The system MUST validate the `X-Serena-Internal-Token` header on all `/internal/*` requests, including `/internal/pipeline/process` and `/internal/webhook/whatsapp`. The token value MUST be read from the `SERENA_INTERNAL_TOKEN` environment variable. If the variable is unset or empty, the system MUST reject internal requests with HTTP 500. Token values MUST NOT be logged.

#### Scenario: Health endpoint is always public

- GIVEN the server is running
- WHEN a GET request is sent to `/health` with no token header
- THEN the response is 200 with `{ status: "ok" }`
- AND no token validation is performed

#### Scenario: Health endpoint ignores token header

- GIVEN the server is running
- WHEN a GET request is sent to `/health` with any `X-Serena-Internal-Token` value
- THEN the response is 200 with `{ status: "ok" }`
- AND the token header is ignored and not logged

#### Scenario: Internal pipeline endpoint without token returns 401

- GIVEN `SERENA_INTERNAL_TOKEN` is set to a non-empty value
- WHEN a POST request is sent to `/internal/pipeline/process` without the token header
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the pipeline is NOT executed

#### Scenario: WhatsApp webhook without token returns 401

- GIVEN `SERENA_INTERNAL_TOKEN` is set to a non-empty value
- WHEN a POST request is sent to `/internal/webhook/whatsapp` without the token header
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the webhook pipeline is NOT executed

#### Scenario: Internal pipeline endpoint with wrong token returns 403

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/pipeline/process` with `X-Serena-Internal-Token: wrong-token`
- THEN the response is 403 with `{ error: "invalid_token" }`
- AND the pipeline is NOT executed

#### Scenario: WhatsApp webhook with wrong token returns 403

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/webhook/whatsapp` with `X-Serena-Internal-Token: wrong-token`
- THEN the response is 403 with `{ error: "invalid_token" }`
- AND the webhook pipeline is NOT executed
- AND the wrong token value is NOT logged

#### Scenario: Internal endpoint with valid token processes normally

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/pipeline/process` with a valid token and payload
- THEN the response is 200 with a `PipelineResult`
- AND the pipeline executes normally

#### Scenario: WhatsApp webhook with valid token processes normally

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/webhook/whatsapp` with a valid token and WhatsApp payload
- THEN the response is 200 with `{ received: true, routedTo: "serena-core", result: ... }`
- AND the normal channel-inbound pipeline executes

#### Scenario: Missing env var causes 500 on internal endpoints

- GIVEN `SERENA_INTERNAL_TOKEN` is NOT set (undefined or empty)
- WHEN a POST request is sent to any `/internal/*` endpoint
- THEN the response is 500 with `{ error: "internal_token_not_configured" }`
- AND no internal pipeline is executed

#### Scenario: Known internal route with wrong method requires valid auth first

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a GET request is sent to `/internal/webhook/whatsapp` without token
- THEN the response is 401 with `{ error: "missing_token" }`
- WHEN a GET request is sent to `/internal/webhook/whatsapp` with a valid token
- THEN the response is 405 with `{ error: "method_not_allowed" }`

#### Scenario: Unknown internal route still requires auth

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a request is sent to `/internal/unknown` without token
- THEN the response is 401 with `{ error: "missing_token" }`
- WHEN the same request is sent with a valid token
- THEN the response is 404 with `{ error: "not_found" }`

### Requirement: Token check before body parsing

The system MUST validate the token BEFORE reading or parsing the request body on internal endpoints. Unauthorized requests MUST NOT consume the body stream.

#### Scenario: Pipeline token rejection without body consumption

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret"`
- WHEN a POST request is sent to `/internal/pipeline/process` with no token and invalid JSON body
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the invalid JSON does NOT cause a 400 error

#### Scenario: WhatsApp webhook token rejection without body consumption

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret"`
- WHEN a POST request is sent to `/internal/webhook/whatsapp` with no token and invalid JSON body
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the invalid JSON does NOT cause a 400 error

### Requirement: VPS Runtime Internal Token Configuration

The VPS core deployment MUST pass `SERENA_INTERNAL_TOKEN` from the VPS runtime `.env` into `serena-core`. The token MUST NOT be committed, echoed, printed, or embedded in repository artifacts. The T38 runbook MUST fail fast before updating or verifying core if the VPS token is absent or empty.

#### Scenario: Core receives token from VPS env

- GIVEN `/docker/serena/.env` contains a non-empty `SERENA_INTERNAL_TOKEN`
- WHEN the T38 core compose is rendered or started
- THEN `serena-core` receives `SERENA_INTERNAL_TOKEN` from the VPS env
- AND the token value is not printed in logs or docs

#### Scenario: Missing token blocks T38 update

- GIVEN `/docker/serena/.env` has no non-empty `SERENA_INTERNAL_TOKEN`
- WHEN an operator follows the T38 runbook
- THEN the runbook stops before refresh or verification steps
- AND instructs the operator to set the secret only in VPS runtime config

#### Scenario: Secrets stay out of Git

- GIVEN T38 changes are reviewed
- WHEN repository files are inspected
- THEN no real token, `.env`, credential, or secret value is committed
