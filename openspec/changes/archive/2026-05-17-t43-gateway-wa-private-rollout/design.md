# Design: T43 Gateway WA Private Rollout

## Technical Approach

T43 turns the existing `infra/vps/gateway-wa-staging/` template into an operator-run private VPS rollout. Implementation is documentation/runbook/evidence oriented: update the staging compose/env/runbook/evidence shape, then execute only from an approved VPS session. No code path changes are required in `apps/gateway-wa`; it already exposes `/health`, tiered auth, `/send` validation, and safe `routing_not_configured` webhook behavior.

Target VPS layout:

```text
/docker/serena-gateway-wa-staging/
  docker-compose.yml
  .env                  # real values, VPS only, never printed
  routing-table.json     # real routing, VPS only
  evidence/
    t43-<timestamp>.md   # sanitized operator evidence
```

Compose project name SHOULD be `serena-gateway-wa-staging`. Services: `gateway-wa`, `evolution-api`, `evo-postgres`, `redis`. Networks: existing `serena-internal` for Core webhook reachability and private `evolution-private` for Evolution dependencies. The existing `proxy` network attachment should be removed unless needed by an approved future public route; T43 has no Caddy route and no host `ports:`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Private-only access | Use Docker-internal operator path, e.g. helper container on the private network; SSH tunnel only documented fallback | Caddy route, DNS, host port | Meets fail-closed spec and avoids a new public/admin surface. |
| Outbound adapter | Keep Core `OUTBOUND_DELIVERY_ADAPTER=fake` | Enable gateway adapter for live delivery | T43 proves runtime wiring, not product auto-send. Real delivery needs separate approval. |
| Secrets | Create/update `.env` only on VPS with redacted evidence | Commit generated `.env`, paste values in logs | Existing config reads env; repo remains placeholders-only and no secret value is printed. |
| Backup | Backup staging directory/config before mutation; preserve volumes by default | `docker compose down -v`, whole-VPS destructive restore | Scope is staging-only; data deletion is explicitly out of scope. |
| Deferred hardening | Defer HMAC, pairing, QR/admin exposure, public route | Add before first private rollout | T43 smoke is synthetic and private; these belong to later public/live onboarding tasks. |

## Data Flow

```text
Operator helper ──private HTTP──> gateway-wa:3001
                                  ├─ /health, /send validation
Evolution API ──private webhook──> /webhook/evolution
                                  └─ route serena-main
                                     └─ serena-core:3000/internal/webhook/whatsapp
```

Smoke MUST NOT create/pair instances, request QR, or send real messages.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `infra/vps/gateway-wa-staging/docker-compose.yml` | Modify | Enforce no host ports and private networks; remove/justify `proxy` membership for T43. |
| `infra/vps/gateway-wa-staging/.env.example` | Modify | Add T43 comments: placeholders only, production mode, required keys, fake outbound stays in Core. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modify | Add T43 rollout, backup, private smoke, secret update, rollback, and abort rules. |
| `docs/ops/t42-gateway-wa-private-staging-evidence.md` | Modify | Convert/extend to T43 evidence ledger with backup/smoke/result/non-actions. |
| `docs/project-status.md` | Modify | Record T43 status after execution/deferral. |
| `docs/open-questions.md` | Modify | Keep HMAC, pairing/public exposure, durable gateway state as future questions if still unresolved. |

## Interfaces / Contracts

Evidence file shape:

```md
# T43 Gateway WA Private Rollout Evidence
- Status: completed | aborted | deferred
- Operator/session timestamp:
- Backup path: /docker/backups/...
- Rollout scope: compose path, project name, services
- Private-only proof: no ports, no Caddy/DNS diff, operator path used
- Secrets posture: values created/updated on VPS; no values printed
- Smoke results: health, auth rejection, unknown route, malformed /send
- Rollback commands: staging-scoped, volumes preserved
- Explicit non-actions: no Caddy/DNS/public route/host ports/pairing/real send/secret print/volume deletion
```

Secret update strategy: copy `.env.example` to `.env` on VPS if missing; otherwise edit keys in place using commands that do not echo values. Validate presence with key names only (`KEY=<redacted>`), never `cat .env` in logs.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static | Compose has no `ports:` and no public routing requirement | Review/runbook checklist; `docker compose config` from VPS. |
| Smoke | Health, protected auth rejection, unknown route, malformed `/send` | Run `scripts/smoke/gateway-wa-staging-smoke.ts` from private helper path. |
| Regression | Existing gateway contracts | `npm run check` before PR; no build required by local rule. |

## Migration / Rollout

No data migration required. Rollout sequence: confirm T40 evidence; create backup; prepare `.env`/`routing-table.json`; `docker compose config`; `docker compose up -d`; inspect `ps`/networks/no ports; run private smoke; update evidence/docs. Rollback: `docker compose stop` or `down` for staging project only, preserve named volumes, restore staged files from backup if needed, and verify Core/Caddy/DNS unchanged.

## Open Questions

- [ ] None block T43. HMAC, pairing, public exposure, and durable gateway state remain deferred by design.
