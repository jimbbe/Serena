# Proposal: WhatsApp Gateway Phase 3 — Real Evolution API Integration

## Intent

Evolve `apps/gateway-wa/` from mock to production WhatsApp Gateway via Evolution API. Dry-run mode preserved.

## Scope

### In Scope
- `infrastructure/` layer: HTTP server, routing, middleware
- Evolution API client: instances CRUD, QR, send text
- Webhook receiver: normalization + self-message filtering
- 3-tier API key auth
- Instance management + message sending endpoints
- Health check, hardcoded routing, integration tests

### Out of Scope
- Docker deployment (Phase 2), QR image generation, media messages
- HMAC validation, configurable routing, retry backoff

## Capabilities

### New Capabilities
- `gateway-http-server`: Server with routing and middleware
- `gateway-evolution-client`: Evolution API client
- `gateway-webhook-receiver`: Normalization, self-message filtering
- `gateway-auth-middleware`: 3-tier API key auth
- `gateway-instance-management`: Instance CRUD
- `gateway-message-sending`: Send text messages

### Modified Capabilities
- `gateway-wa`: Dry-run spec unchanged; infra is additive.

## Approach

1. Add `src/infrastructure/` — no dry-run changes
2. `node:http` server, zero npm deps
3. Evolution client via fetch
4. **QR format**: Evolution returns pairing code, not base64. Return as-is
5. Webhook: filter `fromMe:true`, discard non-text
6. Hardcoded routing to Serena Core
7. 3 API keys from env vars
8. `node:test` integration tests

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/gateway-wa/src/infrastructure/` | New | Server, router, middleware, client, webhook |
| `apps/gateway-wa/src/index.ts` | New | Server entry point |
| `apps/gateway-wa/package.json` | Modified | Add `start` script |
| `apps/gateway-wa/src/tests/` | Modified | Integration tests |
| `docs/architecture/wsp-gateway-api-contract.md` | Modified | QR: code string not base64 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| QR format mismatch | High | Return code as-is; update contract |
| Self-message loops | High | Filter `fromMe:true` at entry |
| Auth key exposure | Medium | Env var only; never logged |
| Docker network bridging | Medium | Phase 2 |
| Breaking dry-run tests | Low | Additive only |

## Rollback Plan

1. Revert commit — `infrastructure/` is additive
2. `GATEWAY_MODE=dry_run` disables HTTP server
3. Delete instances via endpoint or panel

## Dependencies

- Phase 1 (specs): ✅ Complete
- Phase 2 (deploy): NOT required for build
- Evolution API running (`EVOLUTION_API_URL` + `EVOLUTION_API_KEY`)
- Serena Core with `/internal/webhook/whatsapp`

## Success Criteria

- [ ] `GET /health` returns 200
- [ ] `POST /instances` creates instance, returns QR
- [ ] `GET /instances/:name/qr` returns code or "connected"
- [ ] `POST /send` sends text
- [ ] `POST /webhook/evolution` normalizes and routes
- [ ] Self-messages discarded
- [ ] Auth rejects unauthorized (401/403)
- [ ] All 59 dry-run tests pass
- [ ] Integration tests cover endpoints
- [ ] `npm run check` passes
