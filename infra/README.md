# Infrastructure

Infrastructure definitions live here.

Local development baseline from T02:

- Docker Compose
- PostgreSQL local service
- a minimal service healthcheck
- local environment instructions

Prepared VPS deployment path from T03:

- `vps/docker-compose.yml` templates `serena-core` behind the existing VPS Caddy edge.
- `vps/Caddyfile.serena.example` templates the future Serena Caddy route.

No production infrastructure is deployed or modified by these repository templates.
