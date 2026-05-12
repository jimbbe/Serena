# Delta for gateway-wa

## Purpose

This delta confirms that the existing dry-run gateway specification remains unchanged. The infrastructure layer added in this change is purely additive — it does not modify, replace, or interfere with any existing dry-run behavior.

## ADDED Requirements

### Requirement: Dry-Run Mode Preservation

The system MUST preserve all existing dry-run gateway behavior when `GATEWAY_MODE=dry_run`.

| Preserved Behavior | Reference |
|-------------------|-----------|
| `MockWhatsAppEvent` type definition | Existing spec: Mock WhatsApp Event Domain Type |
| `DryRunResult` type definition | Existing spec: DryRunResult Domain Type |
| Event normalization (validate + trim + map) | Existing spec: Event Normalization |
| HTTP client to Serena Core pipeline | Existing spec: HTTP Client to Serena Core |
| `runDryGatewayEvent()` orchestration | Existing spec: Dry-Run Execution |
| PipelineResult-to-GatewayAction mapping | Existing spec: PipelineResult-to-GatewayAction Mapping |
| Domain types copied from core | Existing spec: Domain Types Are Copied From Core |
| All 59 existing dry-run tests | Must continue to pass unchanged |

#### Scenario: Dry-run mode unchanged

- GIVEN `GATEWAY_MODE=dry_run`
- WHEN the application starts
- THEN only the dry-run CLI path is available
- AND no HTTP server is created
- AND all existing dry-run tests pass

#### Scenario: Production mode does not affect dry-run code

- GIVEN `GATEWAY_MODE=production`
- WHEN the application starts
- THEN the HTTP server starts
- AND the dry-run code paths remain importable and functional
- AND dry-run tests continue to pass

### Requirement: Mode Selection via Environment Variable

The system MUST select its operating mode based on the `GATEWAY_MODE` environment variable.

| Value | Behavior |
|-------|----------|
| `dry_run` | Only dry-run CLI path active; no HTTP server |
| `production` | HTTP server active; dry-run code available but not used as entry point |
| Unset | Default to `production` |

#### Scenario: Unset GATEWAY_MODE defaults to production

- GIVEN `GATEWAY_MODE` is not set
- WHEN the application starts
- THEN the HTTP server starts (production mode)

#### Scenario: Explicit dry_run mode disables HTTP

- GIVEN `GATEWAY_MODE=dry_run`
- WHEN the application starts
- THEN no HTTP server is created
- AND the application is available only for dry-run CLI usage
