# Outbound Delivery Adapter Specification

## Purpose

Define Serena Core's configurable `DeliveryPort` adapter for requesting outbound WhatsApp delivery through `gateway-wa`, without coupling Core to Evolution API.

## Requirements

### Requirement: Delivery Adapter Selection

The system MUST select the outbound delivery adapter from runtime configuration. The fake adapter MUST remain the default when real delivery is not explicitly enabled. The gateway adapter MUST require base URL, app key, and `instanceId` configuration before boot succeeds.

#### Scenario: Fake adapter remains default

- GIVEN no real outbound delivery mode is configured
- WHEN Core boots
- THEN `FakeDeliveryPort` is selected
- AND no network delivery calls are possible

#### Scenario: Gateway adapter requires complete config

- GIVEN gateway delivery mode is configured without base URL, app key, or `instanceId`
- WHEN Core boots
- THEN configuration validation fails safely
- AND no partially configured delivery adapter is used

### Requirement: Gateway Send Request Contract

The gateway adapter MUST call only `gateway-wa` `POST /send` with body `{ "instanceId": envInstanceId, "to": recipientExternalId, "text": messageText }` and header `X-Gateway-App-Key`. It MUST NOT call Evolution API directly.

#### Scenario: Successful request shape

- GIVEN a prepared delivery request for recipient external ID `5491111111111`
- WHEN the gateway adapter sends it
- THEN it posts to `/send` with configured `instanceId`, `to`, and `text`
- AND includes `X-Gateway-App-Key`

#### Scenario: No direct provider call

- GIVEN gateway delivery mode is enabled
- WHEN a delivery is requested
- THEN Core calls only the configured `gateway-wa` base URL
- AND never calls Evolution API endpoints

### Requirement: Gateway Error Mapping

The gateway adapter MUST map `gateway-wa` outcomes to `DeliveryResult`: `200` to `delivered` with provider message ID when present; `400`, `404`, `502`, network failures, invalid JSON, and unexpected statuses to `failed` with a traceable failure reason and raw response when available.

#### Scenario: Send succeeds

- GIVEN `gateway-wa` returns `200` with message confirmation
- WHEN the adapter receives the response
- THEN it returns `DeliveryResult.status = "delivered"`
- AND preserves provider message metadata when available

#### Scenario: Gateway rejects or fails

- GIVEN `gateway-wa` returns `400`, `404`, or `502`
- WHEN the adapter receives the response
- THEN it returns `DeliveryResult.status = "failed"`
- AND the failure reason reflects validation, missing instance, or gateway/provider failure
