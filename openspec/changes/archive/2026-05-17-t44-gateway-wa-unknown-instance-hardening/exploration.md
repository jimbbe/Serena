## Exploration: t44-gateway-wa-unknown-instance-hardening

### Current State
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` handles `connection.update` separately, but for message webhooks it currently runs `dedup -> filter -> normalize -> route`.
- Unknown instances are only rejected **after** normalization via `routing_not_configured`, which works for fully shaped payloads but still lets malformed synthetic payloads reach `shouldDiscard()` / `normalizeEvolutionPayload()` first.
- Both `apps/gateway-wa/src/infrastructure/webhook/filter.ts` and `normalizer.ts` assume nested Evolution fields like `data.key.remoteJid`, `data.key.fromMe`, `data.message`, and `data.messageTimestamp` already exist.
- Because the server catch-all in `apps/gateway-wa/src/infrastructure/server.ts` turns uncaught handler errors into HTTP `500`, an unknown/unconfigured instance can still produce `500` if its payload shape is incomplete before routing is checked.
- Existing T43-safe behavior already exists for the happy path: a valid unknown instance with a routing table returns `200 { ignored: true, reason: "routing_not_configured" }`, and this must be preserved.

### Affected Areas
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` — current operation order causes unknown-instance payloads to normalize before route rejection.
- `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` — best place for narrow regression coverage of malformed unknown-instance payloads.
- `apps/gateway-wa/src/tests/integration.test.ts` — HTTP-level regression for non-500 behavior on `/webhook/evolution`.
- `openspec/specs/gateway-webhook-receiver/spec.md` — main spec should state controlled behavior for unknown/unconfigured instances before normalization.
- `README.md` / `docs/project-status.md` only if proposal later decides the behavior change must be reflected outside OpenSpec.

### Approaches
1. **Early unknown-route short-circuit** — read `instance` first and, when routing-table mode is active, return `routing_not_configured` before dedup/filter/normalize if no route exists.
   - Pros: smallest change, directly targets the T43 follow-up, preserves current success behavior for valid unknown-instance smoke, avoids touching durable instance state.
   - Cons: malformed payloads for configured instances would still rely on current validation depth unless separately hardened.
   - Effort: Low.

2. **Defensive schema validation for all message webhooks** — validate required nested fields before filter/normalize and return `400 invalid_webhook_payload` on malformed bodies.
   - Pros: broader safety, removes multiple 500 paths beyond unknown instances.
   - Cons: larger scope, more tests/spec churn, easier to broaden beyond the requested T44 boundary.
   - Effort: Medium.

3. **Catch-and-downgrade around normalize/filter** — wrap message processing in targeted try/catch and convert shape errors into a controlled non-500 response.
   - Pros: small patch surface.
   - Cons: weaker contract, can mask exactly where payload assumptions are wrong, less explicit than ordering the logic correctly.
   - Effort: Low.

### Recommendation
Use **Approach 1** as the narrow T44 scope: in routing-table mode, resolve `instanceId` and reject unknown/unconfigured instances **before** dedup/filter/normalization. Then add one unit regression and one HTTP integration regression using a minimal synthetic unknown-instance payload shape that previously hit the server catch-all. This keeps the task tightly focused on safe fail-closed behavior without expanding into durable instance persistence or broad webhook schema redesign.

### Risks
- If the proposal tries to harden every malformed webhook path now, scope will sprawl past the explicit T44 follow-up.
- Reordering must not break existing valid-route processing, duplicate handling, self-message discard, or `connection.update` support.
- If staging smoke used a payload missing `instance`, the proposal must decide whether that is treated as `routing_not_configured` (`instanceId: "unknown"`) or `400 invalid_webhook_payload`; the narrower T44 reading favors fail-safe ignore in routing-table mode.

### Ready for Proposal
Yes — the change is narrow enough. The proposal should frame T44 as **gateway webhook hardening for unknown/unconfigured instances**, centered on operation ordering, regression tests, and spec sync only.
