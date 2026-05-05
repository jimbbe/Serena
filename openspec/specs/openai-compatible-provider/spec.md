# Spec: OpenAI-Compatible LLM Provider

## Purpose

Document the `OpenAICompatibleLlmProvider` as it exists post-T29. This is a "current state" spec, not a delta spec.

## Capability

The system SHALL provide `OpenAICompatibleLlmProvider` that implements the `LlmProvider` port. The provider SHALL communicate with any OpenAI-compatible chat completions API via `POST /chat/completions` using native `fetch` (zero npm dependencies).

### Constructor Configuration

The provider constructor SHALL accept `{ baseUrl, apiKey, model, timeoutMs, fetchFn? }`. The `fetchFn` parameter is optional (for test injection) and SHALL default to `globalThis.fetch`.

- **baseUrl**: URL base of the API (trailing slash stripped internally).
- **apiKey**: API key sent as `Authorization: Bearer {apiKey}` header. Must NEVER appear in error messages or logs.
- **model**: Model name used in the request body.
- **timeoutMs**: Request timeout in milliseconds, applied via `AbortSignal.timeout()`.
- **fetchFn**: Optional custom fetch implementation for testing.

### Message Order

When `invoke()` is called, the provider SHALL construct a messages array in this order:

1. System prompt (always present if non-empty) — `{ role: "system", content }`
2. Developer prompt (if present) — `{ role: "system", content: "Developer instructions:\n{content}" }`
3. User prompt (always last) — `{ role: "user", content }`

The developer prompt uses the `system` role for maximum API compatibility (OpenAI supports a `developer` role but not all compatible APIs do).

### Request Body

The request body SHALL include:

| Field | Source |
|-------|--------|
| `model` | Config `model` |
| `messages` | Constructed from prompts as above |
| `max_tokens` | From `ExecutionPolicy.maxTokens` (if > 0) |
| `temperature` | From `ExecutionPolicy.temperature` (if defined) |

### Response Parsing

The provider SHALL extract:

- `content` from `choices[0].message.content` (required, must be non-empty string)
- `tokensUsed` from `usage.total_tokens` (optional)
- `modelUsed` from `response.model` (falls back to config `model` if absent)

### Error Handling

- Network errors: SHALL be caught and re-thrown with message sanitized via `sanitizeMessage()`.
- Timeout: SHALL catch `AbortError` and throw descriptive error including configured timeout.
- Non-2xx responses: SHALL read response body, sanitize, truncate to 1000 chars, and include in error.
- Non-JSON responses: SHALL throw with clear message.
- Missing required response fields (`choices`, `message`, `content`): SHALL throw with specific message.

### API Key Security

The provider SHALL NEVER expose the API key in error messages or logs. A `sanitizeMessage()` method SHALL replace any occurrence of the literal API key in error texts with `[REDACTED]`.

## Scenarios

### Scenario: Constructs request to correct endpoint

- GIVEN an `OpenAICompatibleLlmProvider` with `baseUrl: "https://api.example.com/v1"`
- WHEN `invoke()` is called
- THEN a POST is made to `https://api.example.com/v1/chat/completions`

### Scenario: Includes Authorization header

- GIVEN an `OpenAICompatibleLlmProvider` with `apiKey: "sk-test"`
- WHEN `invoke()` is called
- THEN the request includes header `Authorization: Bearer sk-test`

### Scenario: Sends system, developer, and user prompts in correct order

- GIVEN provider with systemPrompt, developerPrompt, and userPrompt
- WHEN `invoke()` is called
- THEN messages array contains system → developer (as system+prefix) → user in order

### Scenario: Developer prompt uses system role for compatibility

- GIVEN a developer prompt is provided
- WHEN the messages array is constructed
- THEN the developer content appears as `{ role: "system", content: "Developer instructions:\n..." }`

### Scenario: No developer prompt when not provided

- GIVEN `invoke()` is called WITHOUT a `developerPrompt`
- THEN the messages array does NOT contain a developer-prefixed message

### Scenario: Maps maxTokens and temperature from policy

- GIVEN `ExecutionPolicy` with `maxTokens: 500` and `temperature: 0.7`
- WHEN `invoke()` is called
- THEN the request body includes `max_tokens: 500` and `temperature: 0.7`

### Scenario: Returns content, tokensUsed, and modelUsed

- GIVEN a valid API response with choices, usage, and model fields
- WHEN `invoke()` completes
- THEN result contains `content`, `tokensUsed`, and `modelUsed`

### Scenario: Falls back to config model when response model is absent

- GIVEN a valid API response WITHOUT a `model` field
- WHEN `invoke()` completes
- THEN `modelUsed` equals the configured model name

### Scenario: HTTP error does not expose API key

- GIVEN the API returns 401 with body containing the API key
- WHEN the error is thrown
- THEN the error message does NOT contain the API key

### Scenario: Request times out via AbortSignal

- GIVEN provider with `timeoutMs: 100` and a fake fetch that never resolves
- WHEN `invoke()` is called
- THEN an error is thrown indicating the request timed out

### Scenario: Response without valid content throws

- GIVEN API response with empty `choices[0].message.content`
- WHEN `invoke()` processes the response
- THEN an error is thrown indicating missing content

### Scenario: Invalid JSON response throws

- GIVEN API returns a non-JSON body
- WHEN `invoke()` processes the response
- THEN an error is thrown indicating the response was not valid JSON

### Scenario: Strips trailing slash from baseUrl

- GIVEN `baseUrl: "https://api.example.com/v1/"`
- WHEN the URL is constructed
- THEN the final URL is `https://api.example.com/v1/chat/completions` (no double slash)
