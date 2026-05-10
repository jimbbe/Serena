# Tasks: T35 — Outbound Delivery Port Handoff

## Module: outbound-delivery

- [x] T35.01 Create domain types: `PreparedDeliveryRequest` and `DeliveryResult`
- [x] T35.02 Create `DeliveryPort` type alias (port)
- [x] T35.03 Create `FakeDeliveryPort` adapter with configurable success/failure
- [x] T35.04 Create `RequestOutboundDelivery` use case
- [x] T35.05 Create module barrel exports (`index.ts` files)

## Tests

- [x] T35.06 Unit tests for `FakeDeliveryPort` (success, failure, stores requests)
- [x] T35.07 Unit tests for `RequestOutboundDelivery` (all 9 scenarios from spec DR5)

## Wiring

- [x] T35.08 Wire `FakeDeliveryPort` and `RequestOutboundDelivery` into `create-in-memory-pipeline.ts`
- [x] T35.09 Extend simulation handler for `POST /dev/simulate/outbound-delivery`
- [x] T35.10 Update `server.ts` to pass delivery dependencies to simulation handler

## Documentation

- [x] T35.11 Update `docs/simulation-api.md` with outbound delivery section
- [x] T35.12 Create acceptance simulation script `scripts/simulations/run-t35-delivery-port-acceptance.ts`

## Validation

- [x] T35.13 `npm run check` passes (core typecheck clean)
- [x] T35.14 `npm test` passes (794/794)

## Design Fixes

- [x] T35.15 Refactor `RequestOutboundDelivery.execute()` to use constructor dependencies only
- [x] T35.16 Remove `as unknown as` casts from `simulation-handler.ts`
- [x] T35.17 Create `verify-report.md`
