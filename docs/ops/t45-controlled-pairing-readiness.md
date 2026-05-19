# T45 — Controlled pairing readiness gate (repo-only)

## Readiness Checklist

- [x] Canonical T45 artifact defined as single GO/NO-GO source.
- [x] T46-only pairing activation plan documented (no pairing in T45).
- [x] Runtime allowlist ownership defined as private operator config.
- [x] Mandatory operational evidence fields listed with redaction policy.
- [x] Bounded risk acceptance and restart abort/revalidate triggers documented.
- [x] Explicit non-actions documented and preserved from T44 guardrails.
- [x] Runway preserved: first controlled real tests remain within <=4 tasks (T46→T48).
- [x] Machine-checkable validation (`validate:t45`) added and wired into `npm run check`.

Any unchecked gate means **NO-GO**.

## GO/NO-GO Ledger

- **Decision**: `GO` for T46 controlled pairing rehearsal planning only
- **Reviewer**: `Marco`
- **Operator**: `Marco`
- **Timestamp (UTC)**: `2026-05-19`
- **Rationale**: T45 defines fail-closed planning gates, evidence requirements, and explicit boundaries without runtime mutation.
- **Unmet gate(s)** (if NO-GO): `none for T46 planning`
- **Required remediation** (if NO-GO): `none for T46 planning`

Boundary statement: this GO does **not** approve pairing execution in T45, real sends, public/admin exposure, host-port publication, Caddy/DNS/VPS/Docker runtime mutation, secret changes, PostgreSQL rollout, HMAC rollout, durable state rollout, or sustained/production use.

## T46 Pairing Activation Plan (deferred)

Pairing/QR execution is **T46-only** and requires explicit operator + reviewer authorization at execution time.

Minimum activation gates for T46 rehearsal:

1. Operator/reviewer identified and available during rehearsal.
2. Instance route + allowlist runtime config revalidated immediately before rehearsal.
3. Abort criteria acknowledged and recorded.
4. Evidence template fields pre-created.
5. `OUTBOUND_DELIVERY_ADAPTER=fake` preserved unless a future explicit task approves otherwise.

If any gate is missing, T46 remains **NO-GO**.

## Runtime Allowlist And Config Ownership

- Allowed numbers and `instanceId` mappings are **private operator-owned runtime config**.
- Real numbers, QR values, tokens, credentials, and secrets are never committed in repo artifacts.
- Placeholder-only examples are allowed in docs/specs.
- T45/T46 do not require PostgreSQL for allowlist handling.

## Operational Evidence Fields (for future T46/T47 rehearsals)

Required fields per attempt:

- `timestamp`
- `instanceId`
- `sender/personId`
- `messageId`
- pipeline decision
- selected action
- sent/not sent
- error
- operator notes

Redaction rule (mandatory): message content bodies, API tokens, QR values, credentials, and unnecessary sensitive data are omitted or redacted.

## Bounded Risk Acceptance

Accepted only for private controlled rehearsal planning:

- Deferred HMAC webhook authenticity rollout.
- In-memory gateway instance state (no durable rehydration yet).

Not accepted for sustained/shared/public use.

Restart rule: if `gateway-wa` or Evolution API restarts unexpectedly, rehearsal must **abort** and readiness must be revalidated before any continuation.

## Abort And Revalidate Triggers

Immediate abort + revalidation required when any of these occur:

- Unexpected container/process restart (`gateway-wa`, Evolution API, Redis, or dependent path)
- Route/allowlist mismatch or unknown `instanceId`
- Missing evidence fields or redaction failure
- Any attempt to expand T45 scope into forbidden actions

## Explicit Non-Actions

T45 does **not** perform or approve:

- WhatsApp pairing / QR execution in T45
- Real outbound sends
- Public/admin exposure of gateway or Evolution API
- Host port publication
- Caddy changes
- DNS changes
- VPS or Docker runtime mutation
- Secret printing, committing, rotation, or repo secret changes
- PostgreSQL rollout for runtime allowlist
- HMAC implementation/rollout
- Durable state rollout / startup rehydration rollout

## <=4 Task Runway To First Controlled Real Tests

- **T46**: controlled pairing rehearsal execution (explicitly approved operator/reviewer run)
- **T47**: first controlled end-to-end send rehearsal with evidence capture
- **T48**: hardening gate (HMAC + durable state decision checkpoint)

Runway remains <=4 tasks from T45 to first controlled real tests.

## OpenSpec / Archive Notes

- Active change artifacts remain under `openspec/changes/t45-controlled-pairing-readiness/` during apply/verify.
- Archive phase will merge approved deltas into `openspec/specs/*` and move change artifacts to archive.
- T45 remains repo-only; no runtime mutation is authorized by this document.
