# T47 — Controlled pairing execution evidence (private, sanitized)

## Readiness Checklist

- [x] Branch is `feat/t47-controlled-pairing-execution`.
- [x] Local repo gate checks executed (`npm run check`, `npm test`).
- [ ] `main` updated with PR #76 merged (blocking gate not satisfied).
- [x] Private VPS path `/docker/serena` verified.
- [x] Required services running: `serena-core`, `gateway-wa`, `evolution-api`, `evo-postgres`, `redis`.
- [x] `gateway-wa` has no host ports published.
- [x] `gateway-wa` is not attached to public proxy network.
- [x] `gateway-wa` attached only to `serena-internal` + `evolution-private`.
- [x] `OUTBOUND_DELIVERY_ADAPTER=fake` verified inside `serena-core`.
- [x] Private `/health` path returns `200`.
- [x] Private `/send` without key returns `401`.
- [ ] Private malformed `/send` with private key returns `400` (could not be safely reproduced in this shell context).
- [x] Private `GET /unknown-path` returns `404`.
- [ ] Operator + reviewer live runtime confirmation captured for this attempt window.
- [ ] Approved runtime `instanceId` confirmation captured (redacted label only).
- [ ] Runtime route/allowlist existence confirmed for this window (without values).
- [x] No Caddy/DNS/public route for gateway pairing/admin endpoints.

Any unchecked gate means **NO-GO**.

## GO/NO-GO Ledger

- **Decision**: `NO-GO`
- **Reviewer**: `Marco` (not live-confirmed for this runtime window)
- **Operator**: `Marco` (not live-confirmed for this runtime window)
- **Timestamp (UTC)**: `2026-05-21T01:05:00Z`
- **Scope approved**: private verification + sanitized T47 evidence and validator updates only
- **Rationale**: mandatory runtime gates are incomplete (PR #76 merge gate missing; live operator/reviewer and approved instance route/allowlist window not captured; malformed authenticated `/send` = `400` check not safely proven from this execution shell).
- **sanitized_evidence_marker**: `sanitized-only`
- **Failed check(s)**:
  - command: `git log --oneline origin/main -20` -> result: does not show merge for PR #76.
  - command: private authenticated malformed `/send` smoke (status-only capture) -> result: not executed in this shell context.
  - command: operator/reviewer approval capture for one-attempt window -> result: not captured.
  - command: approved redacted `instanceId` + route/allowlist existence capture -> result: not captured.
- **Missing precondition(s)**:
  - PR #76 merged into `main` and visible from local `origin/main` history.
  - Approved private runtime window with operator+reviewer live confirmation.
  - Approved redacted runtime `instanceId` label plus route/allowlist existence proof (values redacted).
  - Authenticated malformed `/send` check executed privately with status code `400` recorded only.
- **Required operator action to unblock**:
  1. Merge PR #76 into `main` and re-run local gates.
  2. In approved private runtime session, capture operator+reviewer confirmation and approved redacted instance label.
  3. Re-run malformed authenticated `/send` check privately and record only status code.
  4. Confirm route+allowlist existence (redacted proof only) and execute exactly one private pairing attempt.

Boundary statement: this T47 closeout does **not** authorize public/admin exposure, host-port publication, Caddy/DNS mutation, volume deletion, real outbound sends, or any secret disclosure.

## Private Runtime Verification Evidence (sanitized)

- `/docker/serena`: `exists`
- services up: `serena-core`, `serena-gateway-wa-staging-gateway-wa-1`, `serena-gateway-wa-staging-evolution-api-1`, `serena-gateway-wa-staging-evo-postgres-1`, `serena-gateway-wa-staging-redis-1`
- gateway host ports: `none published`
- gateway networks: `serena-internal`, `serena-gateway-wa-staging_evolution-private` (no `proxy`)
- core outbound mode: `fake`
- private health status: `200`
- private send without key status: `401`
- private malformed send with key status: `not proven in this execution` (blocked)
- private unknown path status: `404`
- caddy gateway/public route check: `no gateway/evolution/instances routes found`

## Pairing Attempt Ledger (single-attempt policy)

- **attempt_executed**: `no`
- **pairing_state**: `no_go`
- **qr_requested**: `no`
- **instance_status**: `not_started`
- **sent**: `not_sent`
- **blocker_or_error**: `mandatory runtime gates incomplete`
- **next_operator_action**: `complete unblock steps under private operator session, then retry once`

## Explicit Non-Actions

- No QR value stored or printed.
- No phone numbers, tokens, keys, credentials, allowlist contents, or message bodies recorded.
- No Caddy changes.
- No DNS changes.
- No public/admin route enablement.
- No host-port publication.
- No real outbound sends.
- No volume deletion.
- No unrelated project mutation.
