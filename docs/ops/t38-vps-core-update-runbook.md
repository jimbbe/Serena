# T38 — VPS core update before Shared WhatsApp Gateway

## Scope

Prepare the existing Serena VPS stack for a later `gateway-wa` staging deployment.

T38 updates only `serena-core` from `main`, configures the existing internal token on the VPS, verifies the core webhook, and keeps gateway/evolution deployment explicitly out of scope.

## Do not do in T38

- Do not deploy `gateway-wa`.
- Do not start Evolution API.
- Do not modify Caddy.
- Do not open ports.
- Do not pair WhatsApp.
- Do not touch Hermes or `necrologia-bot`.
- Do not delete volumes.
- Do not commit or print secrets.

## Preflight

Run from the VPS:

```sh
cd /docker/serena
TOKEN_LINE="$(grep '^SERENA_INTERNAL_TOKEN=' .env || true)"
if [ -z "$TOKEN_LINE" ]; then
  echo 'ERROR: SERENA_INTERNAL_TOKEN is missing in /docker/serena/.env'
  echo 'Set it only in VPS runtime config, then re-run T38.'
  exit 1
fi

TOKEN_VALUE="${TOKEN_LINE#SERENA_INTERNAL_TOKEN=}"
if [ -z "$TOKEN_VALUE" ]; then
  echo 'ERROR: SERENA_INTERNAL_TOKEN is empty in /docker/serena/.env'
  echo 'Set a non-empty secret only in VPS runtime config, then re-run T38.'
  exit 1
fi

unset TOKEN_LINE TOKEN_VALUE

docker compose -f infra/vps/docker-compose.yml ps
docker network inspect serena-internal >/dev/null
```

Confirm `.env` exists and contains the required variable names without printing values:

```sh
sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env | sort
grep -q '^SERENA_INTERNAL_TOKEN=' .env && echo 'SERENA_INTERNAL_TOKEN present'
```

## Update `/docker/serena` to `main`

If `/docker/serena` is a Git checkout:

```sh
cd /docker/serena
git fetch origin --prune
git switch main
git pull --ff-only origin main
git log --oneline -1
```

If `/docker/serena` is not a Git checkout, replace only the application source with an operator-approved copy of `main` while preserving `.env` and Docker volumes. Do not overwrite `.env`.

## Rebuild only `serena-core`

```sh
cd /docker/serena
docker compose -f infra/vps/docker-compose.yml build serena-core
```

## Start only `serena-core`

Keep PostgreSQL running and recreate only the core container:

```sh
docker compose -f infra/vps/docker-compose.yml up -d --no-deps serena-core
docker compose -f infra/vps/docker-compose.yml ps serena-core
```

## Verify health

```sh
docker exec serena-core node -e "fetch('http://127.0.0.1:3000/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); }).catch(e => { console.error(e.message); process.exit(1); })"
curl -fsS https://serena.goingmerry01.tech/health
```

## Verify WhatsApp inbound webhook

Use the token from `.env` without printing it:

```sh
TOKEN_LINE="$(grep '^SERENA_INTERNAL_TOKEN=' .env || true)"
if [ -z "$TOKEN_LINE" ]; then
  echo 'ERROR: SERENA_INTERNAL_TOKEN line is missing in /docker/serena/.env'
  exit 1
fi

SERENA_INTERNAL_TOKEN="${TOKEN_LINE#SERENA_INTERNAL_TOKEN=}"
if [ -z "$SERENA_INTERNAL_TOKEN" ]; then
  echo 'ERROR: SERENA_INTERNAL_TOKEN is empty in /docker/serena/.env'
  exit 1
fi

docker exec \
  -e SERENA_INTERNAL_TOKEN="$SERENA_INTERNAL_TOKEN" \
  serena-core \
  node -e "fetch('http://127.0.0.1:3000/internal/webhook/whatsapp',{method:'POST',headers:{'content-type':'application/json','x-serena-internal-token':process.env.SERENA_INTERNAL_TOKEN},body:JSON.stringify({provider:'evolution',instanceId:'t38-probe',messageId:'t38-probe-' + Date.now(),from:'5491111111111',text:'hola',timestamp:new Date().toISOString()})}).then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); }).catch(e => { console.error(e.message); process.exit(1); })"

unset TOKEN_LINE SERENA_INTERNAL_TOKEN
```

Expected result: HTTP 200 with a JSON body including `received: true` and `routedTo: "channel-inbound"`.

Negative check (must NOT be treated as success):

```sh
docker exec serena-core node -e "fetch('http://127.0.0.1:3000/internal/webhook/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'evolution',instanceId:'t38-probe-no-auth',messageId:'t38-probe-no-auth-' + Date.now(),from:'5491111111111',text:'hola',timestamp:new Date().toISOString()})}).then(async r => { console.log(r.status, await r.text()); process.exit(r.status === 200 ? 1 : 0); }).catch(e => { console.error(e.message); process.exit(1); })"
```

Expected result: non-200 (typically 401/403). If this returns 200, stop and rollback.

## Gateway network readiness

The staging gateway compose must attach `gateway-wa` to both:

- `proxy` for future operator-approved edge routing.
- `serena-internal` so it can resolve and call `http://serena-core:3000/internal/webhook/whatsapp` without exposing core publicly.

This repo template now declares `serena-internal` as an external network in `infra/vps/gateway-wa-staging/docker-compose.yml`.

## Rollback

If the new `serena-core` fails health or webhook verification:

1. Do not deploy `gateway-wa`.
2. Revert the source in `/docker/serena` to the previous known-good revision or backup.
3. Rebuild and recreate only core:

```sh
docker compose -f infra/vps/docker-compose.yml build serena-core
docker compose -f infra/vps/docker-compose.yml up -d --no-deps serena-core
docker compose -f infra/vps/docker-compose.yml ps serena-core
```

4. Re-check `/health`.
5. Keep `.env` and PostgreSQL volumes intact. Do not run `down -v`.

## PR prep notes (task 3.3)

- Summary: T38 is core-only VPS readiness (token-required core refresh + webhook verification) plus private network preparation for future gateway staging.
- Repo-safe validation evidence: run `npm run validate:t38` and `npm run check` in this repository.
- Rollback note: restore previous `/docker/serena` source revision, rebuild only `serena-core`, preserve `.env` and volumes.
- Explicit out-of-scope reminder: no gateway/Evolution deployment, no Caddy changes, no port exposure, no WhatsApp pairing.
