# T46 — Controlled pairing rehearsal (guarded execution)

## Readiness Checklist

- [x] Canonical T46 ledger defined as the only GO/NO-GO source for rehearsal execution.
- [x] Operator + reviewer accountability fields are present and mandatory.
- [x] Private operator-only path requirement is explicit (`/instances*` with no public/admin exposure).
- [x] Evidence template requires sanitized fields only and forbids sensitive values.
- [x] Abort/revalidate conditions are explicit (restart, mismatch, missing evidence, scope expansion).
- [x] `OUTBOUND_DELIVERY_ADAPTER=fake` invariant is explicit before, during, and after.
- [x] Deferred/NO-GO branch is documented for unavailable or unsafe runtime gates.
- [x] Explicit non-actions from T44/T45 remain blocked.

Any unchecked gate means **NO-GO**.

## GO/NO-GO Ledger

- **Decision**: `NO-GO/deferred` for runtime rehearsal in this execution context
- **Reviewer**: `Marco`
- **Operator**: `Marco`
- **Timestamp (UTC)**: `2026-05-20`
- **Scope approved**: repo-side T46 apply artifacts and machine-checkable guardrails
- **Rationale**: private operator runtime path and live approvals cannot be safely executed from this environment; fail-closed deferred evidence is required.
- **Unmet gate(s)**: `private operator runtime execution path unavailable in current environment`, `live operator/reviewer runtime approval not provable here`
- **Required remediation**: `operator executes private runtime sequence in approved environment, captures sanitized evidence, then updates this ledger`

Boundary statement: this decision does **not** approve real sends, public/admin exposure, host ports, Caddy/DNS changes, VPS/Docker runtime mutation, secret printing/changes, PostgreSQL rollout, HMAC rollout, durable-state rollout, or sustained/productive usage.

## Private Operator Runtime Sequence

One approved private attempt only:

1. Confirm operator + reviewer are both present.
2. Revalidate private access path and route/allowlist alignment for the approved instance.
3. Confirm `OUTBOUND_DELIVERY_ADAPTER=fake` before attempt.
4. Start controlled pairing rehearsal through the private operator path only.
5. Record sanitized evidence row in this ledger.
6. Reconfirm `OUTBOUND_DELIVERY_ADAPTER=fake` after attempt.
7. Close attempt as GO evidence only if all gates remained valid end-to-end.

If any gate fails at any step, stop immediately and record NO-GO/deferred evidence.

## Evidence Ledger

Required fields per attempt:

- timestamp UTC
- operator
- reviewer
- private path confirmed
- redacted instanceId
- redacted sender/personId
- redacted messageId
- route/allowlist revalidation status
- pairing phase/state
- pipeline decision/action (if observed)
- sent/not sent
- error/abort reason
- operator notes

Current entry:

- **timestamp UTC**: `2026-05-20`
- **operator**: `Marco`
- **reviewer**: `Marco`
- **private path confirmed**: `deferred (not executed in this environment)`
- **instanceId**: `redacted/deferred`
- **sender/personId**: `redacted/deferred`
- **messageId**: `redacted/deferred`
- **route/allowlist revalidation status**: `deferred`
- **pairing phase/state**: `not started`
- **pipeline decision/action**: `not observed`
- **sent/not sent**: `not sent`
- **error/abort reason**: `runtime execution intentionally deferred due to unavailable safe private path in this context`
- **operator notes**: `repo-only apply completed; runtime must be executed by operator in approved private environment`

## Evidence Redaction Policy

Allowed: timestamps, redacted IDs, state/phase, decision/action, sent/not sent, error/abort reason, and operational notes.

Forbidden (MUST be omitted or redacted): QR values, phone numbers, tokens, credentials, route secrets, allowlist contents, message bodies, and any unredacted identifier.

## Abort And Revalidate Rules

Abort immediately and require revalidation when any of the following occurs:

- gateway-wa, Evolution API, Redis, or dependent route restart
- unknown route or route mismatch
- allowlist mismatch
- missing evidence field
- redaction failure
- forbidden scope expansion attempt

After abort, no runtime pairing may proceed until all gates are freshly revalidated and recorded.

## Fake Outbound Safety Invariant

For T46, Serena Core MUST keep `OUTBOUND_DELIVERY_ADAPTER=fake` before, during, and after the controlled rehearsal.

- If outbound mode is not `fake`, T46 remains NO-GO/deferred.
- Any observed action must be recorded as not-sent evidence.
- Real outbound delivery remains forbidden in T46.

## Explicit Non-Actions

T46 does **not** perform or approve:

- real outbound sends
- public/admin exposure
- host port publication
- Caddy changes
- DNS changes
- VPS or Docker runtime mutation from this repo-side apply execution
- secret printing, committing, rotation, or repo secret changes
- PostgreSQL rollout
- HMAC rollout
- durable-state rollout
- sustained or productive use

## Deferred/NO-GO Handling

When required runtime gates are unavailable or unsafe:

1. Record `NO-GO/deferred` in this ledger.
2. Do not simulate runtime success.
3. Provide precise blocker + operator next step.
4. Keep guardrails unchanged.

This artifact currently follows the deferred branch.

## Closeout

- **Status**: repo-side apply completed; runtime rehearsal deferred
- **Next allowed step**: operator executes private runtime rehearsal with reviewer approval and sanitized evidence capture
- **Still blocked**: real sends, public/admin exposure, host ports, Caddy/DNS changes, PostgreSQL/HMAC/durable-state rollout, and sustained/productive use
