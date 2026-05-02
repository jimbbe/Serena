# Deployment Preflight T03.1 [HISTÓRICO — pre-T04]

> ⚠️ Este documento describe el preflight ANTES del deploy T04. Los bloqueos de SSH, DNS y backup quedaron resueltos durante T04. Para el estado operativo actual, ver `docs/deployment-t04.md`.

T03.1 is a real operational preflight for the Hostinger VPS before a future T04 deploy. It does not deploy Serena, does not edit DNS, does not edit Caddy, and does not reload production services.

## Task Classification

- Type: DevOps / infrastructure preflight.
- Classification: L, because it inspects production VPS, DNS, reverse proxy and rollback paths.
- Branch: `chore/t03-1-vps-preflight`.

## Subagents Used

| Subagent | Scope | Result |
| --- | --- | --- |
| `vps-inventory` | VPS identity, SSH, Docker projects, ports, proxy state | Confirmed VPS and Hostinger Docker inventory; SSH auth blocked. |
| `dns-and-domain` | Hostinger DNS and public resolution | Confirmed `serena.goingmerry01.tech` is missing / NXDOMAIN. |
| `proxy-backup-and-route` | Caddy location, reload path, backup readiness, Serena route viability | Confirmed Caddy compose path and route strategy; backup blocked by SSH. |
| `compose-and-network-verify` | Proxy network and Serena compose suitability | Confirmed no host port exposure and no observed Serena name conflict; direct network inspect blocked by SSH. |
| `verification-rollback` | T04 deploy, verify, rollback and abort commands | Produced operational command set and gates for T04. |

## Confirmed VPS Facts

- Provider/API: Hostinger VPS.
- VPS ID: `1619520`.
- Hostname: `srv1619520.hstgr.cloud`.
- State: `running`.
- Template: `Ubuntu 24.04 with Docker`.
- Plan: `KVM 2`, 2 CPU, 8192 MB RAM, 102400 MB disk.
- IPv4: `177.7.32.90`.
- IPv6: `2a02:4780:75:6109::1`.
- Hostinger firewall group: none attached.
- Hostinger public keys attached to the VPS: none reported by API.
- SSH TCP port 22: reachable from the local machine.
- SSH login as `root`: failed from the local machine with the currently available credentials/keys.

Because SSH authentication failed, these are still not directly verified from the shell on the VPS:

- `docker version`
- `docker compose version`
- `docker network inspect proxy`
- full host port inventory via `ss` or equivalent
- filesystem-level backup creation under `/docker/caddy-edge`

## Hostinger Docker Inventory

Hostinger Docker Manager reports these projects on VPS `1619520`:

| Project | State | Path | Relevant ports / health |
| --- | --- | --- | --- |
| `caddy-edge` | `running` with one completed writer container | `/docker/caddy-edge/docker-compose.yml` | Publishes `80/tcp` and `443/tcp` on IPv4/IPv6. |
| `necrologia-bot` | `running` | `/docker/necrologia-bot/docker-compose.yml` | Container `necrologia-bot` is healthy and exposes `3000/tcp`. |
| `hermes-agent-m41v` | `running` | `/docker/hermes-agent-m41v/docker-compose.yml` | Publishes `127.0.0.1:8642 -> 8642/tcp`. |

No Serena project or `serena-core` container was observed.

## Caddy / Proxy State

Confirmed Caddy project path:

```text
/docker/caddy-edge/docker-compose.yml
```

The Compose file uses a `caddyfile-writer` container to generate:

```text
/config-src/Caddyfile
```

The `caddy-edge` container runs:

```text
caddy run --config /config-src/Caddyfile --adapter caddyfile
```

Current confirmed routes:

```caddyfile
necro.goingmerry01.tech {
  encode gzip
  reverse_proxy necrologia-bot:3000
}

estoicus.goingmerry01.tech {
  encode gzip
  reverse_proxy hermes-agent-m41v-hermes-agent-1:8642
}
```

The Caddy project declares external network `proxy` and named volumes `caddy_data`, `caddy_config`, and `caddyfile_config`.

Caddy logs show Caddy is running and managing TLS for `necro.goingmerry01.tech` and `estoicus.goingmerry01.tech`. Logs also show repeated `502` errors for the existing `estoicus` upstream on port `8642`; that is unrelated to Serena but should not be mixed into T04.

## DNS State

Domain: `goingmerry01.tech`.

- Status: active.
- Nameservers: `aurora.dns-parking.com`, `nebula.dns-parking.com`.

Current relevant records:

| Name | Type | Value |
| --- | --- | --- |
| `@` | A | `177.7.32.90` |
| `www` | CNAME | `goingmerry01.tech.` |
| `necro` | A | `177.7.32.90` |
| `necro` | AAAA | `2a02:4780:75:6109::1` |
| `estoicus` | A | `177.7.32.90` |
| `estoicus` | AAAA | `2a02:4780:75:6109::1` |

`serena.goingmerry01.tech` is not present in Hostinger DNS. Public `A` and `AAAA` resolution returns NXDOMAIN.

T04 must not enable the public Caddy route until DNS exists and resolves to the VPS.

## Proxy Backup Status

Backup real on the VPS was not created in T03.1.

Reason: SSH port is reachable, but SSH authentication failed. Creating a filesystem backup under `/docker/caddy-edge` requires real shell access.

Required backup command for T04 after SSH is fixed:

```sh
cd /docker/caddy-edge
CADDY_BACKUP="docker-compose.yml.bak.serena.$(date +%Y%m%d%H%M%S)"
cp docker-compose.yml "$CADDY_BACKUP"
printf '%s\n' "$CADDY_BACKUP" > .serena-caddy-backup
ls -l "$CADDY_BACKUP" .serena-caddy-backup
```

Do not edit or reload Caddy until this backup exists.

## Serena Route Viability

The route strategy remains viable:

```caddyfile
serena.goingmerry01.tech {
  encode gzip
  reverse_proxy serena-core:3000
}
```

Conditions:

- `serena.goingmerry01.tech` resolves to the VPS.
- `serena-core` is deployed as its own Compose project.
- `serena-core` is attached to the external Docker network `proxy`.
- `serena-core` listens on `0.0.0.0:3000` inside the container.
- `serena-core` does not publish host ports.

The repository template `infra/vps/docker-compose.yml` satisfies the no-host-port and `HOST=0.0.0.0` requirements by inspection, but formal `docker compose config` on the VPS is still blocked by SSH.

## T04 Preflight Gates

Do not start T04 deploy unless all gates pass.

```sh
ssh <user>@177.7.32.90
docker version
docker compose version
docker network inspect proxy
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker inspect caddy-edge --format '{{json .NetworkSettings.Networks}}'
docker ps --filter name=serena-core --format "{{.Names}}"
dig +short serena.goingmerry01.tech A
dig +short serena.goingmerry01.tech AAAA
```

Abort if:

- SSH is unavailable or lacks permissions.
- Docker or Docker Compose is unavailable.
- Network `proxy` does not exist.
- `caddy-edge` is not running or not publishing `80/443`.
- Another `serena-core` container already exists.
- `serena.goingmerry01.tech` does not point to the VPS.
- The Caddy backup is not created and recorded.

## T04 Deploy Commands

Run only after the gates pass and the repository or release artifact exists at `/docker/serena`.

```sh
cd /docker/serena
docker compose --env-file .env -f infra/vps/docker-compose.yml config
docker compose --env-file .env -f infra/vps/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/vps/docker-compose.yml ps
```

Then update `/docker/caddy-edge/docker-compose.yml` by adding the Serena route to the `caddyfile-writer` heredoc. Do not touch existing `necro` or `estoicus` routes.

Validate and reload Caddy:

```sh
cd /docker/caddy-edge
docker compose config
docker compose up -d --force-recreate caddyfile-writer
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker exec caddy-edge caddy reload --config /config-src/Caddyfile --adapter caddyfile
```

## T04 Verify Commands

```sh
docker inspect serena-core --format '{{json .NetworkSettings.Networks}}'
docker port serena-core
docker logs --tail=100 serena-core
docker run --rm --network proxy curlimages/curl:8.10.1 -fsS http://serena-core:3000/health
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker logs --tail=100 caddy-edge
curl -fsS https://serena.goingmerry01.tech/health
```

Success criteria:

- `serena-core` is running or healthy.
- `serena-core` is attached to `proxy`.
- `docker port serena-core` shows no host-published ports.
- Internal health succeeds from `proxy`.
- Caddy validates and reloads without error.
- Public HTTPS health succeeds.
- Existing Caddy routes keep working.

## T04 Rollback Commands

If app deploy fails before Caddy changes, do not touch Caddy:

```sh
cd /docker/serena
docker compose --env-file .env -f infra/vps/docker-compose.yml down
docker logs --tail=100 serena-core
```

If Caddy was changed, restore the recorded backup:

```sh
cd /docker/caddy-edge
CADDY_BACKUP="$(cat .serena-caddy-backup)"
cp "$CADDY_BACKUP" docker-compose.yml
docker compose config
docker compose up -d --force-recreate caddyfile-writer
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker exec caddy-edge caddy reload --config /config-src/Caddyfile --adapter caddyfile
docker logs --tail=100 caddy-edge
```

Then stop Serena if needed:

```sh
cd /docker/serena
docker compose --env-file .env -f infra/vps/docker-compose.yml down
```

## Final T03.1 Status

T04 is not yet a direct low-risk deploy because two hard blockers remain:

1. SSH authentication is not working from the local operator environment.
2. `serena.goingmerry01.tech` DNS does not exist.

Once those two are fixed, the Caddy route and Compose strategy are still valid and T04 can proceed through the gates above.
