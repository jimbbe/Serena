# Design: Gateway WA Unknown-Instance Hardening

## Technical Approach

Make the smallest safe change in `apps/gateway-wa/src/infrastructure/webhook/receiver.ts`: after parsing the body and after preserving the existing `connection.update` branch, extract `instance` before message-specific `data` access. In routing-table mode, reject unknown/unconfigured instances immediately with the existing safe `routing_not_configured` response. If `instance` is missing or not a non-empty string, return `400 { "error": "invalid_webhook_payload" }`. Known routes keep the current `data -> dedup -> filter -> normalize -> route` behavior.

## Architecture Decisions

### Decision: Route before message-shape processing only in routing-table mode

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Validate full message schema first | Broader hardening, more behavior risk | Rejected |
| Extract only `instance`, then route-check unknown instances | Narrow fix, preserves known-route behavior | Chosen |

**Rationale**: The failure occurs because unknown instances can reach `shouldDiscard()` / normalization before route rejection. Early instance extraction avoids touching payload-dependent fields for requests that will be ignored anyway.

### Decision: Missing or invalid `instance` is malformed input

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Treat missing instance as `unknown` | Hides malformed webhooks and may blur routing logs | Rejected |
| Return `400 invalid_webhook_payload` | Clear client error and matches proposal | Chosen |

**Rationale**: Unknown configured value and absent routing key are different cases. Fail closed for unknown instances; reject payloads that cannot be routed at all.

### Decision: Preserve legacy fallback ordering

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Apply early route logic without routing table | Could change single-target fallback behavior | Rejected |
| Only early-short-circuit when `routingTable` exists | Minimal compatibility risk | Chosen |

**Rationale**: Legacy `SERENA_CORE_URL` forwarding has no per-instance route table, so message validation/filtering should remain as-is.

## Data Flow

```text
POST /webhook/evolution
  -> body object?
  -> connection.update? -> handleConnectionUpdate()
  -> extract non-empty instance
  -> routingTable present and no route? -> 200 routing_not_configured
  -> validate data object
  -> dedup -> filter -> normalize -> fetch consumer/core
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` | Modify | Add early `instance` guard and route lookup before `data`, dedup, filter, normalize. Reuse later `route` for forwarding. |
| `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` | Modify | Add unit regressions for unknown instance with incomplete `data`, missing/blank/non-string `instance`, and known route behavior unchanged. |
| `apps/gateway-wa/src/tests/integration.test.ts` | Modify | Add HTTP regression in routing-table mode for malformed unknown-instance webhook returning non-500 safe ignore. |
| `openspec/specs/gateway-webhook-receiver/spec.md` | Modify | Sync requirement/scenarios for unknown-instance fail-closed and missing-instance malformed behavior. |

## Interfaces / Contracts

No new public types or dependencies. Response contracts:

```ts
// unknown instance in routing-table mode
{ ignored: true, reason: "routing_not_configured", instanceId: string }

// missing/invalid instance on message webhook
{ error: "invalid_webhook_payload" }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Unknown instance with incomplete/malformed message shape does not call `shouldDiscard`/normalize path and returns safe ignore | Extend `receiver.test.ts` with routing table fixture |
| Unit | Missing, blank, or non-string `instance` returns `400 invalid_webhook_payload` | Direct `handleWebhook()` tests |
| Unit | Valid known routed text still forwards normalized body | Keep existing route test and ensure `route` reuse |
| Integration | `POST /webhook/evolution` in routing-table mode returns non-500 for unknown instance with incomplete payload | Start test server with `loadRoutingTable()` and pass it to `handleWebhook()` |
| E2E | Not applicable | No real Evolution/WhatsApp/VPS mutation |

## Migration / Rollout

No migration required. Rollout is code-only; no env, routing table, Docker, DNS, Caddy, or VPS changes.

## Non-Goals

- Durable routing or instance persistence.
- Full Evolution webhook schema validation for configured instances.
- HMAC/auth changes, WhatsApp pairing, real sends, or infrastructure deployment.

## Open Questions

- None blocking.
