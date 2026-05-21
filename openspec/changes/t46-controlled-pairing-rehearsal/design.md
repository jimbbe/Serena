# Design: T46 Controlled Pairing Rehearsal

## Technical Approach

T46 is implemented as a bounded hybrid safety package: repository artifacts define the canonical ledger and machine-checkable guardrails, while any runtime pairing rehearsal remains operator-only and fail-closed. The implementation extends the T45 pattern (`docs/ops/t45-controlled-pairing-readiness.md` + `scripts/tests/t45-controlled-pairing-readiness.test.ts`) instead of adding product code. No live runtime command is part of this design.

Runtime is allowed only after the ledger records fresh GO gates. If the current environment cannot safely execute private runtime access, the ledger records **NO-GO/deferred** evidence; success must not be simulated.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonical evidence artifact | Create `docs/ops/t46-controlled-pairing-rehearsal.md` | Reuse T45 doc or scattered notes | T46 needs execution-time GO/NO-GO, abort, closeout, and redacted evidence without rewriting the T45 planning baseline. |
| Validation | Add `scripts/tests/t46-controlled-pairing-rehearsal.test.ts` and `validate:t46` after `validate:t45` in `npm run check` | Manual review only | Existing T44/T45 readiness gates are machine-checked with Node `node:test`; T46 should fail closed the same way. |
| Runtime access | Private operator path only for `/instances*` and QR/pairing | Public Caddy/admin route, host port, DNS change | Specs require no public/admin exposure, no host ports, and no Caddy/DNS changes. |
| Outbound safety | Require `OUTBOUND_DELIVERY_ADAPTER=fake` before, during, and after | Temporarily enable `gateway-wa` delivery | T46 proves pairing path only; real sends are explicitly forbidden. |

## Data Flow

```text
T45 baseline + T46 specs
        │
        ▼
docs/ops/t46-controlled-pairing-rehearsal.md
        │  validate:t46 checks shape, redaction, non-actions, fake invariant
        ▼
npm run check
        │
        ▼
Operator-only runtime rehearsal (only if GO gates are freshly recorded)
        │
        ├─ private path → gateway-wa /instances* → Evolution pairing state
        ├─ evidence fields redacted in ledger
        └─ abort/revalidate on restart, mismatch, missing evidence, or scope creep
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/ops/t46-controlled-pairing-rehearsal.md` | Create | Canonical GO/NO-GO ledger, preflight gates, runtime sequence, redaction policy, abort/revalidate rules, closeout. |
| `scripts/tests/t46-controlled-pairing-rehearsal.test.ts` | Create | Validates required sections, evidence fields, redaction prohibitions, explicit non-actions, fake outbound invariant, and check wiring. |
| `package.json` | Modify | Add `validate:t46` and wire it into `check` after `validate:t45` and before `typecheck`. |
| `docs/project-status.md` | Modify | Record T46 as implemented/deferred based on actual evidence outcome. |
| `docs/open-questions.md` | Modify | Add or update follow-up hardening questions if execution discovers blockers. |

## Interfaces / Contracts

The T46 ledger should contain these canonical sections: `Readiness Checklist`, `GO/NO-GO Ledger`, `Private Operator Runtime Sequence`, `Evidence Ledger`, `Evidence Redaction Policy`, `Abort And Revalidate Rules`, `Fake Outbound Safety Invariant`, `Explicit Non-Actions`, `Deferred/NO-GO Handling`, and `Closeout`.

Required evidence fields: timestamp UTC, operator, reviewer, private path confirmed, redacted instanceId, redacted sender/personId, redacted messageId, route/allowlist revalidation status, pairing phase/state, pipeline decision/action if observed, sent/not sent, error/abort reason, operator notes. Forbidden evidence: QR values, phone numbers, tokens, credentials, route secrets, allowlist contents, message bodies, and unredacted identifiers.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Repo validation | T46 doc shape and safety wording | Node `node:test` validator modeled after T45. |
| Guardrail regression | No approval for real sends/public exposure/Caddy/DNS/host ports/PostgreSQL/HMAC/durable state | Regex assertions across T46 doc and relevant status docs. |
| Check integration | `validate:t46` runs in `npm run check` | Assert script and check ordering in `package.json`. |

## Migration / Rollout

No data migration required. Rollout is docs + validation first. Runtime rehearsal, if possible, is a single operator-approved private attempt. If safe runtime execution is unavailable, record NO-GO/deferred evidence and stop.

## Open Questions

- [ ] None blocking design. Runtime may still defer if private access, reviewer/operator availability, route/allowlist revalidation, or fake outbound confirmation cannot be safely proven.
