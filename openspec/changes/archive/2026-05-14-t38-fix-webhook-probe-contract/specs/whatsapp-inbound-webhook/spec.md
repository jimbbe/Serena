# Delta for WhatsApp Inbound Webhook

## MODIFIED Requirements

### Requirement: Post-Refresh Webhook Acceptance Verification

After the VPS core refresh, the T38 runbook MUST verify public `GET /health` and authenticated `POST /internal/webhook/whatsapp` against the updated core runtime. The authenticated webhook probe JSON body MUST use the Core webhook contract fields: `senderWhatsAppId`, `text`, `receivedAt`, `instanceId`, `messageId`, and MAY include `provider`. The probe body MUST NOT use legacy gateway-normalized field names `from` or `timestamp`. Successful authenticated verification MUST expect a JSON response including `received: true` and `routedTo: "serena-core"`. Verification commands MUST avoid printing the internal token, and `npm run validate:t38` MUST fail if the T38 runbook drifts from this exact probe contract.

(Previously: The runbook only had to verify an authenticated webhook safely; it did not explicitly lock the probe body fields, success response wording, or validation drift checks.)

#### Scenario: Health is verified after refresh

- GIVEN the T38 core-only refresh has completed
- WHEN the operator verifies `GET /health`
- THEN the endpoint returns a successful Serena Core health response

#### Scenario: Authenticated webhook uses Core contract and succeeds safely

- GIVEN `SERENA_INTERNAL_TOKEN` is available only in the operator shell or VPS env
- WHEN the operator posts a webhook payload with `senderWhatsAppId`, `text`, `receivedAt`, `instanceId`, `messageId`, and optional `provider`
- THEN `/internal/webhook/whatsapp` returns a successful authenticated response including `received: true` and `routedTo: "serena-core"`
- AND the command output does not reveal the token value

#### Scenario: Legacy probe fields are forbidden

- GIVEN the T38 runbook documents the authenticated webhook probe body
- WHEN `npm run validate:t38` checks the runbook
- THEN validation fails if that probe body uses `from` or `timestamp`

#### Scenario: Success wording is pinned to Core response

- GIVEN the T38 runbook documents the expected authenticated webhook result
- WHEN `npm run validate:t38` checks the runbook
- THEN validation fails unless the expected success markers include `received: true` and `routedTo: "serena-core"`
- AND validation fails if the runbook expects `routedTo: "channel-inbound"`

#### Scenario: Unauthenticated webhook is not accepted as success

- GIVEN the token is missing from the verification request
- WHEN the operator posts to `/internal/webhook/whatsapp`
- THEN the response is not treated as a passing T38 verification
