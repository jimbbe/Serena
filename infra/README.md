# Infrastructure

Infrastructure definitions live here.

## Local development (T02)

- Docker Compose
- PostgreSQL local service
- a minimal service healthcheck
- local environment instructions

## VPS deployment (T03 → T04)

- `vps/docker-compose.yml` — active template for `serena-core` + `serena-postgres` behind the existing VPS Caddy edge. Deployed to `/docker/serena` on VPS (T04).
- `vps/Caddyfile.serena.example` — templates the active Serena Caddy route `serena.goingmerry01.tech → serena-core:3000`.

The VPS stack is deployed and healthy since T04. See `docs/deployment-t04.md` for the operational runbook.
