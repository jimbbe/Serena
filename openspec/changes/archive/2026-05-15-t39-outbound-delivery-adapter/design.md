# Design: T39 — Outbound delivery adapter hacia gateway-wa

## Technical Approach

Core keeps outbound transport behind `DeliveryPort`. `ProcessChannelInboundMessage` already creates a `confirmed_pending_delivery` `OutboundDraft` after explicit confirmation; T39 adds the final optional step: call `RequestOutboundDelivery`, which marks the draft `delivery_requested` and delegates to the configured port. The new real adapter is HTTP-only toward `gateway-wa` `/send`; Core never imports Evolution API, queues, PostgreSQL, pairing, Caddy, or deploy concerns.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Transport boundary | Add `GatewayWaDeliveryPort implements DeliveryPort` under `outbound-delivery/adapter` | Call gateway from webhook/channel flow directly | Preserves hexagonal boundary and reuses `RequestOutboundDelivery` draft transitions. |
| Runtime selection | `OUTBOUND_DELIVERY_ADAPTER=fake|gateway-wa`, default `fake` | Enable real adapter by presence of URL | Avoids surprise-send and gives one-env rollback. |
| Instance scope | Fixed `GATEWAY_WA_INSTANCE_ID` per Core runtime | Dynamic instance from inbound metadata | Fits T39; multi-tenant/multi-instance routing remains deferred. |
| Failure behavior | Adapter returns `failed` for gateway/network/protocol failures | Throw for all non-2xx responses | Lets `RequestOutboundDelivery` produce stable failed draft state without crashing the pipeline. |

## Data Flow

```text
gateway-wa webhook → /internal/webhook/whatsapp
  → ProcessChannelInboundMessage
    → confirming flow + explicit positive confirmation
    → CreateOutboundDraftFromMediation → confirmed_pending_delivery
    → RequestOutboundDelivery
      → OutboundDraftStore.markDeliveryRequested
      → DeliveryPort.sendPreparedMessage
        ├─ FakeDeliveryPort (default)
        └─ GatewayWaDeliveryPort → POST {GATEWAY_WA_BASE_URL}/send
      → markDelivered | markFailed | keep delivery_requested (accepted)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/core/src/modules/outbound-delivery/adapter/gateway-wa-delivery-port.ts` | Create | HTTP adapter using native `fetch`, `AbortController`, safe error mapping. |
| `apps/core/src/modules/outbound-delivery/adapter/create-delivery-port.ts` | Create | Selects fake vs gateway adapter from `AppEnv`. |
| `apps/core/src/modules/outbound-delivery/adapter/index.ts` | Modify | Export adapter and factory. |
| `apps/core/src/config/env.ts` | Modify | Add outbound env fields and validation. |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modify | Accept optional `deliveryPort`, wire `requestOutboundDelivery` into channel pipeline. |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modify | Optional `requestOutboundDelivery?: RequestOutboundDelivery`; call only after confirmed deliverable draft. |
| `apps/core/src/bootstrap/server.ts` | Modify | Use factory-selected delivery port at runtime; simulations remain fake-safe. |
| `*.test.ts` near changed modules | Modify/Create | Cover env, adapter, wiring, webhook indirect delivery. |

## Interfaces / Contracts

`GatewayWaDeliveryPort` constructor: `{ baseUrl, appKey, instanceId, timeoutMs, fetchFn? }`. It sends `POST /send` body `{ instanceId, to: request.recipientExternalId, text: request.messageText }` with `X-Gateway-App-Key`. Env: `OUTBOUND_DELIVERY_ADAPTER`, `GATEWAY_WA_BASE_URL`, `GATEWAY_WA_APP_KEY`, `GATEWAY_WA_INSTANCE_ID`, `GATEWAY_WA_TIMEOUT_MS` default `30000`.

## Response / Error Mapping

| gateway-wa outcome | `DeliveryResult` | draft effect |
|---|---|---|
| `200` valid JSON `{ messageId, status, timestamp }` | `delivered`, preserve metadata | `delivered` |
| `400 validation_error` | `failed`, `gateway_validation_error` | `failed` |
| `400 instance_not_connected` | `failed`, `gateway_instance_not_connected` | `failed` |
| `404 instance_not_found` | `failed`, `gateway_instance_not_found` | `failed` |
| `502 evolution_unreachable` | `failed`, `gateway_unreachable` | `failed` |
| timeout/abort | `failed`, `gateway_timeout` | `failed` |
| network error | `failed`, `gateway_network_error` | `failed` |
| invalid JSON/unexpected status | `failed`, `gateway_invalid_response` or `gateway_unexpected_status` | `failed` |

Errors MUST be sanitized: no app key, no full sensitive payload, no query-bearing URL.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | env validation and adapter selection | `node:test` against `loadAppEnv`/factory; fake remains default. |
| Unit | request shape, headers, mappings, timeout | fake `fetchFn`, `AbortController`, table-driven gateway outcomes. |
| Application | confirmation calls `RequestOutboundDelivery` only for deliverable drafts | fake use case/port; assert cancel/edit/risk/ambiguous paths do not call delivery. |
| Integration | `/internal/webhook/whatsapp` indirect delivery | HTTP tests with in-memory pipeline; no Evolution imports or real network. |

## Migration / Rollout

No migration required. No deploy, DNS, Caddy, pairing, secrets, PostgreSQL, queues, workers, or Evolution direct calls in this task. Rollback is setting/removing `OUTBOUND_DELIVERY_ADAPTER` so `FakeDeliveryPort` is used.

## Open Questions

- [ ] Multi-instance / tenant-specific instance selection.
- [ ] Retries, backoff, circuit breaker, or queue-based delivery.
- [ ] Durable draft/idempotency persistence.
- [ ] WhatsApp final ack semantics beyond gateway `sent` response.
