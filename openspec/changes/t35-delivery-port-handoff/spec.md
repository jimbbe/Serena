# Spec: T35 — Outbound Delivery Port Handoff

## Purpose

T34 creates `OutboundDraft` with status `confirmed_pending_delivery` when a mediation is confirmed and the recipient is resolved. T35 adds the ability to **request delivery** of that draft through a clean port boundary, without coupling the core to any specific transport (WhatsApp, Evolution API, etc.).

This spec adds a new capability (`outbound-delivery`) and modifies `channel-inbound-pipeline` simulation wiring.

---

## Delta Requirements

### DR1 — PreparedDeliveryRequest Type (MUST)

The system MUST define a `PreparedDeliveryRequest` type representing the data needed to deliver a confirmed outbound draft.

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `outboundDraftId` | `string` | The draft being delivered |
| `tenantId` | `string` | Tenant identifier |
| `conversationId` | `string` | Conversation where the draft was confirmed |
| `requesterPersonId` | `string` | Person who requested the mediation |
| `recipientPersonId` | `string \| null` | Resolved recipient personId |
| `recipientDisplayName` | `string \| null` | Resolved recipient display name |
| `recipientChannel` | `InboundChannel \| null` | Channel for delivery |
| `recipientExternalId` | `string \| null` | External ID for delivery |
| `messageText` | `string` | The message to deliver |
| `requestedAt` | `Date` | When delivery was requested |

#### Scenario: request built from confirmed draft

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` and resolved recipient
- WHEN a `PreparedDeliveryRequest` is built from it
- THEN all fields are populated from the draft
- AND `requestedAt` is the current time

### DR2 — DeliveryResult Type (MUST)

The system MUST define a `DeliveryResult` type representing the outcome of a delivery attempt.

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"accepted" \| "delivered" \| "failed"` | Delivery outcome |
| `providerMessageId` | `string \| undefined` | External provider's message ID (when applicable) |
| `failureReason` | `string \| undefined` | Reason for failure (when status is `failed`) |
| `deliveredAt` | `Date \| undefined` | When delivery completed |
| `raw` | `Record<string, unknown> \| undefined` | Raw response from provider |

**Status semantics**:
- `"delivered"` — message was successfully delivered to the recipient
- `"accepted"` — message was accepted by the provider but not yet confirmed delivered
- `"failed"` — delivery attempt failed

#### Scenario: successful delivery result

- GIVEN a `FakeDeliveryPort` configured for success
- WHEN `sendPreparedMessage()` is called
- THEN the result has `status: "delivered"` and a fake `providerMessageId`

#### Scenario: failed delivery result

- GIVEN a `FakeDeliveryPort` configured for failure
- WHEN `sendPreparedMessage()` is called
- THEN the result has `status: "failed"` and a `failureReason`

### DR3 — DeliveryPort Interface (MUST)

The system MUST define a `DeliveryPort` type alias (port convention) with the following operation:

```typescript
type DeliveryPort = {
  sendPreparedMessage(request: PreparedDeliveryRequest): Promise<DeliveryResult>;
};
```

**Contract**:
- The port MUST NOT throw for expected failures — it returns a `DeliveryResult` with `status: "failed"`.
- Unexpected errors (network, crash) MAY throw — the use case must handle this.
- The port MUST NOT know about `OutboundDraft` — it only receives `PreparedDeliveryRequest`.
- The port MUST NOT have side effects beyond the delivery attempt.

#### Scenario: port accepts valid request

- GIVEN a `DeliveryPort` implementation
- WHEN `sendPreparedMessage()` is called with a valid `PreparedDeliveryRequest`
- THEN it returns a `DeliveryResult` (never throws for expected conditions)

### DR4 — FakeDeliveryPort Adapter (MUST)

The system MUST provide a `FakeDeliveryPort` class that implements `DeliveryPort` for testing and development.

**Behavior**:
- Configurable via constructor options for success/failure mode
- Stores all requests in memory for test verification
- Returns fake `providerMessageId` (e.g., `fake_msg_<uuid>`) on success
- Returns `failureReason` on failure
- Makes NO external calls

**Constructor options**:
```typescript
type FakeDeliveryPortOptions = {
  mode?: "success" | "failure";
  failureReason?: string;
};
```

**Default**: `mode: "success"`.

#### Scenario: fake port in success mode

- GIVEN a `FakeDeliveryPort` with default options
- WHEN `sendPreparedMessage()` is called
- THEN it stores the request in memory
- AND returns `{ status: "delivered", providerMessageId: "fake_..." }`

#### Scenario: fake port in failure mode

- GIVEN a `FakeDeliveryPort({ mode: "failure", failureReason: "test_failure" })`
- WHEN `sendPreparedMessage()` is called
- THEN it stores the request in memory
- AND returns `{ status: "failed", failureReason: "test_failure" }`

#### Scenario: fake port stores requests

- GIVEN a `FakeDeliveryPort`
- WHEN `sendPreparedMessage()` is called twice
- THEN `getSentRequests()` returns both requests
- AND the `messageText` and `recipientExternalId` are correct in each

### DR5 — RequestOutboundDelivery Use Case (MUST)

The system MUST provide a `RequestOutboundDelivery` use case that orchestrates the delivery of a confirmed `OutboundDraft`.

**Input**:
```typescript
type RequestOutboundDeliveryInput = {
  outboundDraftId: string;
  outboundDraftStore: OutboundDraftStore;
  deliveryPort: DeliveryPort;
};
```

**Behavior**:

1. Find `OutboundDraft` by `outboundDraftId`.
   - If not found, throw a controlled domain error.

2. Validate draft status is `confirmed_pending_delivery`.
   - If status is any of: `needs_recipient_resolution`, `needs_recipient_disambiguation`, `cancelled`, `delivery_requested`, `delivered`, `failed` → throw controlled error with reason.

3. Validate required delivery fields:
   - `recipientChannel` is not null
   - `recipientExternalId` is not null
   - `messageText` is not empty (trimmed)
   - `requesterPersonId` is not empty
   - `tenantId` is not empty
   - `conversationId` is not empty
   - If any validation fails → throw controlled error.

4. Mark draft as `delivery_requested` via `outboundDraftStore.markDeliveryRequested(id, now)`.

5. Build `PreparedDeliveryRequest` from the draft.

6. Call `deliveryPort.sendPreparedMessage(request)`.

7. Based on `DeliveryResult.status`:
   - `"delivered"` → `outboundDraftStore.markDelivered(id, now)`
   - `"accepted"` → keep as `delivery_requested` (already set in step 4)
   - `"failed"` → `outboundDraftStore.markFailed(id, failureReason, now)`

8. Return `{ delivery: DeliveryResult, outboundDraft: OutboundDraft }`.

**Exception handling**:
- If `deliveryPort.sendPreparedMessage()` throws:
  - Catch the error
  - Mark draft as `failed` with reason from error message
  - Return `{ delivery: { status: "failed", failureReason: error.message }, outboundDraft: failedDraft }`
  - Do NOT re-throw.

#### Scenario: confirmed draft with resolved recipient → delivered

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` and resolved recipient
- AND a `FakeDeliveryPort` in success mode
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the draft is marked `delivery_requested` first
- AND the port is called with correct `PreparedDeliveryRequest`
- AND the draft is then marked `delivered`
- AND the result contains `{ delivery: { status: "delivered" }, outboundDraft: { status: "delivered" } }`

#### Scenario: draft needs_recipient_resolution → rejected

- GIVEN an `OutboundDraft` with status `needs_recipient_resolution`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown with reason indicating status is not ready

#### Scenario: draft needs_recipient_disambiguation → rejected

- GIVEN an `OutboundDraft` with status `needs_recipient_disambiguation`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown

#### Scenario: draft cancelled → rejected

- GIVEN an `OutboundDraft` with status `cancelled`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown

#### Scenario: draft already delivered → rejected (no double delivery)

- GIVEN an `OutboundDraft` with status `delivered`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown

#### Scenario: draft delivery_requested → rejected (no duplicate request)

- GIVEN an `OutboundDraft` with status `delivery_requested`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown

#### Scenario: draft failed → rejected

- GIVEN an `OutboundDraft` with status `failed`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled error is thrown

#### Scenario: missing recipientExternalId → validation error

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` but `recipientExternalId: null`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled validation error is thrown

#### Scenario: missing recipientChannel → validation error

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` but `recipientChannel: null`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled validation error is thrown

#### Scenario: empty messageText → validation error

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` but `messageText: ""`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the delivery port is NOT called
- AND a controlled validation error is thrown

#### Scenario: DeliveryPort returns failed → draft marked failed

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery`
- AND a `FakeDeliveryPort` in failure mode with `failureReason: "test_failure"`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the draft is marked `delivery_requested` first
- AND the port is called
- AND the draft is then marked `failed` with `failureReason: "test_failure"`
- AND the result contains `{ delivery: { status: "failed", failureReason: "test_failure" } }`

#### Scenario: DeliveryPort throws → draft marked failed, no crash

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery`
- AND a delivery port that throws `new Error("network crash")`
- WHEN `RequestOutboundDelivery.execute()` is called
- THEN the draft is marked `delivery_requested` first
- AND the port throws
- AND the error is caught
- AND the draft is marked `failed` with reason containing "network crash"
- AND the use case returns a failed result (does NOT throw)

#### Scenario: draft not found → error

- GIVEN no draft with id "od_nonexistent"
- WHEN `RequestOutboundDelivery.execute({ outboundDraftId: "od_nonexistent", ... })` is called
- THEN a controlled error is thrown

### DR6 — Bootstrap Wiring (MUST)

The `createInMemoryPipeline` factory MUST wire the new delivery dependencies:

1. Create `FakeDeliveryPort` (default success mode)
2. Create `RequestOutboundDelivery` with `OutboundDraftStore` and `FakeDeliveryPort`
3. Return `requestOutboundDelivery` and `deliveryPort` in the pipeline result

#### Scenario: pipeline wires delivery dependencies

- GIVEN `createInMemoryPipeline()` is called
- WHEN the returned object is inspected
- THEN it includes `requestOutboundDelivery` and `deliveryPort`
- AND `deliveryPort` is a `FakeDeliveryPort` instance

### DR7 — Simulation Endpoint (MUST)

The system MUST provide a dev simulation endpoint for outbound delivery:

**Route**: `POST /dev/simulate/outbound-delivery`

**Request body**:
```json
{
  "outboundDraftId": "od_..."
}
```

**Response on success (200)**:
```json
{
  "delivery": {
    "status": "delivered",
    "providerMessageId": "fake_..."
  },
  "outboundDraft": {
    "id": "...",
    "status": "delivered"
  }
}
```

**Response on draft not ready (409)**:
```json
{
  "error": "draft_not_ready",
  "detail": "Outbound draft status is needs_recipient_resolution, cannot deliver"
}
```

**Response on draft not found (404)**:
```json
{
  "error": "draft_not_found",
  "detail": "Outbound draft not found: od_unknown"
}
```

**Response on invalid request (400)**:
```json
{
  "error": "invalid_payload",
  "detail": "outboundDraftId is required"
}
```

**Gating**: Only active when `ENABLE_SIMULATION_ENDPOINTS=true`.

#### Scenario: delivery of confirmed draft returns delivered

- GIVEN an `OutboundDraft` with status `confirmed_pending_delivery` exists
- WHEN `POST /dev/simulate/outbound-delivery` is called with its ID
- THEN response is 200 with `delivery.status: "delivered"` and `outboundDraft.status: "delivered"`

#### Scenario: delivery of non-ready draft returns 409

- GIVEN an `OutboundDraft` with status `needs_recipient_resolution` exists
- WHEN `POST /dev/simulate/outbound-delivery` is called with its ID
- THEN response is 409 with `error: "draft_not_ready"`

#### Scenario: delivery of unknown draft returns 404

- WHEN `POST /dev/simulate/outbound-delivery` is called with id "od_unknown"
- THEN response is 404 with `error: "draft_not_found"`

#### Scenario: delivery without outboundDraftId returns 400

- WHEN `POST /dev/simulate/outbound-delivery` is called with empty body
- THEN response is 400 with `error: "invalid_payload"`

### DR8 — Module Structure (MUST)

The `outbound-delivery` module MUST follow the existing hexagonal architecture pattern:

```
apps/core/src/modules/outbound-delivery/
├── domain/
│   ├── prepared-delivery-request.ts   # PreparedDeliveryRequest type
│   ├── delivery-result.ts             # DeliveryResult type
│   └── index.ts                       # Re-exports
├── port/
│   ├── delivery-port.ts               # DeliveryPort type alias
│   └── index.ts
├── adapter/
│   ├── fake-delivery-port.ts          # FakeDeliveryPort class
│   └── index.ts
├── application/
│   ├── use-cases/
│   │   ├── request-outbound-delivery.ts  # RequestOutboundDelivery
│   │   └── index.ts
│   └── index.ts
├── __tests__/
│   ├── fake-delivery-port.test.ts
│   └── request-outbound-delivery.test.ts
└── index.ts                          # Barrel exports
```

**Module isolation rules**:
- `outbound-delivery/domain` MUST NOT import from other module domains
- `outbound-delivery` MAY import from `shared/` types (e.g., `InboundChannel`)
- `outbound-delivery` MAY import from `outbound-draft/domain` for `OutboundDraft` type (read-only reference)
- `outbound-delivery` MUST NOT import from `channel-inbound`, `inbound-gate`, or `ai-guide`

### DR9 — Confirming Mediation Does NOT Auto-Deliver (MUST)

Confirming a mediation (saying "sí" during `confirming` flow) MUST NOT trigger delivery automatically. It only creates an `OutboundDraft` with status `confirmed_pending_delivery`. Delivery requires a separate explicit action via `RequestOutboundDelivery`.

#### Scenario: confirm mediation creates draft but does not deliver

- GIVEN an active confirming flow with valid draft and known recipient
- WHEN the user confirms with "sí"
- THEN an `OutboundDraft` is created with status `confirmed_pending_delivery`
- AND `preparedOutbound` is populated in the result
- AND NO delivery is attempted
- AND the draft remains in `confirmed_pending_delivery` status

---

## Non-Scope (Explicit)

| Item | Reason |
|------|--------|
| Real WhatsApp / Evolution API integration | Infrastructure, deferred |
| PostgreSQL persistence adapter | Persistence layer, deferred |
| Real delivery worker or queue | Async processing, deferred |
| Cron/scheduler for retry | Scheduling, deferred |
| Auto-delivery on confirmation | Separate action by design |
| Italian localization | Not needed for MVP |
| Changes to T34 outbound-draft module | T34 is complete, T35 builds on top |
| Changes to WSP track / PR #43 | Independent track |

---

## Affected Specifications

| Spec | Change Type | Description |
|------|-------------|-------------|
| `outbound-delivery` (new) | New | Port, adapter, use case, types |
| `channel-inbound-pipeline` | Modified | Simulation endpoint wiring for delivery |
| `outbound-draft` | Unchanged | T34 module is reused, not modified |

---

## Affected Code Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/outbound-delivery/` | New | Full module: domain, port, adapter, use case, tests |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire `FakeDeliveryPort` and `RequestOutboundDelivery` |
| `apps/core/src/server.ts` | Modified | Wire delivery into simulation handler |
| `apps/core/src/bootstrap/simulation-handler.ts` | Modified | Add outbound-delivery endpoint handling |
| `docs/simulation-api.md` | Modified | Document new delivery endpoint |
| `scripts/simulations/run-t35-delivery-port-acceptance.ts` | New | Acceptance simulation script |

---

## Acceptance Criteria

### AC1 — DeliveryPort exists
```
When: import { DeliveryPort } from outbound-delivery
Then: DeliveryPort type is defined with sendPreparedMessage method
```

### AC2 — FakeDeliveryPort exists and works
```
When: FakeDeliveryPort is used in success mode
Then: sendPreparedMessage returns { status: "delivered", providerMessageId: "fake_..." }
And: request is stored in memory
```

### AC3 — RequestOutboundDelivery delivers confirmed draft
```
Given: OutboundDraft with status "confirmed_pending_delivery" and resolved recipient
When: RequestOutboundDelivery.execute() is called
Then: draft transitions to "delivered"
And: DeliveryPort was called
```

### AC4 — RequestOutboundDelivery rejects non-ready drafts
```
Given: OutboundDraft with status "needs_recipient_resolution"
When: RequestOutboundDelivery.execute() is called
Then: error is thrown
And: DeliveryPort is NOT called
```

### AC5 — DeliveryPort exception does not crash
```
Given: OutboundDraft with status "confirmed_pending_delivery"
And: DeliveryPort throws an error
When: RequestOutboundDelivery.execute() is called
Then: draft is marked "failed"
And: use case returns failed result (does not throw)
```

### AC6 — Confirm mediation does NOT auto-deliver
```
Given: Active confirming flow with valid draft
When: User confirms with "sí"
Then: OutboundDraft created with "confirmed_pending_delivery"
And: NO delivery attempted
```

### AC7 — Simulation endpoint works
```
Given: ENABLE_SIMULATION_ENDPOINTS=true
And: OutboundDraft with status "confirmed_pending_delivery" exists
When: POST /dev/simulate/outbound-delivery with draft ID
Then: response 200 with delivery.status "delivered"
```

### AC8 — npm run check passes
```
When: npm run check
Then: No TypeScript errors
And: No `any` types
```

### AC9 — npm test passes
```
When: npm test
Then: All tests pass including new outbound-delivery tests
```

---

## Simulation Acceptance Sets

| Set | Count | Description | Expected Outcome |
|-----|-------|-------------|------------------|
| Confirm → deliver | 1 | Full cycle: mediation confirm → delivery fake | `preparedOutbound` then `delivery: delivered` |
| Unresolved recipient | 1 | Confirm with unknown recipient → delivery attempt | Draft `needs_recipient_resolution`, delivery rejected |
| Cancel → no delivery | 1 | Cancel mediation → delivery attempt | No draft, delivery not possible |
| Risk → no delivery | 1 | Risk signal → delivery attempt | No draft, delivery not possible |
| Unknown sender | 1 | Unknown sender → delivery attempt | No draft, delivery not possible |
