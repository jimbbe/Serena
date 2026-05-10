# Proposal: T35 — Outbound Delivery Port Handoff

## Context

T34 introduced the `OutboundDraft` domain type with a lifecycle that ends in `confirmed_pending_delivery` when a mediation is confirmed and the recipient is resolved. However, T34 does **not** provide any mechanism to actually request delivery of that draft. The draft sits in the store with no way to progress it.

## Problem

There is no clean boundary between the core domain (which decides *what* to send) and the transport layer (which decides *how* to send it). Without a port abstraction:
- The core would need to know about WhatsApp, Evolution API, or specific channels.
- Testing delivery logic would require real external services.
- Future WhatsApp Gateway implementation would have no contract to implement.

## Intent

Introduce a `DeliveryPort` that allows the core to request delivery of a confirmed `OutboundDraft` without knowing anything about the transport mechanism. Provide a `FakeDeliveryPort` for tests and dev simulation.

## Scope

### In scope
- `DeliveryPort` interface (port) with `sendPreparedMessage()` method
- `FakeDeliveryPort` adapter — configurable success/failure, stores requests in memory
- `RequestOutboundDelivery` use case — orchestrates draft validation, status transitions, and port call
- Dev simulation endpoint: `POST /dev/simulate/outbound-delivery`
- Unit tests for port, adapter, and use case
- Integration tests covering the full confirmation → delivery flow
- Acceptance simulation script
- Documentation update

### Out of scope (explicit)
- Real WhatsApp delivery
- Evolution API integration
- PostgreSQL persistence
- Real delivery worker/queue/cron
- Auto-delivery on confirmation (delivery is a **separate action**)
- Italian localization
- Any changes to the T34 track or WSP/PR #43

## Approach

1. New module `outbound-delivery` following hexagonal architecture
2. `DeliveryPort` is a type alias (consistent with existing port convention)
3. `FakeDeliveryPort` implements the port — configurable, no external calls
4. `RequestOutboundDelivery` use case:
   - Finds draft by ID
   - Validates status is `confirmed_pending_delivery`
   - Validates required fields
   - Transitions draft to `delivery_requested`
   - Calls `DeliveryPort.sendPreparedMessage()`
   - Updates draft based on result (`delivered`, `failed`)
   - Catches port exceptions and marks draft as `failed`
5. Wire into `createInMemoryPipeline` and expose via simulation endpoint
6. Simulation endpoint gated by `ENABLE_SIMULATION_ENDPOINTS=true`

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Delivery is a **separate action** from confirmation | Confirming mediation only creates the draft. Delivery requires explicit request. This gives control and enables future async workers. |
| `FakeDeliveryPort` stores requests in memory | Enables tests to verify what would have been sent without real external calls. |
| Port returns `DeliveryResult` with status enum | Allows the use case to handle success, acceptance, and failure uniformly. |
| Exception from port → draft marked `failed` | Defensive: transport failures must not crash the core. |
| No auto-delivery on confirmation | Keeps T34 and T35 concerns separate. Confirmation = prepare. Delivery = send. |

## Risks

- The `OutboundDraftStore.markFailed()` signature takes a `reason` parameter but the in-memory adapter ignores it. This is a pre-existing T34 limitation — T35 will pass the reason but won't fix the storage.
- The simulation endpoint needs access to the same `OutboundDraftStore` instance used by the confirmation flow. This requires wiring the store into the simulation handler.
