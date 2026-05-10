# Design: T35 — Outbound Delivery Port Handoff

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Core (Domain)                          │
│                                                             │
│  OutboundDraft ──→ RequestOutboundDelivery ──→ DeliveryPort │
│  (T34)              (T35 use case)            (T35 port)    │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
    FakeDeliveryPort          (Future: WhatsAppDeliveryPort)
    (T35 adapter)             (T35+ adapter, out of scope)
              │
    stores requests in memory
    returns fake results
```

## Key Decisions

### 1. Port as Type Alias (Not Interface)

Consistent with existing Serena convention (`MediationFlowStore`, `OutboundDraftStore`, `ConversationStore`), `DeliveryPort` is a type alias:

```typescript
export type DeliveryPort = {
  sendPreparedMessage(request: PreparedDeliveryRequest): Promise<DeliveryResult>;
};
```

### 2. Error Handling Strategy

The use case uses a **controlled error** pattern — throwing plain `Error` with descriptive messages for expected failures (wrong status, missing fields, not found). This matches the existing pattern in `CreateOutboundDraftFromMediation`.

For port exceptions, the use case catches and converts to a failed result — the core never crashes due to transport failures.

### 3. Status Transition Sequence

```
confirmed_pending_delivery
  → delivery_requested (before port call)
    → delivered (if port returns "delivered")
    → delivery_requested (if port returns "accepted" — stays as is)
    → failed (if port returns "failed" or throws)
```

The draft is marked `delivery_requested` BEFORE calling the port. This ensures the draft is never in an ambiguous state if the port call takes time or fails mid-flight.

### 4. Simulation Endpoint Placement

The delivery simulation endpoint is added to the existing `simulation-handler.ts` by extending it to handle both `/dev/simulate/inbound-message` and `/dev/simulate/outbound-delivery`. This keeps the simulation concern in one place.

Alternative considered: separate handler file. Rejected because:
- Both endpoints share the same gating (`ENABLE_SIMULATION_ENDPOINTS`)
- Both are dev-only
- The routing in `server.ts` already dispatches by pathname

### 5. FakeDeliveryPort Configurable Mode

`FakeDeliveryPort` accepts options at construction time:

```typescript
export class FakeDeliveryPort implements DeliveryPort {
  private readonly mode: "success" | "failure";
  private readonly failureReason: string;
  private readonly sentRequests: PreparedDeliveryRequest[] = [];

  constructor(options?: FakeDeliveryPortOptions) {
    this.mode = options?.mode ?? "success";
    this.failureReason = options?.failureReason ?? "simulated_failure";
  }
  // ...
}
```

This allows tests to verify both success and failure paths without needing different implementations.

## File Structure

```
apps/core/src/modules/outbound-delivery/
├── domain/
│   ├── prepared-delivery-request.ts   # PreparedDeliveryRequest type
│   ├── delivery-result.ts             # DeliveryResult type
│   └── index.ts                       # Re-exports both types
├── port/
│   ├── delivery-port.ts               # DeliveryPort type alias
│   └── index.ts                       # Re-exports DeliveryPort
├── adapter/
│   ├── fake-delivery-port.ts          # FakeDeliveryPort class
│   └── index.ts                       # Re-exports FakeDeliveryPort
├── application/
│   ├── use-cases/
│   │   ├── request-outbound-delivery.ts  # RequestOutboundDelivery class
│   │   └── index.ts                      # Re-exports use case
│   └── index.ts                          # Re-exports application layer
├── __tests__/
│   ├── fake-delivery-port.test.ts       # Tests for FakeDeliveryPort
│   └── request-outbound-delivery.test.ts # Tests for RequestOutboundDelivery
└── index.ts                             # Barrel: exports all public API
```

## Wiring Changes

### create-in-memory-pipeline.ts

Add:
```typescript
import { FakeDeliveryPort, RequestOutboundDelivery } from "../modules/outbound-delivery/index.ts";

// Inside the factory:
const deliveryPort = new FakeDeliveryPort();
const requestOutboundDelivery = new RequestOutboundDelivery({
  outboundDraftStore,
  deliveryPort,
});

// Return extended object:
return {
  // ... existing fields
  outboundDraftStore,
  deliveryPort,
  requestOutboundDelivery,
};
```

### server.ts

The simulation handler needs access to `outboundDraftStore` and `requestOutboundDelivery`. The `createSimulationHandler` factory will be extended to accept these dependencies.

### simulation-handler.ts

Extended to handle two routes:
- `/dev/simulate/inbound-message` — existing behavior
- `/dev/simulate/outbound-delivery` — new delivery endpoint

## Test Strategy

### Unit Tests (outbound-delivery/__tests__)

1. **fake-delivery-port.test.ts**:
   - Success mode returns delivered with fake providerMessageId
   - Failure mode returns failed with configured reason
   - Stores all requests in memory
   - getSentRequests returns correct data

2. **request-outbound-delivery.test.ts**:
   - 9 test cases covering all scenarios in DR5

### Integration Tests

Covered by the acceptance simulation script and existing T34 integration tests extended to include delivery.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `OutboundDraftStore.markFailed()` ignores reason | Pass reason anyway; future persistent adapter will use it |
| Simulation handler grows complex | Keep it simple — just call use case and return JSON |
| Tight coupling between simulation and core | Simulation only depends on use case, not on port implementation |
