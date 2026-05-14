# Delta for Internal Auth

## ADDED Requirements

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
