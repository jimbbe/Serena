# Internal Auth Specification

## Purpose

Protect internal endpoints with a shared secret token (`X-Serena-Internal-Token`) to prevent unauthorized access to the pipeline processing endpoint. Health endpoint remains public.

## Requirements

### Requirement: Internal Token Authentication

The system MUST validate the `X-Serena-Internal-Token` header on all `/internal/*` requests. The token value MUST be read from the `SERENA_INTERNAL_TOKEN` environment variable. If the variable is not set, the system MUST reject all internal requests with HTTP 500 (misconfiguration).

#### Scenario: Health endpoint is always public

- GIVEN the server is running
- WHEN a GET request is sent to `/health` with no token header
- THEN the response is 200 with `{ status: "ok" }`
- AND no token validation is performed

#### Scenario: Health endpoint ignores token header

- GIVEN the server is running
- WHEN a GET request is sent to `/health` with any `X-Serena-Internal-Token` value
- THEN the response is 200 with `{ status: "ok" }`
- AND the token header is ignored (not validated)

#### Scenario: Internal endpoint without token returns 401

- GIVEN `SERENA_INTERNAL_TOKEN` is set to a non-empty value
- WHEN a POST request is sent to `/internal/pipeline/process` without the `X-Serena-Internal-Token` header
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the pipeline is NOT executed

#### Scenario: Internal endpoint with wrong token returns 403

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/pipeline/process` with `X-Serena-Internal-Token: wrong-token`
- THEN the response is 403 with `{ error: "invalid_token" }`
- AND the pipeline is NOT executed

#### Scenario: Internal endpoint with valid token processes normally

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret-abc"`
- WHEN a POST request is sent to `/internal/pipeline/process` with `X-Serena-Internal-Token: secret-abc` and a valid pipeline payload
- THEN the response is 200 with a `PipelineResult`
- AND the pipeline executes normally

#### Scenario: Missing env var causes 500 on internal endpoints

- GIVEN `SERENA_INTERNAL_TOKEN` is NOT set (undefined or empty)
- WHEN a POST request is sent to `/internal/pipeline/process`
- THEN the response is 500 with `{ error: "internal_token_not_configured" }`
- AND the pipeline is NOT executed

### Requirement: Token check before body parsing

The system MUST validate the token BEFORE reading or parsing the request body. Unauthorized requests MUST NOT consume the body stream.

#### Scenario: Token rejection without body consumption

- GIVEN `SERENA_INTERNAL_TOKEN` is set to `"secret"`
- WHEN a POST request is sent to `/internal/pipeline/process` with no token and invalid JSON body
- THEN the response is 401 with `{ error: "missing_token" }`
- AND the invalid JSON does NOT cause a 400 error (token check happens first)
