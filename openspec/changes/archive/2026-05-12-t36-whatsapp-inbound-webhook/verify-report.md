# Verification Report — t36-whatsapp-inbound-webhook

## Metadata
- **Change**: `t36-whatsapp-inbound-webhook`
- **Mode**: **Strict TDD** (from `openspec/config.yaml`)
- **Artifact store**: hybrid (filesystem + Engram)
- **Verifier date**: 2026-05-12

---

## Completeness

| Metric | Value |
|---|---:|
| Total tasks | 11 |
| Completed (`[x]`) | 11 |
| Incomplete (`[ ]`) | 0 |

Source: `openspec/changes/t36-whatsapp-inbound-webhook/tasks.md`

---

## Execution Evidence

### 1) Type/quality checks
- Command: `npm run check`
- Result: ✅ PASS

### 2) Full test suite
- Command: `npm test`
- Result: ✅ PASS
- Evidence snapshot: core suite reports `806 passed, 0 failed`; gateway-wa suite executed from root test flow and reports `250 passed, 0 failed`

### 3) Gateway-wa explicit validation
- Command: `npm run test:gateway-wa`
- Result: ✅ PASS
- Evidence snapshot: `250 passed, 0 failed, 0 skipped`

Coverage tool is not configured in project (`openspec/config.yaml -> testing.coverage.available: false`).

---

## Correctness (Static + Behavioral)

### Acceptance criteria verification

1. **Endpoint exists (`POST /internal/webhook/whatsapp`)**
   - ✅ Verified in `apps/core/src/bootstrap/server.ts` route wiring.
   - ✅ Route is not gated by `ENABLE_SIMULATION_ENDPOINTS`.

2. **Requires `X-Serena-Internal-Token`, with 401/403 behavior, no token logging**
   - ✅ Shared auth guard used for `/internal/*` (`validateInternalToken` in `bootstrap/server.ts`).
   - ✅ 401 missing / 403 invalid / 500 misconfigured env behavior implemented and tested.
   - ✅ Token-before-body behavior tested for webhook (`whatsapp-webhook-http.test.ts`).
   - ✅ No token value logging found in core webhook/auth path.

3. **Validates normalized payload required/optional fields**
   - ✅ Handler validates required: `instanceId`, `messageId`, `senderWhatsAppId`, `text`, `receivedAt`.
   - ✅ Validates optional: `channel` (`whatsapp`), `provider`, `senderName`, `raw` object.
   - ✅ Invalid payload returns `400 { error: "invalid_payload", fields: [...] }`.

4. **Maps fields correctly to channel-inbound command**
   - ✅ `externalSenderId <- senderWhatsAppId`
   - ✅ `channel <- "whatsapp"`
   - ✅ `occurredAt <- receivedAt`
   - ✅ metadata preserves `provider`, `instanceId`, `messageId`, `senderName`, `raw`
   - Verified in `toInboundCommand()` and metadata-capture integration test.

5. **Uses `ProcessChannelInboundMessage` / normal pipeline**
   - ✅ `createWhatsAppWebhookHandler(processChannelInboundMessage)` wired in `apps/core/src/server.ts`.
   - ✅ Integration tests verify known sender, unknown sender, mediation path, and risk path outcomes through normal pipeline result shape.

6. **Unknown sender / conversation / mediation / risk scenarios covered**
   - ✅ Unknown sender scenario tested (`unknown_sender`).
   - ✅ Conversational known sender path tested (`serena.conversation.reply`).
   - ✅ Mediation path tested (`mediation_understanding` profile).
   - ✅ Risk path tested (`risk_review` profile).

7. **No auto DeliveryPort call / no real send**
   - ✅ Webhook handler only maps + invokes `ProcessChannelInboundMessage` and returns result envelope.
   - ✅ No `RequestOutboundDelivery`/`DeliveryPort` invocation in webhook adapter path.

8. **No Evolution API direct in Core**
   - ✅ No Evolution API integration added in webhook adapter or server wiring.
   - ✅ `provider: "evolution"` treated as metadata only.

9. **Validations pass (`npm run check`, `npm test`, `npm run test:gateway-wa`)**
   - ✅ All passed.

---

## Design Coherence

Design file: `openspec/changes/t36-whatsapp-inbound-webhook/design.md`

| Decision | Status | Notes |
|---|---|---|
| Dedicated webhook handler in bootstrap | ✅ Followed | `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` |
| Reuse shared `processChannelInboundMessage` | ✅ Followed | wired in `apps/core/src/server.ts` |
| Shared `/internal/*` token guard | ✅ Followed | `validateInternalToken` in `bootstrap/server.ts` |
| Metadata preserved under `command.metadata` | ✅ Followed | `toInboundCommand()` + metadata test |
| No new idempotency cache in T36 | ✅ Followed | remains future work; not silently implemented |

---

## Spec Compliance Matrix

| Requirement | Scenario | Evidence (test/file) | Result |
|---|---|---|---|
| Internal WhatsApp Webhook Route | Route exists outside simulation mode | `bootstrap/server.ts` route + `whatsapp-webhook-http.test.ts` authenticated 200 | ✅ COMPLIANT |
| Internal WhatsApp Webhook Route | No direct provider integration | `whatsapp-webhook-handler.ts` (no provider client calls) + architecture grep | ✅ COMPLIANT |
| Payload Validation | Invalid payload reports fields | `whatsapp-webhook-http.test.ts` invalid payload case | ✅ COMPLIANT |
| Payload Validation | Valid provider metadata accepted | `whatsapp-webhook-http.test.ts` optional metadata case | ✅ COMPLIANT |
| Pipeline Mapping | Happy path uses normal pipeline | `whatsapp-webhook-http.test.ts` known sender conversation | ✅ COMPLIANT |
| Pipeline Mapping | Unknown sender follows policy | `whatsapp-webhook-http.test.ts` unknown sender reason | ✅ COMPLIANT |
| Pipeline Mapping | Mediation request prepare-only | `whatsapp-webhook-http.test.ts` mediation profile; no delivery path in handler | ✅ COMPLIANT |
| Pipeline Mapping | Risk request no auto-send | `whatsapp-webhook-http.test.ts` risk profile; no delivery path in handler | ✅ COMPLIANT |
| Pipeline Mapping | Metadata preserved | `whatsapp-webhook-http.test.ts` captured metadata assertions | ✅ COMPLIANT |
| Webhook Idempotency Future | No new idempotency cache in T36 | `design.md` + `docs/open-questions.md` future-work posture | ✅ COMPLIANT |
| Internal Token Authentication | Health public (no token required) | Existing health behavior in server + prior internal pipeline suite; route unchanged | ✅ COMPLIANT |
| Internal Token Authentication | Webhook missing token returns 401 | `whatsapp-webhook-http.test.ts` | ✅ COMPLIANT |
| Internal Token Authentication | Webhook wrong token returns 403 | `whatsapp-webhook-http.test.ts` | ✅ COMPLIANT |
| Internal Token Authentication | Webhook valid token processes normally | `whatsapp-webhook-http.test.ts` | ✅ COMPLIANT |
| Internal Token Authentication | Missing env var returns 500 | `whatsapp-webhook-http.test.ts` | ✅ COMPLIANT |
| Token check before body parsing | Webhook token rejection without body consumption | `whatsapp-webhook-http.test.ts` invalid JSON + no token -> 401 | ✅ COMPLIANT |

**Compliance summary**: **16 / 16 scenarios compliant**.

---

## Findings

### CRITICAL
- None.

### WARNING
- None.

### SUGGESTION
- Add one explicit assertion in webhook tests that response result never includes an outbound-delivery execution artifact (currently implied by architecture and handler behavior).

---

## Verdict

## **PASS**

Implementation is complete, test-validated, and aligned with specs/design for T36. No blocking gaps found for archive from verification perspective.
