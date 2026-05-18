# Tasks: T44 Private Staging Operational Readiness

## Phase 1: Canonical readiness artifacts

- [x] 1.1 Create `docs/ops/t44-private-staging-readiness.md` with checklist, evidence inputs, go/no-go ledger, operator handoff, rollback ownership, explicit non-actions, and blocked follow-ups.
- [x] 1.2 Update `docs/ops/t37-gateway-wa-staging-runbook.md` to point at T44 readiness and state the review is repo-only with no runtime authorization.
- [x] 1.3 Update `docs/ops/t42-gateway-wa-private-staging-evidence.md` with a short T44 input note linking the readiness package while preserving T43 as baseline evidence.
- [x] 1.4 Update `docs/project-status.md` to record T44 as a go/no-go operational readiness milestone and keep pairing, public exposure, real sends, HMAC, and durable state blocked.
- [x] 1.5 Update `docs/open-questions.md` only if T44 reveals unresolved ownership or next-milestone ambiguity; otherwise add nothing new.

## Phase 2: Repo-side validation

- [x] 2.1 Add `scripts/tests/t44-private-staging-readiness.test.ts` to assert T44 doc sections, evidence links, private-only wording, and fail-closed scope guards.
- [x] 2.2 Add `validate:t44` to `package.json` and include it in `npm run check` after existing readiness validations.
- [x] 2.3 Extend the test to reject approval language for pairing, public/admin exposure, real sends, host ports, Caddy/DNS/VPS/Docker mutation, secrets, HMAC, and durable state.

## Phase 3: Validation and archive readiness

- [x] 3.1 Run the T44 test and `npm run check` to confirm the new guardrail participates in repo bootstrap validation.
- [x] 3.2 Verify the task set is internally consistent with the spec/design and contains no runtime-mutation work.
- [x] 3.3 Confirm the change is ready for `sdd-verify` and `sdd-archive` by checking that all required artifacts exist and remain repo-only.
