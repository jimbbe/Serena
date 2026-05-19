## Exploration: t45-controlled-pairing-readiness

### Current State
- T44 already closed the private staging review as **GO for T45 planning only**. The repo explicitly keeps pairing, real sends, public/admin exposure, HMAC rollout, durable state rollout, and VPS/Docker mutation blocked in `docs/ops/t44-private-staging-readiness.md`.
- The gateway already has the technical surface needed for a later rehearsal: private operator-only instance management (`POST /instances`, `GET /instances`, `GET /instances/:name/qr`, `DELETE /instances/:name`), Evolution webhook routing, `connection.update` state handling, and token-protected forwarding to Serena Core.
- Two runtime realities are already documented and matter for planning: `InstanceManager` is still in-memory (`openspec/specs/gateway-instance-management/spec.md`), and routing/auth today rely on VPS-only runtime config (`infra/vps/gateway-wa-staging/.env.example`, `routing-table.example.json`) rather than repo-stored secrets or numbers.
- Existing operational proof is intentionally synthetic only: T43/T44 allowed health/auth/unknown-route/malformed-send checks, but never QR onboarding, real WhatsApp pairing, or real outbound delivery.
- The user decisions now narrow the planning space: allowed WhatsApp numbers belong in private runtime config, pairing happens in a later controlled rehearsal task, evidence must capture a minimal operational audit trail without secrets, and HMAC is deferred as a hardening milestone rather than a blocker for the first private rehearsal.

### Affected Areas
- `docs/ops/t44-private-staging-readiness.md` — current boundary artifact that T45 must extend without authorizing runtime mutation.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — source for operator-only staging procedures and current smoke boundaries.
- `docs/open-questions.md` — still holds the exact T45 planning questions that now need to be closed or narrowed.
- `docs/project-status.md` — canonical summary of what T45 means and what stays blocked after it.
- `openspec/specs/gateway-instance-management/spec.md` — documents pairing surface and the restart/rehydration limitation that T46 must explicitly accept.
- `openspec/specs/gateway-webhook-receiver/spec.md` — documents private inbound routing/token assumptions that remain part of the rehearsal safety case.
- `infra/vps/gateway-wa-staging/.env.example` and `infra/vps/gateway-wa-staging/routing-table.example.json` — existing runtime-config placeholders that show the right home for allowlist/routing decisions, without committing real numbers.
- `scripts/tests/t44-private-staging-readiness.test.ts` / future T45 validation script — likely place for repo-only guardrail checks if T45 adds machine-checkable planning artifacts.

### Approaches
1. **Repo-only pairing readiness gate** — define T45 as a documentation/spec/validation milestone that closes the decisions required before T46 can run a controlled pairing rehearsal.
   - Pros: matches the stated boundary, keeps runtime untouched, resolves operator/evidence/risk-acceptance questions, and creates a clean approval surface for T46.
   - Cons: does not itself prove live behavior; discipline is required so the artifact does not silently authorize pairing execution.
   - Effort: Medium.

2. **Implement runtime config and audit plumbing in T45** — add allowlist loading, rehearsal logging schema, or code-side readiness hooks now.
   - Pros: moves technical work earlier and may reduce T46 implementation risk.
   - Cons: WRONG milestone. It mixes planning with implementation, touches business/runtime behavior, and collides with the explicit repo-only requirement.
   - Effort: High.

3. **Skip directly to pairing rehearsal** — treat existing staging plus T44 as enough and execute QR onboarding in the next task without a separate readiness gate.
   - Pros: fastest path to live proof.
   - Cons: weak governance. It leaves first-number ownership, operator/reviewer roles, evidence shape, abort triggers, restart-risk acceptance, and post-pairing forbidden actions too implicit.
   - Effort: Medium.

### Recommendation
Use **Approach 1**.

T45 should be a **repo-only controlled pairing readiness gate**. Its job is NOT to pair a device and NOT to implement runtime behavior. Its job is to make T46 boring and explicit by closing the decisions that are currently still fuzzy.

Concretely, T45 should define:
- the operator/reviewer roles for pairing approval, execution, abort, rollback, and evidence recording;
- the private runtime-config contract for the first allowed WhatsApp numbers/instance mapping, while keeping real values out of Git;
- the minimal evidence ledger required for T46 (`timestamp`, `instanceId`, `sender/personId`, `messageId`, pipeline decision, selected action, sent/not sent, error, operator notes) and explicit redaction rules;
- the bounded risk acceptance for **no HMAC yet** and **in-memory instance state**, including the exact abort/rollback conditions if restart or webhook trust assumptions are violated;
- the explicit non-actions that remain blocked even after T45 (real sends by default, public/admin exposure, Caddy/DNS/host-port changes, secret changes, production use);
- a short runway after T45 that fits the user's cap: **T46 pairing rehearsal**, **T47 first controlled inbound mediation rehearsal**, **T48 hardening/decision gate before any sustained or broader use**.

### Risks
- If T45 adds code/runtime behavior, it stops being the decision gate the repo currently needs.
- If T45 wording is sloppy, reviewers may misread it as approval for pairing execution instead of approval to PREPARE T46.
- Allowlist planning can drift into hidden product policy unless the change stays limited to runtime-config ownership, format, and review responsibility.
- HMAC deferral is acceptable only while gateway/admin remain private, the core stays token-protected, the allowlist stays closed, and auto-send remains disabled; if any of those assumptions change, the safety case collapses.
- In-memory instance tracking remains a real operational risk: a restart during or after rehearsal can desync local tracking, so T46 must treat restart as an abort/revalidate event unless explicitly handled.

### Ready for Proposal
Yes — propose T45 as a repo-only readiness artifact set for controlled pairing, with no runtime mutation and no live pairing. The proposal should make T46 the first task allowed to execute QR/pairing under explicit approval, evidence, and abort rules.
