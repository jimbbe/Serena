# Tasks: T45 Controlled Pairing Readiness

## Phase 1: Canonical readiness artifact

- [x] 1.1 Create `docs/ops/t45-controlled-pairing-readiness.md` with the readiness checklist, GO/NO-GO ledger, T46-only activation plan, operator/reviewer ownership, and rollback/abort rules.
- [x] 1.2 Include mandatory evidence fields (`timestamp`, `instanceId`, `sender/personId`, `messageId`, pipeline decision, selected action, sent/not sent, error, operator notes) and explicit redaction language.
- [x] 1.3 Add bounded risk acceptance, runtime allowlist ownership, explicit non-actions, and the <=4-task runway for T46→T48.

## Phase 2: Repo guardrails and validation wiring

- [x] 2.1 Add `scripts/tests/t45-controlled-pairing-readiness.test.ts` using `node:test` + `node:assert/strict` to validate required sections, fields, and fail-closed wording.
- [x] 2.2 Assert the validator rejects any T45 approval that implies pairing execution, real sends, public/admin exposure, host ports, Caddy/DNS/VPS/Docker mutation, secret changes, PostgreSQL rollout, HMAC rollout, or durable state rollout.
- [x] 2.3 Update `package.json` with `validate:t45` and wire `npm run check` to run `validate:t44`, `validate:t45`, then `typecheck`.

## Phase 3: Project docs sync

- [x] 3.1 Update `README.md` so the current-state and next-step wording says T45 is planning-only and T46 is the first allowed pairing execution step.
- [x] 3.2 Update `docs/project-status.md` to record T45 as the controlled pairing readiness gate and restate what remains blocked.
- [x] 3.3 Update `docs/open-questions.md` to close/narrow T45 planning questions and keep only future hardening decisions open.

## Phase 4: OpenSpec consistency and final verification

- [x] 4.1 Re-read `openspec/changes/t45-controlled-pairing-readiness/design.md` and `.../specs/*/spec.md` against the new docs/test to keep terminology aligned and avoid scope drift.
- [x] 4.2 Confirm OpenSpec wording stays repo-only and does not authorize runtime mutation or pairing in T45.
- [x] 4.3 Run `npm run validate:t45` and `npm run check`; fix any mismatch between docs, validation, and repo standards before handoff.
