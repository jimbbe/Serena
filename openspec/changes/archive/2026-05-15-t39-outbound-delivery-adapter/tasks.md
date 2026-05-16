# Tasks: T39 — Outbound delivery adapter hacia gateway-wa

## Phase 1: RED tests + config surface

- [x] 1.1 Extend `apps/core/src/config/env.test.ts` with failing cases for `OUTBOUND_DELIVERY_ADAPTER`, `GATEWAY_WA_BASE_URL`, `GATEWAY_WA_APP_KEY`, `GATEWAY_WA_INSTANCE_ID`, and timeout defaults/validation.
- [x] 1.2 Add `apps/core/src/modules/outbound-delivery/adapter/gateway-wa-delivery-port.test.ts` covering request shape, `X-Gateway-App-Key`, `POST /send`, success, `400/404/502`, timeout, invalid JSON, and network errors via injected `fetchFn`.
- [x] 1.3 Add `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.test.ts` covering confirm-flow cases: resolved recipient calls `RequestOutboundDelivery`, unresolved/cancel/risk paths do not.

## Phase 2: Core implementation

- [x] 2.1 Implement `apps/core/src/modules/outbound-delivery/adapter/gateway-wa-delivery-port.ts` with native `fetch`, `AbortController`, sanitized error mapping to `DeliveryResult`.
- [x] 2.2 Implement `apps/core/src/modules/outbound-delivery/adapter/create-delivery-port.ts` and export it from `adapter/index.ts` and `modules/outbound-delivery/index.ts`; default to `FakeDeliveryPort`, select gateway adapter only when env is complete.
- [x] 2.3 Extend `apps/core/src/config/env.ts` (and `.env.example`) with outbound fields + validation, and wire `apps/core/src/server.ts` to build the runtime delivery port while keeping simulation wiring on fake.
- [x] 2.4 Update `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` to accept optional `requestOutboundDelivery` and invoke it only after confirmed draft creation with resolved recipient.
- [x] 2.5 Update `apps/core/src/bootstrap/create-in-memory-pipeline.ts` to construct the selected delivery port, create `RequestOutboundDelivery`, and pass it into `ProcessChannelInboundMessage`; keep returned fake helpers for tests.

## Phase 3: Integration / regression

- [x] 3.1 Update `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` to keep webhook confirmation coverage stable under the new delivery boundary.
- [x] 3.2 Update `apps/core/src/bootstrap/tests/simulation-endpoint.test.ts` if the confirm-result trace changes after delivery request wiring.
- [x] 3.3 Validate with: `npm run -w @serena/core test`, `npm run typecheck`, `npm run check`.
