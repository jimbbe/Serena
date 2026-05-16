# T40 — VPS core readiness before gateway-wa staging

## Scope

T40 refreshed the existing Serena Core runtime on the VPS so the next task can deploy `gateway-wa` staging safely.

This was an operational update only. It did not deploy `gateway-wa`, start Evolution API, modify Caddy, open ports, pair WhatsApp, delete volumes, or touch Hermes / `necrologia-bot`.

## Starting Point

- `/docker/serena` existed on the VPS but was not a Git checkout.
- `serena-core` and `serena-postgres` were running and healthy from the older T04-style deploy.
- The old runtime did not expose `POST /internal/webhook/whatsapp`.
- `SERENA_INTERNAL_TOKEN` was not present in the VPS `.env` before the update.

## Actions Performed

1. Fetched `origin/main` locally and confirmed it included T39.
2. Created a deploy archive from `origin/main` using `git archive`.
3. Uploaded the archive to the VPS.
4. Created a pre-update backup excluding `.env`:

   ```txt
   /docker/backups/serena-t40-preupdate-20260516-230859.tar.gz
   ```

5. Extracted the new source to a temporary directory and synced it into `/docker/serena` while preserving `.env`.
6. Generated `SERENA_INTERNAL_TOKEN` directly on the VPS without printing the value.
7. Rebuilt and recreated only `serena-core`:

   ```sh
   cd /docker/serena
   docker compose --env-file .env -f infra/vps/docker-compose.yml build serena-core
   docker compose --env-file .env -f infra/vps/docker-compose.yml up -d --no-deps serena-core
   ```

## Validation Evidence

- `serena-core` became healthy after recreation.
- Public health check passed:

  ```txt
  https://serena.goingmerry01.tech/health -> 200
  ```

- Internal health check passed from inside `serena-core`:

  ```txt
  GET http://127.0.0.1:3000/health -> 200
  ```

- Authenticated webhook probe passed without printing the token:

  ```txt
  POST http://127.0.0.1:3000/internal/webhook/whatsapp -> 200
  routedTo serena-core
  ```

- Unauthenticated webhook probe returned the expected rejection:

  ```txt
  POST http://127.0.0.1:3000/internal/webhook/whatsapp -> 401
  ```

- Runtime env names now include:

  ```txt
  POSTGRES_DB
  POSTGRES_PASSWORD
  POSTGRES_USER
  SERENA_INTERNAL_TOKEN
  ```

## Current VPS State After T40

- `serena-core`: running, healthy, attached to `proxy` and `serena-internal`.
- `serena-postgres`: running, healthy, attached to `serena-internal`.
- No `gateway-wa`, Evolution API, Redis, or `evo-postgres` containers were deployed.
- No Caddy configuration was changed.

## Next Safe Step

T41 should deploy `gateway-wa` staging privately and run non-destructive smoke checks.

T41 should still avoid:

- WhatsApp pairing.
- Real outbound delivery.
- Public admin route exposure.
- Caddy changes unless explicitly scoped.
- Evolution API live operation beyond what the staging task explicitly approves.
