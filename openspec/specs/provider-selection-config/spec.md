# Spec: LLM Provider Selection Configuration

## Purpose

Document the LLM provider selection logic and environment variable configuration as it exists post-T29. This is a "current state" spec, not a delta spec.

## Capability

The system SHALL select the active LLM provider based on the `AI_PROVIDER` environment variable, using a factory function `createLlmProvider(env)`. The default provider is `MockLlmProvider`.

### Env Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `mock` | Provider selection: `mock` or `openai-compatible` |
| `AI_BASE_URL` | Only when `AI_PROVIDER=openai-compatible` | — | Base URL for the chat completions API |
| `AI_API_KEY` | Only when `AI_PROVIDER=openai-compatible` | — | API key (never logged) |
| `AI_MODEL` | Only when `AI_PROVIDER=openai-compatible` | — | Model name to use |
| `AI_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |

### Provider Selection

The factory `createLlmProvider(env)` SHALL:

- Return `new MockLlmProvider()` when `env.aiProvider === "mock"`.
- Return `new OpenAICompatibleLlmProvider({ baseUrl, apiKey, model, timeoutMs })` when `env.aiProvider === "openai-compatible"`.
- Throw `Error("Unknown AI provider: ...")` for any other value.

### Env Validation

The `loadAppEnv()` function SHALL validate:

1. `AI_PROVIDER` must be `mock` or `openai-compatible` (case-insensitive). Invalid values SHALL throw with message listing valid providers.
2. `AI_TIMEOUT_MS` must be a positive integer. Zero, negative, or non-numeric values SHALL throw.
3. When `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` SHALL all be non-empty. Missing required vars SHALL throw with message listing which vars are missing.
4. The API key value SHALL NEVER appear in error messages.

### Backward Compatibility

- When no AI env vars are set, the system SHALL default to `mock` provider with `30000ms` timeout.
- `AI_PROVIDER=mock` SHALL ignore any `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` values — they are not required for mock.
- Existing tests that do not set AI env vars SHALL continue to pass unchanged.

## Scenarios

### Scenario: Default provider is mock

- GIVEN no AI_PROVIDER env var is set
- WHEN `loadAppEnv()` is called
- THEN `AppEnv.aiProvider` is `"mock"`

### Scenario: Default timeout is 30000

- GIVEN no AI_TIMEOUT_MS env var is set
- WHEN `loadAppEnv()` is called
- THEN `AppEnv.aiTimeoutMs` is `30000`

### Scenario: AI_PROVIDER=mock accepted

- GIVEN `AI_PROVIDER=mock`
- WHEN `loadAppEnv()` is called
- THEN `AppEnv.aiProvider` is `"mock"` and no OpenAI vars are required

### Scenario: AI_PROVIDER=openai-compatible accepted

- GIVEN `AI_PROVIDER=openai-compatible` with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` all set
- WHEN `loadAppEnv()` is called
- THEN `AppEnv.aiProvider` is `"openai-compatible"` with all OpenAI fields populated

### Scenario: AI_PROVIDER is case-insensitive

- GIVEN `AI_PROVIDER=Mock`
- WHEN `loadAppEnv()` is called
- THEN it is accepted as `"mock"`

### Scenario: Unknown AI_PROVIDER throws

- GIVEN `AI_PROVIDER=unknown`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown listing the valid provider values

### Scenario: AI_TIMEOUT_MS non-integer throws

- GIVEN `AI_TIMEOUT_MS=abc`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown

### Scenario: AI_TIMEOUT_MS zero throws

- GIVEN `AI_TIMEOUT_MS=0`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown

### Scenario: AI_TIMEOUT_MS negative throws

- GIVEN `AI_TIMEOUT_MS=-100`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown

### Scenario: openai-compatible requires AI_BASE_URL

- GIVEN `AI_PROVIDER=openai-compatible` WITHOUT `AI_BASE_URL`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown listing `AI_BASE_URL` as missing

### Scenario: openai-compatible requires AI_API_KEY

- GIVEN `AI_PROVIDER=openai-compatible` WITHOUT `AI_API_KEY`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown listing `AI_API_KEY` as missing

### Scenario: openai-compatible requires AI_MODEL

- GIVEN `AI_PROVIDER=openai-compatible` WITHOUT `AI_MODEL`
- WHEN `loadAppEnv()` is called
- THEN an error is thrown listing `AI_MODEL` as missing

### Scenario: openai-compatible error lists all missing vars

- GIVEN `AI_PROVIDER=openai-compatible` with ALL OpenAI vars missing
- WHEN `loadAppEnv()` is called
- THEN the error message lists `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`

### Scenario: API key never appears in error messages

- GIVEN `AI_API_KEY=sk-secret-12345`
- WHEN an error is thrown during validation
- THEN the error message does NOT contain `sk-secret-12345`

### Scenario: mock provider ignores OpenAI env vars

- GIVEN `AI_PROVIDER=mock` with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` all set
- WHEN `createLlmProvider(env)` is called
- THEN a `MockLlmProvider` is returned (OpenAI vars are ignored)

### Scenario: factory returns OpenAICompatibleLlmProvider

- GIVEN `env.aiProvider === "openai-compatible"` with all required fields populated
- WHEN `createLlmProvider(env)` is called
- THEN an `OpenAICompatibleLlmProvider` is returned with the configured values
