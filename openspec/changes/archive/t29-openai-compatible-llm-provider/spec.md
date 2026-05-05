# Delta Spec: T29 — OpenAI-Compatible LLM Provider

## Purpose

Specify the new `OpenAICompatibleLlmProvider` capability and modifications to existing capabilities required to support configurable LLM providers (mock + OpenAI-compatible) behind the existing `LlmProvider` port.

---

## New Capability: openai-compatible-provider

### Requirement: OpenAI-Compatible Provider Implements LlmProvider Port

The system SHALL define `OpenAICompatibleLlmProvider` that implements the `LlmProvider` port. The constructor SHALL accept a configuration object `{ baseUrl, apiKey, model, timeoutMs, fetchFn? }` where `fetchFn` is optional for test injection. The provider SHALL call `${baseUrl}/chat/completions` using native `fetch` (or injected `fetchFn`) with an OpenAI-compatible request body.

#### Scenario: Provider constructs correct HTTP request

- GIVEN an OpenAICompatibleLlmProvider configured with `baseUrl: "https://api.example.com/v1"`, `apiKey: "sk-test"`, `model: "gpt-4o-mini"`
- WHEN `invoke()` is called with systemPrompt, userPrompt, and policy
- THEN the HTTP POST request is sent to `https://api.example.com/v1/chat/completions`
- AND the request body contains `model: "gpt-4o-mini"` and `messages` array with role-based entries
- AND the request includes header `Authorization: Bearer sk-test`
- AND the request includes header `Content-Type: application/json`

#### Scenario: System prompt sent as system role message

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called with `systemPrompt: "You are Serena"`
- THEN the messages array contains `{ role: "system", content: "You are Serena" }`

#### Scenario: User prompt sent as user role message

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called with `userPrompt: "hola"`
- THEN the messages array contains `{ role: "user", content: "hola" }`

#### Scenario: Developer prompt sent as developer role message when present

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called with `developerPrompt: "Always respond in JSON"`
- THEN the messages array contains `{ role: "developer", content: "Always respond in JSON" }`

#### Scenario: Developer prompt omitted when not provided

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called WITHOUT a developerPrompt
- THEN the messages array does NOT contain a developer role message

#### Scenario: Policy maxTokens mapped to request

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called with `policy.maxTokens: 256`
- THEN the request body contains `max_tokens: 256`

#### Scenario: Policy temperature mapped to request

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called with `policy.temperature: 0.7`
- THEN the request body contains `temperature: 0.7`

#### Scenario: Response content extracted from OpenAI format

- GIVEN the HTTP response body contains `choices[0].message.content: "Hola, soy Serena"`
- WHEN `invoke()` completes
- THEN the returned content is `"Hola, soy Serena"`

#### Scenario: Response includes tokensUsed from usage.total_tokens

- GIVEN the HTTP response body contains `usage.total_tokens: 42`
- WHEN `invoke()` completes
- THEN the returned `tokensUsed` is `42`

#### Scenario: Response includes modelUsed from response model field

- GIVEN the HTTP response body contains `model: "gpt-4o-mini-2024-07-18"`
- WHEN `invoke()` completes
- THEN the returned `modelUsed` is `"gpt-4o-mini-2024-07-18"`

#### Scenario: Injected fetchFn used instead of global fetch

- GIVEN an OpenAICompatibleLlmProvider constructed with a custom `fetchFn`
- WHEN `invoke()` is called
- THEN the custom `fetchFn` is called, NOT the global `fetch`

### Requirement: Timeout Handling via AbortController

The system SHALL enforce timeout at the HTTP level using `AbortController`. The timeout value SHALL come from the constructor's `timeoutMs` parameter. When the timeout expires, the request SHALL be aborted and `invoke()` SHALL throw an error with a message indicating timeout.

#### Scenario: Request completes within timeout

- GIVEN an OpenAICompatibleLlmProvider with `timeoutMs: 5000`
- AND the HTTP response returns within 2000ms
- WHEN `invoke()` is called
- THEN the request completes successfully and no abort occurs

#### Scenario: Request aborted on timeout

- GIVEN an OpenAICompatibleLlmProvider with `timeoutMs: 100`
- AND the HTTP response takes longer than 100ms
- WHEN `invoke()` is called
- THEN the request is aborted and `invoke()` throws an error containing "timeout" or "aborted"

#### Scenario: AbortController signal passed to fetch

- GIVEN an OpenAICompatibleLlmProvider
- WHEN `invoke()` is called
- THEN the fetch call receives an `AbortSignal` from an `AbortController`

### Requirement: HTTP Error Handling

The system SHALL handle HTTP errors (non-2xx status codes) by throwing a descriptive error. The error message SHALL NOT include the API key. Response bodies SHALL be truncated to 1000 characters maximum. The API key SHALL be scrubbed from any error message that might contain it.

#### Scenario: 4xx HTTP error throws with status code

- GIVEN the HTTP response returns status 401
- WHEN `invoke()` is called
- THEN an error is thrown containing the status code "401"
- AND the error message does NOT contain the API key

#### Scenario: 5xx HTTP error throws with status code

- GIVEN the HTTP response returns status 500
- WHEN `invoke()` is called
- THEN an error is thrown containing the status code "500"
- AND the error message does NOT contain the API key

#### Scenario: Response body truncated in error message

- GIVEN the HTTP response returns status 500 with a 5000-character error body
- WHEN `invoke()` is called
- THEN the error message contains at most 1000 characters of the response body

#### Scenario: API key scrubbed from error messages

- GIVEN an OpenAICompatibleLlmProvider with `apiKey: "sk-secret-key-12345"`
- AND the HTTP response returns status 400 with body containing the API key
- WHEN `invoke()` is called and throws
- THEN the thrown error message does NOT contain "sk-secret-key-12345" or any substring of the API key longer than 4 characters

### Requirement: Missing Content in Response

The system SHALL handle responses where `choices[0].message.content` is missing, null, or empty by throwing a descriptive error.

#### Scenario: Missing content field throws error

- GIVEN the HTTP response contains no `choices` array or `choices[0].message.content` is undefined
- WHEN `invoke()` is called
- THEN an error is thrown indicating missing or empty content in the response

#### Scenario: Empty content string throws error

- GIVEN the HTTP response contains `choices[0].message.content: ""`
- WHEN `invoke()` is called
- THEN an error is thrown indicating empty content in the response

### Requirement: API Key Security

The system SHALL ensure the API key is NEVER exposed in logs, error messages, stack traces, or test output. The API key SHALL only be used as the `Authorization: Bearer` header value. No method SHALL return, log, or serialize the API key.

#### Scenario: API key not in provider toString or inspection

- GIVEN an OpenAICompatibleLlmProvider with `apiKey: "sk-secret"`
- WHEN the provider is inspected or converted to string
- THEN the API key is NOT visible

---

## New Capability: provider-selection-config

### Requirement: AI_PROVIDER Env Var Controls Provider Selection

The system SHALL define `AI_PROVIDER` environment variable with allowed values: `"mock"` and `"openai-compatible"`. The default value SHALL be `"mock"`. Unknown values SHALL cause a clear startup error.

#### Scenario: Default provider is mock

- GIVEN `AI_PROVIDER` is not set
- WHEN `createLlmProvider()` is called
- THEN a `MockLlmProvider` is returned

#### Scenario: AI_PROVIDER=mock returns MockLlmProvider

- GIVEN `AI_PROVIDER` is set to `"mock"`
- WHEN `createLlmProvider()` is called
- THEN a `MockLlmProvider` is returned

#### Scenario: AI_PROVIDER=openai-compatible returns OpenAICompatibleLlmProvider

- GIVEN `AI_PROVIDER` is set to `"openai-compatible"` with valid `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`
- WHEN `createLlmProvider()` is called
- THEN an `OpenAICompatibleLlmProvider` is returned with the configured values

#### Scenario: Unknown AI_PROVIDER value throws

- GIVEN `AI_PROVIDER` is set to `"anthropic"` (or any unrecognized value)
- WHEN `createLlmProvider()` is called
- THEN an error is thrown with a message listing the valid values: "mock", "openai-compatible"

### Requirement: Mock Provider Ignores OpenAI Env Vars

When `AI_PROVIDER=mock` (or default), the system SHALL NOT require `AI_BASE_URL`, `AI_API_KEY`, or `AI_MODEL`. These values SHALL be ignored even if set.

#### Scenario: Mock mode does not require OpenAI env vars

- GIVEN `AI_PROVIDER` is `"mock"` and `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` are all unset
- WHEN `createLlmProvider()` is called
- THEN a `MockLlmProvider` is returned without error

#### Scenario: Mock mode ignores OpenAI env vars when set

- GIVEN `AI_PROVIDER` is `"mock"` and `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` are all set
- WHEN `createLlmProvider()` is called
- THEN a `MockLlmProvider` is returned (OpenAI values are ignored)

### Requirement: OpenAI-Compatible Provider Requires Mandatory Env Vars

When `AI_PROVIDER=openai-compatible`, the system SHALL require `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. Missing any of these SHALL cause a clear startup error naming the missing variable.

#### Scenario: Missing AI_BASE_URL throws

- GIVEN `AI_PROVIDER` is `"openai-compatible"` and `AI_BASE_URL` is unset
- WHEN `createLlmProvider()` is called
- THEN an error is thrown mentioning "AI_BASE_URL" as required

#### Scenario: Missing AI_API_KEY throws

- GIVEN `AI_PROVIDER` is `"openai-compatible"` and `AI_API_KEY` is unset
- WHEN `createLlmProvider()` is called
- THEN an error is thrown mentioning "AI_API_KEY" as required

#### Scenario: Missing AI_MODEL throws

- GIVEN `AI_PROVIDER` is `"openai-compatible"` and `AI_MODEL` is unset
- WHEN `createLlmProvider()` is called
- THEN an error is thrown mentioning "AI_MODEL" as required

#### Scenario: All required vars present succeeds

- GIVEN `AI_PROVIDER` is `"openai-compatible"` with `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` all set
- WHEN `createLlmProvider()` is called
- THEN an `OpenAICompatibleLlmProvider` is returned without error

### Requirement: AI_TIMEOUT_MS Configuration

The system SHALL define `AI_TIMEOUT_MS` environment variable with a default of `30000` (30 seconds). The value MUST be a positive integer. Invalid values SHALL cause a clear startup error.

#### Scenario: Default timeout is 30000ms

- GIVEN `AI_TIMEOUT_MS` is not set
- WHEN the timeout configuration is read
- THEN the value is `30000`

#### Scenario: Custom timeout accepted

- GIVEN `AI_TIMEOUT_MS` is set to `"60000"`
- WHEN the timeout configuration is read
- THEN the value is `60000`

#### Scenario: Non-integer timeout throws

- GIVEN `AI_TIMEOUT_MS` is set to `"30.5"`
- WHEN the timeout configuration is read
- THEN an error is thrown indicating the value must be a positive integer

#### Scenario: Negative timeout throws

- GIVEN `AI_TIMEOUT_MS` is set to `"-1000"`
- WHEN the timeout configuration is read
- THEN an error is thrown indicating the value must be a positive integer

#### Scenario: Zero timeout throws

- GIVEN `AI_TIMEOUT_MS` is set to `"0"`
- WHEN the timeout configuration is read
- THEN an error is thrown indicating the value must be a positive integer

### Requirement: AppEnv Type Expanded with LLM Fields

The `AppEnv` type SHALL include the following LLM-related fields:
- `aiProvider: "mock" | "openai-compatible"` — provider selector
- `aiBaseUrl: string | undefined` — base URL for OpenAI-compatible provider
- `aiApiKey: string | undefined` — API key for OpenAI-compatible provider
- `aiModel: string | undefined` — model identifier for OpenAI-compatible provider
- `aiTimeoutMs: number` — HTTP timeout in milliseconds

#### Scenario: AppEnv includes all LLM fields

- GIVEN `loadAppEnv()` is called with appropriate env vars
- THEN the returned `AppEnv` object contains `aiProvider`, `aiBaseUrl`, `aiApiKey`, `aiModel`, and `aiTimeoutMs`

---

## Modified Capability: ai-guide-pipeline

### Requirement: makeMetadata Uses Dynamic Provider Name

The `makeMetadata()` function in `ExecutionPipeline` SHALL accept a `providerName` parameter instead of hardcoding `"mock"`. The provider name SHALL reflect the actual provider in use (e.g., `"mock"` for MockLlmProvider, `"openai-compatible"` for OpenAICompatibleLlmProvider).

#### Scenario: Success path uses dynamic provider name

- GIVEN an ExecutionPipeline with a provider that reports name `"openai-compatible"`
- WHEN `invoke()` succeeds and `makeMetadata()` is called
- THEN `metadata.provider` is `"openai-compatible"`, NOT `"mock"`

#### Scenario: Failure path uses dynamic provider name

- GIVEN an ExecutionPipeline with a provider that reports name `"openai-compatible"`
- WHEN `invoke()` fails and the error path calls `makeMetadata()`
- THEN `metadata.provider` is `"openai-compatible"`, NOT `"mock"`

#### Scenario: Mock provider still reports "mock"

- GIVEN an ExecutionPipeline with a MockLlmProvider
- WHEN `invoke()` succeeds
- THEN `metadata.provider` is `"mock"`

### Requirement: Failure Paths Use Configured Model Fallback

When the provider does not return `modelUsed` and the pipeline needs a fallback model name, the system SHALL use the provider's configured model name instead of hardcoding `"mock-model-v1"`. The `LlmProvider` port SHALL expose a `name` property for provider identification.

#### Scenario: Provider error uses configured model

- GIVEN an ExecutionPipeline with an OpenAI-compatible provider configured with model `"gpt-4o-mini"`
- WHEN the provider throws and the pipeline builds failure metadata
- THEN `metadata.model` is `"gpt-4o-mini"` (or the provider's modelUsed if available), NOT `"mock-model-v1"`

---

## Modified Capability: ai-guide-bootstrap

### Requirement: createInMemoryPipeline Accepts Optional LlmProvider

The `createInMemoryPipeline()` factory function SHALL accept an optional `llmProvider` parameter. When provided, it SHALL use that provider instead of creating a `MockLlmProvider`. When omitted, it SHALL default to `MockLlmProvider` for backward compatibility.

#### Scenario: Default behavior uses MockLlmProvider

- GIVEN `createInMemoryPipeline()` is called without arguments
- WHEN the returned pipeline's aiGuideService executes
- THEN the MockLlmProvider is used (existing behavior unchanged)

#### Scenario: Custom provider injected

- GIVEN `createInMemoryPipeline()` is called with `{ llmProvider: customProvider }`
- WHEN the returned pipeline's aiGuideService executes
- THEN `customProvider` is used instead of MockLlmProvider

### Requirement: server.ts Creates Provider from Env Config

The `server.ts` entry point SHALL create an LLM provider via `createLlmProvider(appEnv)` using the loaded `AppEnv`. The provider SHALL be passed to `createInMemoryPipeline({ llmProvider })`.

#### Scenario: Server wires provider from environment

- GIVEN `server.ts` starts with `AI_PROVIDER=openai-compatible` and valid config
- WHEN the server initializes
- THEN an `OpenAICompatibleLlmProvider` is created and wired into the pipeline

#### Scenario: Server defaults to mock without env vars

- GIVEN `server.ts` starts with no `AI_PROVIDER` env var
- WHEN the server initializes
- THEN a `MockLlmProvider` is created and wired into the pipeline

---

## Modified Capability: ai-guide-mocks

### Requirement: MockLlmProvider Unchanged as Default

The `MockLlmProvider` SHALL remain fully functional as the default provider. Its behavior, canned responses, and deterministic fallback SHALL NOT change. All existing tests that rely on MockLlmProvider SHALL continue to pass without modification.

#### Scenario: MockLlmProvider default behavior preserved

- GIVEN a test that creates `new MockLlmProvider()` without arguments
- WHEN `invoke()` is called
- THEN the same deterministic response is returned as before T29

#### Scenario: Existing tests pass unchanged

- GIVEN the existing test suite (496+ tests)
- WHEN `npm test` is run
- THEN all existing tests pass without modification

---

## Modified Capability: scenario-simulation

### Requirement: Simulation API Works with Any Provider

The simulation API (`POST /dev/simulate/scenario` and related endpoints) SHALL work identically regardless of which LLM provider is configured. The ExecutionPipeline SHALL validate OutputContract the same way for both mock and openai-compatible providers.

#### Scenario: Simulation works with mock provider

- GIVEN `AI_PROVIDER=mock` (default)
- WHEN a scenario is executed via the simulation API
- THEN all steps execute and return results using MockLlmProvider responses

#### Scenario: Simulation works with openai-compatible provider

- GIVEN `AI_PROVIDER=openai-compatible` with valid configuration
- WHEN a scenario is executed via the simulation API
- THEN all steps execute and return results using OpenAI-compatible API responses

#### Scenario: OutputContract validated regardless of provider

- GIVEN any configured LLM provider
- WHEN the pipeline receives a response that violates the OutputContract
- THEN validation fails with the same error regardless of which provider produced the response
