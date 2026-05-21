## Exploration: t46-controlled-pairing-rehearsal

### Current State
- T45 closed as **GO for T46 planning only**, not as blanket approval for live execution. The repo explicitly keeps blocked: real sends, public/admin exposure, host ports, Caddy/DNS changes, secret changes, PostgreSQL rollout, HMAC rollout, durable-state rollout, and sustained/public use.
- The runtime surface for a private rehearsal already exists in real code: `apps/gateway-wa/src/infrastructure/instances/handlers.ts` exposes operator-only instance create/list/QR/delete flows, `apps/gateway-wa/src/infrastructure/instances/manager.ts` stores instance state in-memory only, and `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` routes inbound webhooks privately to Serena Core while preserving fail-closed unknown-instance behavior.
- T43/T44/T45 evidence shows the current staging posture is still private-only, with no host ports, no Caddy/DNS mutation, and `OUTBOUND_DELIVERY_ADAPTER=fake` preserved in Core.
- That means T46 is **conditionally ready**: safe to proceed only as a tightly bounded operator rehearsal with immediate live revalidation. It is **NO-GO** if operator/reviewer presence, route/allowlist revalidation, evidence setup, or restart-free stability cannot be confirmed at execution time.

### Affected Areas
- `docs/ops/t45-controlled-pairing-readiness.md` — canonical gate that defines T46 activation conditions and abort triggers.
- `docs/ops/t44-private-staging-readiness.md` — upstream boundary document that T46 must not broaden.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — private-path operational discipline and forbidden actions baseline.
- `docs/ops/t42-gateway-wa-private-staging-evidence.md` — latest runtime evidence baseline proving private-only rollout and fake outbound posture.
- `openspec/specs/gateway-instance-management/spec.md` — operator-only pairing surface, runtime-owned allowlist decision, and restart invalidation rules.
- `openspec/specs/controlled-pairing-readiness/spec.md` — T45/T46 readiness rules, evidence minimums, and non-actions.
- `openspec/specs/gateway-webhook-receiver/spec.md` — unknown-instance fail-closed routing and private webhook assumptions.
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts` — real create/list/QR/delete endpoint behavior for the rehearsal path.
- `apps/gateway-wa/src/infrastructure/instances/manager.ts` — confirms the material risk: local instance tracking is in-memory and restart-sensitive.
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` — confirms inbound routing depends on valid runtime routing/auth and already fails closed for unknown routes.
- `apps/core/src/config/env.ts` — confirms Core outbound remains safely controllable and defaults to `fake`.
- `apps/gateway-wa/src/infrastructure/config.ts` — confirms production runtime depends on env-only config and can use routing-table mode without committing secrets.

### Approaches
1. **Code/docs/tests only** — stop at repo artifacts, validators, and runbook/evidence preparation.
   - Pros: zero live risk during T46.
   - Cons: DOES NOT satisfy the stated intent of a first controlled pairing rehearsal; it would just repeat T45-style planning.
   - Effort: Medium.

2. **Runtime execution only** — skip artifact tightening and just perform the private pairing rehearsal under existing docs.
   - Pros: fastest path to live proof.
   - Cons: too loose. Evidence shape, abort handling, and review accountability remain under-specified for a real first rehearsal.
   - Effort: Medium.

3. **Bounded hybrid rehearsal** — add the minimum repo artifacts for authorization/evidence, then allow one operator-only runtime pairing rehearsal only after all gates are revalidated live.
   - Pros: matches T46 intent, preserves fail-closed governance, and keeps runtime scope narrow.
   - Cons: requires discipline so the task does not drift into real-send enablement, public exposure, or general operational rollout.
   - Effort: High.

### Recommendation
Use **Approach 3 — bounded hybrid rehearsal**.

T46 should include a **small repo-side artifact package plus a strictly bounded runtime execution window**. NOT because we like paperwork, but because this is the FIRST live pairing step and the risk is operational, not just technical.

Exact runtime actions that are in scope for T46:
- revalidate private-only access path and operator/reviewer presence;
- revalidate runtime routing/allowlist ownership for exactly one approved instance/number pair without committing real values;
- confirm `OUTBOUND_DELIVERY_ADAPTER=fake` is still in effect before and after rehearsal;
- perform one private QR/pairing attempt for the approved operator-held account;
- observe and record instance state transition evidence (`disconnected/connecting/open/connected`) through the existing operator-only instance/webhook path;
- verify that no public exposure, host ports, Caddy/DNS changes, real send flow, or secret printing occurred;
- stop and record outcome, including abort if any live gate breaks.

Out of scope even in T46:
- productive or repeated use;
- real outbound send rehearsal;
- public/admin exposure;
- Caddy/DNS/host-port changes;
- secret rotation/printing/committing;
- PostgreSQL/HMAC/durable-state rollout;
- broad cleanup/refactor unrelated to the rehearsal.

Repo-side evidence should be recorded in a new canonical ops ledger for T46 (recommended path: `docs/ops/t46-controlled-pairing-rehearsal.md`) plus the normal OpenSpec change artifacts. That ledger should record sanitized attempt-by-attempt evidence only: timestamps, sanitized instance identifier, actor role, pairing phase reached, connection state observed, fake-outbound confirmation, abort reason if any, and reviewer/operator sign-off. QR values, phone numbers, tokens, message bodies, and credentials must be omitted or redacted.

### Risks
- **Restart invalidation risk**: `InstanceManager` is in-memory; any `gateway-wa` or Evolution restart during rehearsal invalidates readiness and forces abort/revalidation.
- **Config drift risk**: routing-table or allowlist mismatch can make the rehearsal pair the wrong instance or fail closed unexpectedly.
- **Scope creep risk**: the moment T46 tries to include real sends, public exposure, or infra mutation, the safety case collapses.
- **Evidence weakness risk**: if the first live rehearsal is not captured in a canonical sanitized ledger, later approval decisions will be guesswork.
- **Deferred hardening risk**: no HMAC and no durable rehydration remain acceptable ONLY for a one-off private rehearsal, not beyond it.

### Ready for Proposal
Yes — but only for a proposal that defines T46 as a bounded hybrid change: docs/tests/validation for authorization + evidence, and a single explicit operator-only runtime rehearsal gated by live revalidation. If the user wants code/docs-only with no runtime step, that should be reframed as a different, narrower task.
