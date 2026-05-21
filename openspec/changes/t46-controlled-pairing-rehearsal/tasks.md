# Tasks: T46 Controlled Pairing Rehearsal

## Phase 1: Canonical Evidence Artifact

- [x] 1.1 Create `docs/ops/t46-controlled-pairing-rehearsal.md` with Readiness Checklist, GO/NO-GO Ledger, private operator sequence, evidence ledger, redaction policy, abort/revalidate rules, fake outbound invariant, explicit non-actions, deferred/NO-GO handling, and closeout.
- [x] 1.2 Keep all examples placeholder-only; forbid QR values, phone numbers, tokens, credentials, message bodies, and unredacted identifiers in the T46 ledger.

## Phase 2: Validator And Script Wiring

- [x] 2.1 Add `scripts/tests/t46-controlled-pairing-rehearsal.test.ts` to assert T46 section shape, required evidence fields, redaction wording, abort triggers, and NO-GO/deferred branches.
- [x] 2.2 Add regression checks for `OUTBOUND_DELIVERY_ADAPTER=fake` before/during/after rehearsal and for rejecting public/admin, Caddy/DNS, host-port, PostgreSQL, HMAC, durable-state, or real-send approval.
- [x] 2.3 Wire `validate:t46` into `package.json` after `validate:t45` and before `typecheck`, then include it in `npm run check`.

## Phase 3: Documentation And Status Updates

- [x] 3.1 Update `docs/project-status.md` with the T46 outcome wording and next-step routing: guarded rehearsal only if gates pass, otherwise NO-GO/deferred evidence.
- [x] 3.2 Update `docs/open-questions.md` with any T46 blockers or follow-ups discovered during readiness review, especially ownership, revalidation, persistence, or HMAC concerns.

## Phase 4: Runtime Rehearsal Branch

- [x] 4.1 Encode the private operator rehearsal sequence in `docs/ops/t46-controlled-pairing-rehearsal.md` as one bounded attempt that only runs when operator/reviewer, private path, route/allowlist revalidation, evidence template, and fake outbound gates are fresh.
- [x] 4.2 Record the NO-GO/deferred path in the same ledger for missing gates, unsafe config, restart, mismatch, or unavailable approval; stop instead of authorizing live sends.

## Phase 5: Validation And Final Evidence

- [x] 5.1 Run `npm run check` and confirm the new `validate:t46` gate is part of the chain.
- [x] 5.2 Review the T46 artifact and validator against every spec scenario to verify sanitized evidence only, one rehearsal only, and preserved `fake` outbound safety.
