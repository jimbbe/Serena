## Exploration: t43-gateway-wa-private-rollout

### Current State
- `apps/gateway-wa` already supports real `production` mode with private Evolution API calls, webhook routing by `instanceId`, 3-tier API keys, `/send`, and `connection.update` state sync.
- T37 prepared the repo-only staging stack in `infra/vps/gateway-wa-staging/` with `gateway-wa`, `evolution-api`, `evo-postgres`, `redis`, private network boundaries, and no host ports.
- T41 locked the intended operating model: Evolution API stays private, `gateway-wa` is the only adapter allowed to call it, and admin access is operator-only.
- T40 already updated the real VPS Serena Core runtime and verified `POST /internal/webhook/whatsapp` with `SERENA_INTERNAL_TOKEN`; this is a hard runtime dependency even though it is outside the requested predecessor list.
- T42 hardened `POST /instances` so success responses do not leak credential-like fields and tightened the runbook/evidence model for backup-first, fail-closed, private-only rollout.
- Live gateway staging is still NOT deployed on the VPS.

### Affected Areas
- `infra/vps/gateway-wa-staging/docker-compose.yml` — canonical private staging topology to be deployed.
- `infra/vps/gateway-wa-staging/.env.example` — required runtime secret/config shape; real `.env` must exist only on VPS.
- `infra/vps/gateway-wa-staging/routing-table.example.json` — expected `serena-main -> serena-core` routing contract.
- `docs/ops/t37-gateway-wa-staging-runbook.md` — rollout guardrails, smoke scope, rollback boundaries, evidence requirements.
- `docs/ops/t42-gateway-wa-private-staging-evidence.md` — current evidence baseline and explicit deferral record.
- `docs/ops/t40-vps-core-readiness.md` — confirms Core webhook/token readiness required before rollout.
- `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` — fail-closed unknown-route behavior and internal webhook forwarding.
- `apps/gateway-wa/src/infrastructure/messages/sender.ts` — `/send` validation and stale-state fallback behavior relevant to non-destructive smoke.
- `apps/gateway-wa/src/infrastructure/instances/handlers.ts` — safe `POST /instances` response contract hardened in T42.

### What T43 Should Deploy Privately
- A VPS staging Compose project based on `infra/vps/gateway-wa-staging/docker-compose.yml`.
- Containers: `gateway-wa`, `evolution-api`, `evo-postgres`, and `redis`.
- Networks:
  - `gateway-wa` attached to `serena-internal` and `evolution-private`.
  - Evolution dependencies attached ONLY to `evolution-private`.
  - No Caddy route and no host `ports:` publication.
- Runtime files created only on VPS:
  - private `.env`
  - private `routing-table.json`
- Allowed functional target:
  - private health/auth/routing/payload-validation smoke only.
- Explicitly NOT part of T43 rollout:
  - Caddy exposure
  - DNS changes
  - public admin surface
  - WhatsApp pairing/QR onboarding
  - real outbound delivery
  - Docker volume deletion
  - printing or committing secrets

### Preconditions
- **From T37**
  - Private staging template exists and already models the intended four-container stack.
  - Routing-table support exists in `gateway-wa` and unknown routes fail safely with `routing_not_configured`.
  - Smoke helper exists for non-destructive checks.
- **From T41**
  - Architecture decision is explicit: Evolution API is private and Core never calls it directly.
  - Operator-only management path is required.
  - Restart limitation is documented: `InstanceManager` is in-memory and restart loses local tracking.
- **From T42**
  - `POST /instances` no longer leaks credentials.
  - Runbook requires backup-first, rollback steps, private-only operator path, and explicit non-actions.
  - Evidence file already records that live rollout was intentionally deferred pending an approved private VPS session.
- **Critical discovered dependency from T40**
  - Real VPS `serena-core` must already be updated and verified on `POST /internal/webhook/whatsapp` with `SERENA_INTERNAL_TOKEN`; otherwise T43 cannot validate private inbound routing safely.

### Approaches
1. **Private Docker-network operator path** — run smoke from an approved helper container or `docker exec` path inside the VPS networks.
   - Pros: no host exposure, strongest alignment with T41/T42 guardrails, easiest to keep Caddy/DNS untouched.
   - Cons: operator ergonomics are worse; requires Docker-level access on the VPS.
   - Effort: Medium.

2. **SSH tunnel to gateway-wa for operator-only checks** — temporary local tunnel to the private gateway service without creating public routing.
   - Pros: workable if helper-container flow is awkward; still avoids public DNS/Caddy.
   - Cons: easier to misconfigure, evidence must prove the tunnel stayed operator-only, and the team must be careful not to normalize host exposure as a pattern.
   - Effort: Medium.

### Recommendation
Use **Approach 1** as the default T43 rollout plan: deploy the private staging stack and execute smoke from inside the private Docker context. That keeps the architecture honest. If you need a tunnel, use it only as an explicitly documented fallback and keep it temporary.

### Guardrails
- No Caddy changes.
- No DNS changes.
- No public admin route for `gateway-wa` or Evolution API.
- No host port publication.
- No WhatsApp pairing or QR onboarding.
- No real outbound sends.
- No secrets printed to terminal, logs, artifact files, or commits.
- No Docker volume deletion (`down -v` is out).
- No mutation of `serena-core` beyond consuming the already-ready internal webhook.
- If any validation step requires public exposure or destructive action, rollout MUST fail closed and stop.

### Candidate Smoke Checks
1. `GET /health` over a private/operator-only path returns `200`.
2. `POST /instances` without admin key returns `401`.
3. `POST /send` without app key returns `401`.
4. `POST /send` with valid app key but malformed payload returns `400`.
5. `POST /webhook/evolution` with unknown `instanceId` returns `200` with `{ ignored: true, reason: "routing_not_configured" }`.
6. Private reachability proof: service is reachable only through operator-approved internal path, not via public DNS/Caddy.
7. Optional bounded routing check: known `instanceId=serena-main` reaches Serena Core internal webhook or an approved internal stub WITHOUT pairing and WITHOUT sending a real WhatsApp message.
8. Sanitized log review proves no secret material was emitted.

### Evidence Requirements
- Absolute path of the pre-mutation backup taken before any rollout action.
- Exact rollout scope: which files were copied/generated on VPS and which containers were started.
- `docker compose ps` / health status evidence for staging services.
- Smoke results with timestamps and sanitized command/output snippets.
- Proof of private-only access path used for checks.
- Rollback commands prepared before mutation and confirmed to target staging services only.
- Explicit non-actions list: no Caddy, no DNS, no public admin, no pairing, no real sends, no secrets printed/committed, no volume deletion.

### Risks
- `InstanceManager` is in-memory, so a restart can desynchronize local instance visibility from Evolution state.
- Accidental operator drift toward public exposure is the main operational risk; the temptation will be to “just open a port.” DON’T.
- Optional known-route smoke can blur into live behavior if it hits a real instance or real send path; the scope must stay synthetic and non-destructive.
- If Serena Core outbound is switched from `fake` too early, future app flows could hit `/send` unexpectedly; rollout should avoid enabling live outbound delivery in T43 unless separately approved.

### Rollback Considerations
- Rollback must target only the staging gateway stack.
- Stop/remove staging containers only; keep `serena-core`, `serena-postgres`, Caddy, and DNS untouched.
- Restore from the recorded pre-mutation backup if config/state must be reverted.
- Do not delete `evo-postgres` or Redis volumes during rollback; preserve them unless a separate destructive task is approved.
- Re-run the same private smoke checks after rollback to prove the environment is back to the intended state.

### Open Questions
- Which operator path becomes the standard for T43 evidence: helper container/`docker exec` or SSH tunnel?
- Should the optional known-route smoke hit real Serena Core or a temporary internal stub to reduce ambiguity further?
- Must `OUTBOUND_DELIVERY_ADAPTER` remain `fake` during T43 rollout, or is a gateway-backed outbound config allowed as long as no real send is exercised?
- Is HMAC webhook authenticity still deferred until before first pairing/public exposure, or does the operator want it as a pre-live hard gate?

### Ready for Proposal
Yes — bounded enough for `/sdd-propose`. The proposal should keep T43 strictly as a **private VPS rollout + non-destructive validation** task, with backup-first evidence and fail-closed rules.
