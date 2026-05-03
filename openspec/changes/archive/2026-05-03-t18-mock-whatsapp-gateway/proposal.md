# Proposal: T18 — Mock WhatsApp Gateway / Dry-Run Adapter

## Intent

Create a self-contained mock WhatsApp Gateway at `apps/gateway-wa/` that simulates how a future real gateway would call Serena Core. This enables end-to-end dry-run testing of the full pipeline (normalize → call core → map result → log action) without connecting to real WhatsApp, Evolution API, or sending real messages.

## Scope

### In Scope
- Workspace setup: `package.json`, `tsconfig.json` for `@serena/gateway-wa`
- Domain types copied from `@serena/core`: `NormalizedWhatsAppInboundMessage`, `WhatsAppGatewayAction`, `PipelineResult`, `PipelineInput`
- Pure mapper function copied: `mapPipelineResultToGatewayAction`
- Mock event normalization: `MockWhatsAppEvent` → `PipelineInput` shape
- HTTP client: `fetch` wrapper calling `POST /internal/pipeline/process` with `X-Serena-Internal-Token`
- Dry-run execution: `runDryGatewayEvent()` ties normalization + HTTP + mapping + logging
- Tests: 10+ scenarios covering normalization, validation, auth, mapping, config errors
- Documentation: `docs/t18-mock-whatsapp-gateway.md`, updates to `README.md` and `project-status.md`

### Out of Scope
- Real WhatsApp/Evolution API integration
- QR scanning, webhooks, WebSocket
- Real message sending (all results include `sent: false`)
- PostgreSQL connection
- Docker/production deployment
- LLM integration
- Web panel

## Capabilities

### New Capabilities
- `mock-whatsapp-gateway`: Self-contained dry-run gateway that normalizes mock events, calls Serena Core via HTTP, maps PipelineResult to GatewayAction, and logs what it would have done. Includes workspace setup, domain types, mapper, HTTP client, and tests.

### Modified Capabilities
- None

## Approach

1. **Self-contained workspace** — Copy types and mapper from `@serena/core` (T17A-frozen contracts) into `apps/gateway-wa/src/domain/` and `src/application/`. No imports from core, no `exports` field changes needed.
2. **HTTP communication** — Gateway calls Serena Core via `fetch` to `POST /internal/pipeline/process`. Tests use a fake/mock HTTP client — no real server required.
3. **Dry-run only** — Every result includes `sent: false`. Gateway logs the action it WOULD have taken.
4. **Validation** — Reject events missing `messageId`, `from`, or `text` before calling core.
5. **Config errors** — Missing `SERENA_CORE_URL` or `SERENA_INTERNAL_TOKEN` returns clear error without attempting HTTP call.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/gateway-wa/package.json` | New | Workspace package `@serena/gateway-wa` with test script |
| `apps/gateway-wa/tsconfig.json` | New | Extends `../../tsconfig.base.json` |
| `apps/gateway-wa/src/domain/` | New | Copied types: normalized-inbound-message, gateway-action, pipeline-result |
| `apps/gateway-wa/src/application/` | New | Copied mapper: map-pipeline-result-to-gateway-action |
| `apps/gateway-wa/src/infrastructure/` | New | HTTP client + mock event source |
| `apps/gateway-wa/src/server.ts` | New | Entry point: dry-run execution |
| `apps/gateway-wa/src/tests/` | New | 10+ test scenarios |
| `apps/gateway-wa/README.md` | Modified | Updated from placeholder |
| `package.json` (root) | Modified | Add `typecheck:gateway-wa` to check script |
| `docs/t18-mock-whatsapp-gateway.md` | New | T18 documentation |
| `docs/project-status.md` | Modified | Add T18 section |
| `README.md` | Modified | Mention gateway-wa workspace |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Type drift between core and gateway-wa copies | Low | T17A froze contracts; add source-version comment on each copied file |
| Scope creep into real integration | Medium | Explicit out-of-scope list; no Evolution API code, no real sending |
| Tests require real Serena Core running | Low | All tests use fake/mock HTTP client; no real server dependency |

## Rollback Plan

Delete the `apps/gateway-wa/` directory entirely and revert changes to root `package.json`, `README.md`, and `docs/project-status.md`. No database migrations, no infrastructure changes, no breaking changes to existing code.

## Dependencies

- Serena Core must expose `POST /internal/pipeline/process` (already implemented in T16/T17B)
- Node.js >= 22.6.0 (workspace requirement)
- No new external libraries — only `fetch` (built-in) and `node:test` (built-in)

## Success Criteria

- [ ] `apps/gateway-wa/` is a valid npm workspace with `package.json` and `tsconfig.json`
- [ ] Domain types and mapper copied from core with source-version comments
- [ ] `runDryGatewayEvent()` normalizes mock event, calls core via HTTP, maps result, returns `DryRunResult` with `sent: false`
- [ ] 10+ tests pass covering all required scenarios (normalization, validation, auth, mapping, config errors)
- [ ] `npm run check` passes (structure + typecheck including gateway-wa)
- [ ] Documentation updated: `docs/t18-mock-whatsapp-gateway.md`, `README.md`, `project-status.md`
