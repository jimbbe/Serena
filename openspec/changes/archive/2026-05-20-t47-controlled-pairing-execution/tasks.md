# Tasks: T47 Controlled Pairing Execution

## Phase 1: Branch And Repo Alignment

- [x] 1.1 Switch to `feat/t47-controlled-pairing-execution`, confirm updated `main`, and verify PR #76 is merged before any execution work.
- [x] 1.2 Inspect T47 artifact paths in `openspec/changes/t47-controlled-pairing-execution/` and keep scope limited to this change.

## Phase 2: Canonical Evidence And Guardrails

- [x] 2.1 Create `docs/ops/t47-controlled-pairing-execution-evidence.md` as the canonical sanitized ledger with gates, one-attempt rule, evidence row, NO-GO branch, and explicit non-actions.
- [x] 2.2 Add `scripts/tests/t47-controlled-pairing-execution.test.ts` to fail closed on missing gates, public exposure, real-send approval, QR/phone/token leaks, and any outbound drift from `fake`.
- [x] 2.3 Wire `validate:t47` into `package.json` after `validate:t46` and before `typecheck`, then include it in `npm run check`.

## Phase 3: Private Execution Gates

- [x] 3.1 Run baseline `npm run check` and `npm test`; stop with NO-GO if either fails.
- [x] 3.2 Perform private VPS checks without printing secrets: `/docker/serena`, private networks, no `gateway-wa` host ports/public route, Core outbound `fake`, and smoke `/send`/404 behavior.
- [ ] 3.3 Confirm operator/reviewer approval, approved redacted `instanceId`, and private allowlist/route existence; execute exactly one private pairing attempt only if all gates pass, otherwise record concrete NO-GO evidence. (Attempted in this window; ended as documented NO-GO due to missing mandatory gates.)

## Phase 4: Evidence, Docs, And PR Prep

- [x] 4.1 Update `docs/ops/t47-controlled-pairing-execution-evidence.md` with sanitized outcome evidence only; never capture full QR, real numbers, credentials, or message bodies.
- [x] 4.2 Update `docs/project-status.md` and `docs/open-questions.md` only if the private execution exposes a real factual status or unresolved follow-up.
- [x] 4.3 Re-run final `npm run check` and `npm test`, then prepare the PR for review without adding build steps.
