# Design: T38 — VPS Core Update and Gateway Network

## Technical Approach

T38 is a repo/runbook-only operational readiness change. The core update comes before any gateway deployment because the live VPS may still run a stale `serena-core` that lacks the authenticated `/internal/webhook/whatsapp` contract; attaching `gateway-wa` first would create a private route to an endpoint that may 404 or fail auth. The design updates/guards repo templates and documents an operator flow that refreshes only core, verifies it, and leaves gateway/Evolution/Caddy untouched.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Core before gateway | Refresh and verify `serena-core` before any gateway staging run | Deploy gateway first and troubleshoot later | Prevents routing live/staging webhooks into a stale or unauthenticated core. |
| Runtime token only | `SERENA_INTERNAL_TOKEN` is required through VPS `.env`/Compose interpolation, never Git | Commit placeholder with real value or echo token in commands | Matches internal auth hardening and avoids secret leakage. |
| Non-git fallback | Runbook supports both Git checkout and copied `/docker/serena` source tree | Assume `/docker/serena` is Git | Prior exploration found the remote path may be non-Git; safe copy/swap must be documented. |
| Core-only rebuild | Rebuild/recreate `serena-core` only, preserving `serena-postgres` and volumes | `docker compose down -v` or full stack reset | Minimizes blast radius and preserves runtime state. |
| Gateway prep only | Template `gateway-wa` attached to external `serena-internal`, but not deployed | Open ports/Caddy or pair WhatsApp in T38 | Keeps T38 within readiness boundaries and prepares private future routing. |

## Data Flow

Future approved staging flow after T38:

```text
Evolution webhook ─→ gateway-wa ── serena-internal ─→ serena-core:3000
                         │                                 │
                         └─ X-Serena-Internal-Token ───────┘
```

T38 only makes the right side safe: update core source, require token, verify `/health` and authenticated webhook. No Evolution traffic is started.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `infra/vps/docker-compose.yml` | Verify/modify | Ensure `serena-core.environment.SERENA_INTERNAL_TOKEN: ${SERENA_INTERNAL_TOKEN:?SERENA_INTERNAL_TOKEN is required}` remains present. Current repo already has this mapping. |
| `infra/vps/gateway-wa-staging/docker-compose.yml` | Verify/modify | Ensure `gateway-wa` joins external `serena-internal`; current repo already attaches it. |
| `docs/ops/t38-vps-core-update-runbook.md` | Create | Operator runbook for preflight, Git/non-Git update path, token checks, core-only rebuild, verify, and rollback. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modify | Gate future gateway staging on T38 core update and webhook verification. |

## Interfaces / Contracts

No new application interface. Existing contracts are used:

- Core requires `X-Serena-Internal-Token` on `/internal/*` and returns 401/403/500 on missing/invalid/misconfigured token.
- Gateway routing table resolves `SERENA_INTERNAL_TOKEN` from env and forwards it to `http://serena-core:3000/internal/webhook/whatsapp`.
- Compose must keep `serena-internal` external for staging gateway access to the already-deployed core network.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static | Compose token interpolation and network attachment | `docker compose --env-file .env -f infra/vps/docker-compose.yml config`; inspect staging compose. |
| Operational | Core-only refresh | Runbook preflight, preserve `.env`, rebuild only `serena-core`, inspect `ps`. |
| Verification | Updated core accepts traffic | Public `GET /health`; authenticated `POST /internal/webhook/whatsapp`; unauthenticated webhook must not count as success. |
| Regression | Repo sanity | `npm run check` if implementation changes repo files. |

## Migration / Rollout

No data migration required. Rollout is operator-driven: backup source reference, validate token without printing it, update source via Git or safe copy/swap, run `docker compose up -d --no-deps --build serena-core`, verify, and stop. Rollback restores the prior approved source/compose files, preserves `.env` and volumes, rebuilds only `serena-core`, and re-runs `/health`.

## Open Questions

- None blocking T38. Gateway deploy, Caddy exposure, Evolution pairing, and HMAC hardening remain future-task concerns.
