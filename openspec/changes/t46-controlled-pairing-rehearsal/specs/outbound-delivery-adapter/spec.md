# Delta for Outbound Delivery Adapter

## ADDED Requirements

### Requirement: Fake Outbound Safety Invariant

For T46, Serena Core MUST run with `OUTBOUND_DELIVERY_ADAPTER=fake` before, during, and after the controlled pairing rehearsal. Real outbound delivery, `gateway` delivery mode, productive send behavior, or any change that can send a WhatsApp message MUST remain forbidden unless a future explicit task approves it.

#### Scenario: Runtime execution keeps fake outbound

- GIVEN all T46 pairing gates pass
- WHEN runtime rehearsal proceeds
- THEN fake outbound MUST be confirmed before and after the attempt
- AND any selected action MUST remain not-sent evidence

#### Scenario: Real delivery blocks execution

- GIVEN outbound config is not `fake` or real send behavior is requested
- WHEN T46 gates are evaluated
- THEN T46 MUST record NO-GO/deferred evidence
- AND no pairing runtime execution may proceed
