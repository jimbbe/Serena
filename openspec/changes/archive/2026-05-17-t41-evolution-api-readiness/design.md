# Design: T41 — Evolution API readiness

## Technical Approach

T41 is a repo/readiness change for private VPS staging. It tightens templates, runbooks, env examples, and smoke checks around the existing `apps/gateway-wa` production adapter while preserving Clean/Hexagonal boundaries: Serena Core only sees normalized WhatsApp webhook traffic and outbound delivery through `gateway-wa`; Evolution API stays hidden behind the gateway.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Private topology | Keep `gateway-wa`, `evolution-api`, `evo-postgres`, and `redis` in `infra/vps/gateway-wa-staging/docker-compose.yml`; attach `gateway-wa` to `serena-internal` + `evolution-private`, Evolution deps only to `evolution-private`. | Public Evolution/Gateway admin routes; Core calling Evolution directly. | Matches specs, avoids public admin exposure, and keeps provider details out of Core. |
| Operator-only management | Use existing `/instances*` endpoints only through an operator-controlled private path such as SSH tunnel, Docker-network container, or explicitly approved temporary internal reachability. | End-user management, panel UI, public Caddy admin. | T41 needs readiness, not a public control plane; admin keys remain useful but are NOT a substitute for network privacy. |
| Config model | Placeholder-only `.env.example`; real `.env` only on VPS; static `routing-table.json` mounted read-only with auth values resolved from env. | Commit real env, durable admin DB, dynamic config API. | Current routing loader already supports file/env; durable config is future scope. |
| Validation | Extend non-destructive smoke/runbook around health, auth rejection, unknown route, and malformed `/send` validation. | Pair QR, send real message, delete volumes, mutate Core/Caddy. | Proves shape and private assumptions without live WhatsApp side effects. |

## Data Flow

```text
Operator (private path only)
  -> gateway-wa /instances* (x-gateway-admin-key)
  -> Evolution API over http://evolution-api:8080 on evolution-private

Evolution webhook
  -> gateway-wa /webhook/evolution (x-gateway-evo-key)
  -> routing-table instanceId lookup
  -> http://serena-core:3000/internal/webhook/whatsapp on serena-internal
  -> Serena Core channel-inbound pipeline

Serena Core outbound boundary (future live use, not T41 smoke)
  -> gateway-wa /send (x-gateway-app-key)
  -> Evolution API sendText on evolution-private
```

Target Docker topology:

```text
proxy (external): gateway-wa only if future approved routing requires it; no T41 public route
serena-internal (external): gateway-wa <-> existing serena-core
evolution-private (bridge): gateway-wa <-> evolution-api <-> evo-postgres/redis
```

No host ports are published in T41 templates; Caddy routing remains unchanged unless a later task explicitly approves it.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/t41-evolution-api-readiness/design.md` | Create | This technical design. |
| `infra/vps/gateway-wa-staging/docker-compose.yml` | Modify | Make topology comments/labels explicit if needed: no host ports, Evolution private, `gateway-wa` bridges networks. |
| `infra/vps/gateway-wa-staging/.env.example` | Modify | Keep placeholders only; document private `EVOLUTION_API_URL`, admin/app/evo keys, `SERENA_INTERNAL_TOKEN`, Evolution DB/Redis placeholders. |
| `infra/vps/gateway-wa-staging/routing-table.example.json` | Modify | Keep non-secret `instanceId -> serena-core` example and env-resolved auth. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modify | Add operator-only management path, explicit exclusions, smoke location constraints, rollback. |
| `docs/ops/t40-vps-core-readiness.md` | Modify | Clarify T41 handoff and that Core remains unchanged/no direct Evolution calls. |
| `scripts/smoke/gateway-wa-staging-smoke.ts` | Modify | Keep smoke non-destructive; avoid QR pairing and valid send delivery paths. |

## Interfaces / Contracts

- Runtime env contract stays env-based: `GATEWAY_MODE=production`, `GATEWAY_PORT`, `GATEWAY_ADMIN_KEY`, `GATEWAY_APP_KEY`, `GATEWAY_EVO_KEY`, `EVOLUTION_API_URL=http://evolution-api:8080`, `EVOLUTION_API_KEY`, `GATEWAY_ROUTING_TABLE_PATH`, `SERENA_INTERNAL_TOKEN`, Evolution Postgres/Redis placeholders.
- Management contract remains `POST/GET/DELETE /instances` and `GET /instances/:name/qr`, but T41 documentation MUST mark QR/pairing as not executed.
- Routing contract remains `instanceId -> internalWebhookUrl + auth.env`; Core receives only normalized webhook payloads.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | Env/routing examples and docs contain placeholders, no public route assumptions. | `npm run check` plus focused script/tests if added. |
| Gateway integration | Auth tiers, unknown route, malformed `/send`, routing-table behavior. | Existing `node:test` suites and smoke helper with fake/non-live inputs. |
| Ops smoke | Private reachability shape only. | Run helper from a network path that can reach `gateway-wa`; no pairing, no real send, no volume deletion. |

## Migration / Rollout

No migration required. T41 does not deploy live infrastructure. Future approved rollout should copy templates to VPS, create real `.env`/`routing-table.json`, start only staging containers, and rollback by stopping/removing gateway/Evolution staging containers while leaving Core untouched.

## Explicit Exclusions

- No real WhatsApp pairing, QR scan, number onboarding, or real message sending.
- No public admin exposure, public Caddy route, or host port publication.
- No Serena Core direct calls to Evolution API for inbound, outbound, instances, numbers, or config.
- No durable instance persistence, startup rehydration, public panel, or live VPS deployment in T41.

## Risks / Tradeoffs

- `InstanceManager` is in-memory: after `gateway-wa` restart, `/instances` may be empty while Evolution still has provider state. T41 documents this rather than solving it.
- File/env routing is simple and safe for staging, but brittle for frequent multi-number changes.
- Future persistence/rehydration should query Evolution on startup or introduce a durable gateway store before serious live multi-number operation.

## Open Questions

- [ ] Which private operator path becomes the standard for first approved staging run: SSH tunnel, Docker exec helper, or temporary internal exposure?
- [ ] Should HMAC/webhook authenticity be required before first live WhatsApp pairing?
