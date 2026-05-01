# Deployment Path T03

T03 only prepares the deployment path for `serena-core`. It does not deploy to production, modify the VPS, change DNS, or connect a real database.

## Confirmed VPS Facts

- Hostinger reports one running VPS: `srv1619520.hstgr.cloud` (`177.7.32.90`, IPv6 `2a02:4780:75:6109::1`) using the Ubuntu 24.04 with Docker template.
- The VPS already runs a `caddy-edge` Docker project at `/docker/caddy-edge/docker-compose.yml`.
- `caddy-edge` owns public ports `80` and `443` and uses the external Docker network named `proxy`.
- Existing Caddy routes are for `necro.goingmerry01.tech` and `estoicus.goingmerry01.tech`; do not change them during T03.
- `necrologia-bot` is running and healthy on the shared `proxy` network.
- No Serena Docker project or container was observed.
- No DNS record for `serena.goingmerry01.tech` was observed; treat it as the candidate future hostname, not as an active route.
- The current app service is `serena-core` and listens on container port `3000`.

Not verified by SSH in T03:

- exact Docker and Docker Compose versions on the VPS
- current network and volume inventory
- SSH access method and attached keys
- exact active Caddyfile host path/editing method beyond the observed generated `/config-src/Caddyfile` inside the Caddy container

## Proposed Strategy

- Publish `serena-core` later as its own Docker Compose project attached to the external `proxy` network.
- Do not publish host ports from `serena-core`; Caddy should reach it by container name on the shared network.
- Route Caddy later from `serena.goingmerry01.tech` to `serena-core:3000`.
- Keep PostgreSQL out of the VPS template for now because the current app does not use database persistence.
- Keep local T02 PostgreSQL in the root `docker-compose.yml` for development only.

## Do Not Touch In T03

- existing Caddy edge project
- existing `necrologia` or `hermes` production projects
- DNS records
- firewall rules
- production secrets
- real PostgreSQL or persistent production data

## T04 Preflight

- Confirm SSH access to the VPS and required operator permissions.
- Confirm Docker and Docker Compose versions on the VPS.
- Confirm the external Docker network exists: `docker network inspect proxy`.
- Confirm the Caddy edge container is healthy and owns ports `80` and `443`.
- Confirm `serena.goingmerry01.tech` DNS exists and points to the VPS before enabling the route.
- Confirm no other service uses container name `serena-core`.
- Confirm rollback point for the active Caddyfile before editing it.

## Deploy Commands For T04

Run only on the VPS after preflight and after the repository or release artifact is present at `/docker/serena`.

```sh
cd /docker/serena
docker compose -f infra/vps/docker-compose.yml config
docker compose -f infra/vps/docker-compose.yml up -d --build
docker compose -f infra/vps/docker-compose.yml ps
```

Then add the Serena route from `infra/vps/Caddyfile.serena.example` to the active Caddy edge configuration. The observed Caddy project generates `/config-src/Caddyfile` from the `caddyfile-writer` service in `/docker/caddy-edge/docker-compose.yml`, so T04 should back up and edit that compose file rather than guessing a separate host Caddyfile path.

Expected Caddy update flow for T04:

```sh
cd /docker/caddy-edge
CADDY_BACKUP="docker-compose.yml.bak.serena.$(date +%Y%m%d%H%M%S)"
cp docker-compose.yml "$CADDY_BACKUP"
printf '%s\n' "$CADDY_BACKUP" > .serena-caddy-backup
# edit the caddyfile-writer heredoc and add the Serena route
docker compose config
docker compose up -d --force-recreate caddyfile-writer
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker exec caddy-edge caddy reload --config /config-src/Caddyfile --adapter caddyfile
```

## Verify Commands For T04

```sh
docker inspect serena-core --format '{{json .NetworkSettings.Networks}}'
docker logs --tail=100 serena-core
docker run --rm --network proxy curlimages/curl:8.10.1 -fsS http://serena-core:3000/health
curl -fsS https://serena.goingmerry01.tech/health
```

Do not expect the app to answer on a VPS host port; the template intentionally uses `expose` without `ports`.

## Success Criteria For T04

- `serena-core` is running and healthy.
- `serena-core` is attached to the `proxy` network.
- `serena-core` has no published host ports.
- Internal health check succeeds from the `proxy` network.
- Public HTTPS health check succeeds at `https://serena.goingmerry01.tech/health`.
- Existing Caddy routes continue working.
- Caddy validates and reloads without errors.

## Rollback Commands For T04

```sh
cd /docker/serena
docker compose -f infra/vps/docker-compose.yml down
docker logs --tail=100 caddy-edge
```

Also remove or revert the Serena route in the active Caddy edge configuration and reload Caddy. If the T04 flow used the backup above:

```sh
cd /docker/caddy-edge
CADDY_BACKUP="$(cat .serena-caddy-backup)"
cp "$CADDY_BACKUP" docker-compose.yml
docker compose config
docker compose up -d --force-recreate caddyfile-writer
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker exec caddy-edge caddy reload --config /config-src/Caddyfile --adapter caddyfile
```

## Risks And Open Dependencies

- DNS for `serena.goingmerry01.tech` is not created yet.
- SSH access and keys were not verified in T03.
- Docker/Compose versions were not verified by SSH in T03.
- The `proxy` network is assumed from the existing Caddy strategy but must be checked before deployment.
- The app currently has only a health endpoint and no business behavior.
