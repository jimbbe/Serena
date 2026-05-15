# Exploration: t38-fix-webhook-probe-contract

## Current State

`apps/core/src/bootstrap/whatsapp-webhook-handler.ts` already defines the real Serena Core webhook contract: it requires `senderWhatsAppId`, `text`, and strict UTC `receivedAt`, maps them to the channel-agnostic inbound command, and returns `200 { received: true, routedTo: "serena-core", result }` on success. The repo drift is in T38 operational artifacts, not in runtime behavior: `docs/ops/t38-vps-core-update-runbook.md` still probes with legacy fields `from` and `timestamp` and expects `routedTo: "channel-inbound"`, while `scripts/tests/t38-readiness-validation.test.ts` only checks that an authenticated probe exists, not that it matches the real contract.

The main OpenSpec source of truth is already aligned with the code. `openspec/specs/whatsapp-inbound-webhook/spec.md`, `openspec/specs/internal-auth/spec.md`, the core HTTP tests, and the gateway contract docs all point to `senderWhatsAppId`, `receivedAt`, and `routedTo: "serena-core"`. That means this fix should stay repo-only and documentation/test-focused unless new evidence appears.

## Affected Areas

- `docs/ops/t38-vps-core-update-runbook.md` — must send the real webhook payload shape and expect the real success response.
- `scripts/tests/t38-readiness-validation.test.ts` — must validate the exact probe contract, not just the presence of auth and a negative check.
- `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` — inspect as the source of truth; no behavior change currently justified.
- `apps/core/src/bootstrap/tests/whatsapp-webhook-http.test.ts` — inspect as executable contract evidence; likely no edit needed if behavior stays unchanged.
- `openspec/specs/whatsapp-inbound-webhook/spec.md` — confirm it is already correct; no spec change currently needed.
- `openspec/specs/internal-auth/spec.md` — confirm authenticated success contract is already correct; no spec change currently needed.

## Approaches

1. **Doc + validation alignment only** — update the T38 runbook probe payload/expectation and strengthen `validate:t38` to assert the exact webhook contract.
   - Pros: minimal blast radius, matches current code/spec truth, fixes the real false-positive gap in repo validation.
   - Cons: does not change runtime code, so it depends on current handler staying the source of truth.
   - Effort: Low

2. **Change core handler to accept both legacy and current probe fields** — add compatibility for `from`/`timestamp` or return `channel-inbound`.
   - Pros: could make the stale runbook pass without touching docs.
   - Cons: wrong direction; it weakens a clear contract, conflicts with current specs/tests/docs, and expands behavior for an ops-doc bug.
   - Effort: Medium

3. **Update docs, validation, and main specs anyway** — touch the runbook plus restate the same contract in specs.
   - Pros: explicit paperwork refresh.
   - Cons: redundant churn; main specs already match code, so this adds noise without changing source-of-truth behavior.
   - Effort: Low/Medium

## Recommendation

Use **Approach 1**.

The minimal T38-fix is to treat `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` and its HTTP tests as the contract authority, then align the stale T38 runbook and `validate:t38` with that authority. The probe body should use `senderWhatsAppId` and `receivedAt`, and the expected success marker should be `routedTo: "serena-core"`. No code behavior change is warranted from the evidence reviewed.

For the next phases, proposal/spec/tasks should explicitly frame this as a **repo artifact correctness fix**: repair the operational probe example and close the validation blind spot that let the mismatch pass.

## Risks

- `validate:t38` currently gives false confidence; if only the runbook is updated and validation is not strengthened, the drift can reappear.
- The archived T38 change may still contain the stale wording as historical audit material; the fix should target active repo artifacts, not rewrite history casually.
- If any external operator copied the stale probe command already, they may still run the wrong payload unless the runbook update is called out clearly in proposal/docs.

## Ready for Proposal

Yes — scope is clear and bounded. The next phase should propose a repo-only fix for the T38 probe contract drift, with no VPS execution and no runtime behavior changes unless new evidence appears.
