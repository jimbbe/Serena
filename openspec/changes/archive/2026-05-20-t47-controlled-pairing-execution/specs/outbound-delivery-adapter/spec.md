# Delta for Outbound Delivery Adapter

## ADDED Requirements

### Requirement: T47 Fake-Outbound Invariant

During T47, Serena Core MUST keep `OUTBOUND_DELIVERY_ADAPTER=fake` before, during, and after any private pairing attempt. T47 MUST NOT perform real outbound sends or enable product auto-send behavior.

#### Scenario: Fake outbound is proven

- GIVEN T47 runtime gates are checked
- WHEN Core configuration is inspected without printing secrets
- THEN `OUTBOUND_DELIVERY_ADAPTER=fake` MUST be recorded before any attempt
- AND the same invariant MUST be rechecked at closeout

#### Scenario: Real send path aborts

- GIVEN any T47 command, document, or validation path requires a real message send or a non-fake outbound adapter
- WHEN the requirement is detected
- THEN execution MUST stop as NO-GO
- AND sanitized evidence MUST identify the failed check and next operator action
