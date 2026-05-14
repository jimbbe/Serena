# Delta for WhatsApp Inbound Webhook

## ADDED Requirements

### Requirement: Post-Refresh Webhook Acceptance Verification

After the VPS core refresh, the T38 runbook MUST verify public `GET /health` and authenticated `POST /internal/webhook/whatsapp` against the updated core runtime. Verification commands MUST avoid printing the internal token.

#### Scenario: Health is verified after refresh

- GIVEN the T38 core-only refresh has completed
- WHEN the operator verifies `GET /health`
- THEN the endpoint returns a successful Serena Core health response

#### Scenario: Authenticated webhook is verified safely

- GIVEN `SERENA_INTERNAL_TOKEN` is available only in the operator shell or VPS env
- WHEN the operator posts a valid WhatsApp webhook payload
- THEN `/internal/webhook/whatsapp` returns a successful authenticated response
- AND the command output does not reveal the token value

#### Scenario: Unauthenticated webhook is not accepted as success

- GIVEN the token is missing from the verification request
- WHEN the operator posts to `/internal/webhook/whatsapp`
- THEN the response is not treated as a passing T38 verification
