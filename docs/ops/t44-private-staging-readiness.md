# T44 — Private staging operational readiness (repo-only)

## Readiness Checklist

- [x] Canonical readiness package created for T44.
- [x] T43 baseline evidence linked and preserved as historical input.
- [x] Operator handoff and ownership fields defined.
- [x] Rollback ownership defined and bounded to staging scope.
- [x] Explicit non-actions and blocked follow-ups documented.
- [x] Machine-checkable repo validation added.
- [ ] GO/NO-GO decision fields completed by reviewer/operator.

Any unchecked gate means **NO-GO**.

## Evidence Inputs

- Baseline rollout evidence: `docs/ops/t42-gateway-wa-private-staging-evidence.md`
- Operational runbook: `docs/ops/t37-gateway-wa-staging-runbook.md`
- T44 readiness spec: `openspec/changes/t44-private-staging-operational-readiness/specs/gateway-private-staging-readiness/spec.md`
- T44 ops delta spec: `openspec/changes/t44-private-staging-operational-readiness/specs/gateway-private-staging-ops/spec.md`
- T44 design: `openspec/changes/t44-private-staging-operational-readiness/design.md`

These are inputs only. Citing them does not authorize runtime actions.

## Go/No-Go Ledger

- **Decision**: `GO | NO-GO` (operator/reviewer must fill)
- **Reviewer**: `________________`
- **Operator**: `________________`
- **Timestamp (UTC)**: `________________`
- **Scope approved**: Private operator-only staging readiness review, repo-only
- **Rationale**: `________________`
- **Unmet gate(s)** (if NO-GO): `________________`
- **Required remediation** (if NO-GO): `________________`

Boundary statement: even with GO, pairing, public/admin exposure, real sends, host-port publication, Caddy/DNS change, secrets handling changes, HMAC rollout, durable state rollout, and VPS/Docker runtime mutation remain out of scope for T44.

## Operator Handoff

- **Readiness review owner**: verifies this ledger and fail-closed gates.
- **Evidence maintenance owner**: keeps links and status synchronized without rewriting T43 history.
- **Decision recorder owner**: records GO/NO-GO and rationale.
- **Escalation owner**: opens follow-up milestones for blocked items only.

Handoff is repo-only and no runtime mutation is authorized by this artifact.

## Rollback Ownership

- **Rollback owner**: operator of the staging stack.
- **Rollback trigger**: any unmet readiness gate or contradictory evidence.
- **Rollback scope**: revert repo artifact changes from T44 PR; runtime remains unchanged.
- **Runtime rollback reference**: `docs/ops/t42-gateway-wa-private-staging-evidence.md` rollback steps (staging-only).

## Explicit Non-Actions

T44 does **not** perform or approve:

- WhatsApp pairing / QR onboarding
- Public or admin exposure of `gateway-wa` / Evolution API
- Real outbound sends
- Host port publication
- Caddy changes
- DNS changes
- VPS or Docker runtime mutation
- Secret printing, committing, or rotation in repo artifacts

## Blocked Follow-ups

The following stay blocked for future milestones (not T44 work):

- HMAC webhook authenticity enforcement
- Durable state persistence and startup rehydration
- Pairing and real-send enablement
- Any public/admin route exposure

If any blocked follow-up appears as approved work, readiness is invalid and must fail closed as **NO-GO**.
