# Design: T38 Fix Webhook Probe Contract

## Technical Approach

Treat the existing Core webhook implementation and tests as the contract authority, then correct only the stale T38 operational artifact and its static validation. No runtime code, deploy, secret, Caddy, host-port, or WhatsApp-pairing changes are part of this design. The runbook probe will use the current `POST /internal/webhook/whatsapp` payload shape: `provider`, `instanceId`, `messageId`, `senderWhatsAppId`, `text`, and `receivedAt`; success wording will expect `received: true` and `routedTo: "serena-core"`.

The validation remains intentionally simple: `validate:t38` is a repo-only `node:test` script that reads tracked text files and applies string/regex assertions. It should fail on the concrete drift that caused this change without introducing a parser or brittle shell-command interpreter.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Contract authority | Use `apps/core/src/bootstrap/whatsapp-webhook-handler.ts`, `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts`, and main OpenSpec webhook spec as source of truth. | Change runtime to accept legacy `from`/`timestamp`; treat runbook as source of truth. | Runtime and specs already agree on `senderWhatsAppId`/`receivedAt` and `routedTo: "serena-core"`; changing runtime would expand scope and preserve a stale contract. |
| Fix type | Documentation correction plus stronger static contract test. | Add integration test that executes docker/runbook commands. | T38 scope is repo-only readiness documentation. Static assertions are enough to catch this drift and avoid infra/deploy side effects. |
| Validation style | Simple string/regex checks over `docs/ops/t38-vps-core-update-runbook.md`. | Parse shell JavaScript snippets or snapshot whole runbook sections. | Field-level assertions are less fragile than full snapshots and still pin the required contract markers. |

## Data Flow

```text
T38 runbook probe
  └─ JSON body with senderWhatsAppId + receivedAt
      └─ POST /internal/webhook/whatsapp with x-serena-internal-token
          └─ Core webhook maps to channel-inbound command
              └─ response includes received: true, routedTo: "serena-core"

npm run validate:t38
  └─ scripts/tests/t38-readiness-validation.test.ts
      └─ reads docs/ops/t38-vps-core-update-runbook.md
          └─ asserts required fields/response markers and rejects legacy drift
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/ops/t38-vps-core-update-runbook.md` | Modify | Replace authenticated and unauthenticated webhook probe bodies so they use `senderWhatsAppId` and `receivedAt`, not `from` or `timestamp`; update expected success to `routedTo: "serena-core"`. |
| `scripts/tests/t38-readiness-validation.test.ts` | Modify | Add a focused test that reads the T38 runbook and asserts the probe contract includes `senderWhatsAppId`, `receivedAt`, `received: true`, `routedTo: "serena-core"`, and does not include legacy `from`, `timestamp`, or `routedTo: "channel-inbound"`. |
| `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` | Inspect only | Runtime contract authority; no change planned. |
| `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` | Inspect only | Existing executable evidence; no change planned. |

## Interfaces / Contracts

No new runtime interfaces. The static documentation contract for the T38 probe is:

- required payload markers: `senderWhatsAppId`, `text`, `receivedAt`, `instanceId`, `messageId`
- optional payload marker: `provider`
- forbidden legacy markers in the probe body: `from`, `timestamp`
- expected success markers: `received: true`, `routedTo: "serena-core"`
- forbidden success marker: `routedTo: "channel-inbound"`

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static contract | T38 runbook webhook probe fields and expected response markers | Extend `scripts/tests/t38-readiness-validation.test.ts` with regex/string assertions scoped to the runbook content. |
| Repository validation | T38 readiness checks | Run `npm run validate:t38`. |
| Baseline validation | Typecheck/structure unaffected by docs/test change | Run `npm run check`. |

## Migration / Rollout

No migration required. This is repo-only documentation and validation hardening. No deploy, secrets, Caddy changes, host port exposure, infrastructure mutation, or WhatsApp pairing.

## Open Questions

None.
