# Internal Pipeline HTTP Specification (Delta)

## Purpose

Delta spec for the internal pipeline HTTP endpoint. Modifies existing behavior to require authentication token and messageId idempotency. Adds error handling consistency requirements.

## ADDED Requirements

### Requirement: Error Handling Consistency

The system MUST return consistent JSON error responses for all error conditions. Unknown routes MUST return 404. Wrong HTTP methods on known routes MUST return 405. Invalid JSON MUST return 400. These behaviors MUST remain unchanged after T17B modifications.

#### Scenario: Unknown route returns 404

- GIVEN the server is running with T17B changes
- WHEN a GET request is sent to `/unknown/path`
- THEN the response is 404 with `{ error: "not_found" }`

#### Scenario: Wrong method returns 405

- GIVEN the server is running with T17B changes
- WHEN a GET request is sent to `/internal/pipeline/process`
- THEN the response is 405 with `{ error: "method_not_allowed" }`
- AND token validation is NOT performed for 405 responses

#### Scenario: Invalid JSON returns 400

- GIVEN a valid token is provided
- WHEN a POST request is sent to `/internal/pipeline/process` with body `not-json`
- THEN the response is 400 with `{ error: "invalid_json" }`

### Requirement: Error Response Order

The system MUST check conditions in this order: (1) token present, (2) token valid, (3) body readable, (4) JSON valid, (5) payload valid (including messageId), (6) execute pipeline. The first failing check MUST short-circuit and return immediately.

#### Scenario: Token check precedes body parsing

- GIVEN `SERENA_INTERNAL_TOKEN` is set
- WHEN a POST request is sent to `/internal/pipeline/process` with no token and a body that would cause a parse error
- THEN the response is 401 (missing_token), NOT 400
- AND the body is never parsed
