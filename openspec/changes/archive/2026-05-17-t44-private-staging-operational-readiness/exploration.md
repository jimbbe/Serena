## Exploration: t44-private-staging-operational-readiness

### Current State
- Repo status is clean on `main`; T43 private staging rollout and T43A unknown-instance hardening are already archived, so T44 should start from a stable post-staging baseline.
- Private staging is already deployed operationally: `docs/ops/t42-gateway-wa-private-staging-evidence.md` records a completed private rollout for `gateway-wa`, `evolution-api`, `evo-postgres`, and `redis`, with private-only access, no host ports, no Caddy/DNS changes, and `OUTBOUND_DELIVERY_ADAPTER=fake` preserved.
- The current operational proof is intentionally limited to synthetic smoke (`/health`, auth rejection, malformed `/send`, unknown route). There is still NO approved pairing, NO real sends, and NO public/admin exposure.
- The repo still documents two important pre-live limitations: `InstanceManager` is in-memory and restart loses local tracking (`README.md`, `docs/project-status.md`, `openspec/specs/gateway-instance-management/spec.md`), and webhook authenticity/HMAC before any more live behavior is still open in `docs/open-questions.md`.
- `README.md` recommends durable gateway state/rehydration as the next engineering step, but that is an implementation milestone, not the operational milestone the T44 naming now requires.
- T43 verification left one ops-quality follow-up that fits a readiness milestone better than a product feature: add machine-checkable artifact validation for staging topology/runbook/evidence traceability.

### Affected Areas
- `docs/ops/t37-gateway-wa-staging-runbook.md` — current operator runbook; likely source for formal handoff and go/no-go gates.
- `docs/ops/t42-gateway-wa-private-staging-evidence.md` — current rollout ledger; strongest evidence source for a readiness decision.
- `docs/project-status.md` — canonical state summary; should reflect the chosen operational milestone and explicit blocked next steps.
- `README.md` — currently points to durability/rehydration next; may need wording that separates T44 operational gate from later engineering follow-up.
- `docs/open-questions.md` — holds unresolved pre-live decisions (`HMAC`, private-vs-public admin future, durability timing) that T44 should triage into explicit gates instead of leaving fuzzy.
- `openspec/specs/gateway-private-staging-ops/spec.md` — current private rollout contract; likely basis for extending from rollout proof to readiness/go-no-go proof.
- `openspec/specs/gateway-instance-management/spec.md` — documents the restart limitation and operator-only boundaries that any T44 recommendation must preserve.
- `scripts/smoke/gateway-wa-staging-smoke.ts` — current safe smoke boundary; useful reference for what evidence already exists and what T44 should NOT expand into.
- `package.json` / `scripts/tests/` — likely location if T44 adds repo-side machine checks for runbook/evidence/guardrail traceability.

### Approaches
1. **Operational readiness gate + operator handoff** — define T44 as a repo-only milestone that converts the existing private staging rollout into a reviewable go/no-go package: explicit readiness criteria, blocked next steps, operator handoff checklist, and machine-checkable validation of topology/runbook/evidence artifacts.
   - Pros: matches the new T44 requirement as an operational milestone, stays repo-only, is highly reviewable, and turns current implicit guardrails into explicit decision gates.
   - Cons: does not solve restart durability yet; requires discipline to avoid quietly expanding into pairing/public exposure.
   - Effort: Medium.

2. **Gateway durability + rehydration milestone** — use T44 for implementing instance/config persistence and startup rehydration.
   - Pros: aligns with `README.md`'s stated next engineering recommendation and addresses the most concrete runtime limitation.
   - Cons: this is an engineering feature, not an operational milestone; larger scope; less appropriate for the renamed T44 intent.
   - Effort: High.

3. **First live operator drill** — use T44 to validate pairing/QR or bounded end-to-end routing with a real instance.
   - Pros: strongest runtime proof.
   - Cons: wrong timing. It collides with the current no-pairing/no-real-send guardrails, depends on unresolved HMAC/exposure policy, and is not safe as the immediate post-staging milestone.
   - Effort: High.

### Recommendation
Use **Approach 1**. The repository already proved that private staging can be deployed safely; what is MISSING now is an explicit operational gate that says what this staging environment is ready for, what it is NOT ready for, and what must happen before the next risky step. T44 should therefore be a **post-staging operational readiness / go-no-go / operator-handoff** change, not another narrow hardening fix and not yet the durability implementation itself.

Concretely, the proposal should frame T44 around:
- codifying a private-staging readiness checklist and go/no-go decision record;
- documenting operator handoff boundaries and rollback ownership;
- adding machine-checkable repo validation for staging topology/runbook/evidence consistency;
- explicitly gating future actions such as pairing, public/admin exposure, and real outbound delivery;
- recording durable gateway state/rehydration and HMAC authenticity as required follow-up milestones, not hidden assumptions.

### Risks
- If T44 tries to implement persistence/rehydration now, it stops being an operational milestone and scope will sprawl.
- If T44 tries to include pairing, public routes, or real sends, it will violate the current safe-stage guardrails and blur the purpose of the gate.
- If T44 is reduced to only one extra validation script, it becomes too small and fails the explicit “milestone, not hardening fix” requirement.
- The repo must clearly separate “staging is operationally ready for private operator use” from “system is ready for live WhatsApp onboarding,” because those are NOT the same thing.

### Ready for Proposal
Yes — but the proposal should explicitly define T44 as a **repo-only operational readiness milestone** for post-private-staging review and handoff. It should avoid runtime mutation, pairing, real sends, public exposure, and persistence implementation; those belong to later approved tasks.
