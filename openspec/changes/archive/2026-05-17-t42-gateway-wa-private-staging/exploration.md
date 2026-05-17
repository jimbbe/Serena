## Exploration: T42 — gateway-wa private staging on VPS

### Current State
T41 already left the repository close to private staging readiness: `apps/gateway-wa` can run in `production`, the VPS template under `infra/vps/gateway-wa-staging/` keeps `gateway-wa` + Evolution API private with no host ports, and Serena Core on VPS already exposes `POST /internal/webhook/whatsapp` behind `SERENA_INTERNAL_TOKEN`. The remaining gap is OPERATIONAL, not architectural: define a backup-first private rollout path, operator-only access path, and non-destructive smoke/rollback sequence for a first staging deployment without public admin routes, pairing, or real sends. During code review, one extra safety risk showed up: `POST /instances` currently returns `apiKey` in the response body, which is unnecessary secret exposure even in private staging.

### Affected Areas
- `infra/vps/gateway-wa-staging/docker-compose.yml` — private topology, network joins, and no-host-port constraint for the future rollout.
- `infra/vps/gateway-wa-staging/.env.example` — runtime contract for gateway/evolution keys and internal routing.
- `infra/vps/gateway-wa-staging/routing-table.example.json` — operator-managed `instanceId -> consumer` mapping.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — current operator-only deploy/smoke/rollback baseline.
- `scripts/smoke/gateway-wa-staging-smoke.ts` — current non-destructive smoke helper boundaries.
- `apps/gateway-wa/src/index.ts` — production bootstrap and route wiring that staging will exercise.
- `apps/gateway-wa/src/infrastructure/config.ts` — confirms production requires routing + Evolution runtime config.
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` — private inbound routing path from Evolution to Serena Core.
- `apps/gateway-wa/src/infrastructure/instances/manager.ts` — in-memory instance tracking; restart risk remains.
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts` — current admin response shape leaks `apiKey` on instance creation.
- `apps/core/src/bootstrap/whatsapp-webhook-handler.ts` — confirms Core remains provider-agnostic and only consumes normalized webhook traffic.
- `apps/core/src/modules/outbound-delivery/adapter/gateway-wa-delivery-port.ts` — confirms outbound stays behind the gateway boundary.

### Approaches
1. **Backup-first private VPS staging rollout** — keep T41 topology, deploy only staging containers privately, use operator-only access (SSH tunnel / Docker-network helper), and limit validation to health/auth/unknown-route/malformed-send smoke.
   - Pros: matches current architecture; respects no-public-admin rule; smallest delta from T41; supports rollback with minimal blast radius.
   - Cons: still depends on manual/operator steps; no proof of QR/pairing flow; restart durability stays unresolved.
   - Effort: Medium

2. **Private staging plus repo hardening before first rollout** — same as approach 1, but include small code/config safety fixes needed before touching VPS, especially removing `apiKey` from `POST /instances` responses and tightening the runbook around backup/rollback evidence.
   - Pros: safer first deployment; reduces secret leakage risk; converts T42 into a readiness+ops package instead of blind infra action.
   - Cons: slightly larger scope; still does not solve durable instance rehydration.
   - Effort: Medium

3. **Expose temporary admin route for easier management** — add an approved Caddy/internal route to manage `/instances*` remotely during staging.
   - Pros: easier operator UX.
   - Cons: violates the current private-only direction; increases attack surface; creates extra rollback and proxy coordination work.
   - Effort: High

### Recommendation
Choose **Approach 2**. T42 should be framed as a SAFE first private staging rollout package: do the minimal repo hardening still missing, then prepare proposal/spec/design/tasks for an operator-executed VPS deployment with explicit backups, rollback, and non-destructive smoke only. That keeps the clean boundary intact, avoids public admin exposure, and fixes the one code-level secret leak discovered during exploration BEFORE anyone touches the VPS.

### Risks
- `POST /instances` currently returns `apiKey`, which can leak an app secret to any caller that already has admin access.
- `InstanceManager` is still in-memory; restart can desync local tracking from Evolution until manual recreation/rehydration.
- No startup rehydration or durable routing persistence exists yet.
- Smoke remains intentionally non-destructive, so pairing and real delivery stay unverified after T42 explore.
- Any later VPS execution must prove backup/rollback discipline; otherwise this stops being “private staging” and becomes risky ops improvisation.

### Ready for Proposal
Yes — propose T42 as a hybrid repo+ops change: repo hardening/documentation first, then operator-approved private VPS staging execution with backups, rollback, and non-destructive smoke only; explicitly exclude public admin routes, pairing, and real sends.
