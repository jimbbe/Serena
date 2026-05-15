# Tasks: T38 Fix Webhook Probe Contract

## Phase 1: Runbook Contract Alignment

- [x] 1.1 Update `docs/ops/t38-vps-core-update-runbook.md` authenticated webhook probe JSON to use `senderWhatsAppId` and `receivedAt`.
- [x] 1.2 Update the negative probe body in the same runbook to the same Core webhook fields; keep token handling secret-safe.
- [x] 1.3 Change the expected success text to `received: true` and `routedTo: "serena-core"`; remove any `channel-inbound` success wording.

## Phase 2: Validation Hardening

- [x] 2.1 Strengthen `scripts/tests/t38-readiness-validation.test.ts` to assert both positive and negative probe bodies include the required Core fields: `instanceId`, `messageId`, `senderWhatsAppId`, `text`, and `receivedAt`.
- [x] 2.2 Add negative assertions that the T38 runbook probe bodies do not use legacy `from` or `timestamp`, while still allowing optional `provider`.
- [x] 2.3 Add an assertion that the expected authenticated webhook result is pinned to `routedTo: "serena-core"` and never `channel-inbound`.

## Phase 3: Verification

- [x] 3.1 Run `npm run validate:t38` and fix only repo text/test drift until the contract checks pass.
- [x] 3.2 Run `npm run check`; run `npm test` if it is feasible in the current workspace state.
- [x] 3.3 Confirm no runtime behavior files in `apps/core` changed; if evidence appears, stop and reassess scope.

## Phase 4: Cleanup / Archive Handoff

- [x] 4.1 Keep OpenSpec change artifacts aligned for the next phase (`proposal.md`, `design.md`, `specs/`, this `tasks.md`).
- [x] 4.2 Leave archive sync for the archive phase unless verification reveals a documentation adjustment is needed.
