# Deployment T04

T04 dejo desplegado el stack base de Serena en la VPS y publico el healthcheck por Caddy.

## Resultado Final

- Branch local usada: `chore/t04-vps-base-deploy`.
- VPS: `177.7.32.90`.
- Dominio publico: `serena.goingmerry01.tech`.
- Ruta publica activa: `https://serena.goingmerry01.tech/health`.
- Path remoto del stack Serena: `/docker/serena`.
- `serena-core` esta running/healthy.
- `serena-postgres` esta running/healthy.
- No hay host ports publicados por el stack Serena.
- `serena-core` esta conectado a `proxy` y `serena-internal`.
- `serena-postgres` esta conectado solo a `serena-internal`.
- `/docker/serena/.env` existe en la VPS con permisos `600`; no documentar ni commitear secretos.

## Acceso Operativo

```sh
ssh root@177.7.32.90
cd /docker/serena
```

El proyecto usa la red externa `proxy` para que Caddy alcance `serena-core` por nombre de contenedor, y una red interna `serena-internal` para aislar PostgreSQL.

## Deploy

El deploy base quedo aplicado desde `/docker/serena` con `infra/vps/docker-compose.yml`.

```sh
cd /docker/serena
docker compose --env-file .env -f infra/vps/docker-compose.yml config
docker compose --env-file .env -f infra/vps/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/vps/docker-compose.yml ps
```

La configuracion remota requiere `.env` con valores de PostgreSQL. Ese archivo debe mantenerse fuera de Git y con permisos restrictivos.

## Caddy

La ruta agregada al Caddy edge es:

```caddyfile
serena.goingmerry01.tech {
  encode gzip
  reverse_proxy serena-core:3000
}
```

Validaciones ejecutadas en T04:

- `caddy validate` OK.
- `caddy reload` OK.
- Rutas existentes `necro` y `estoicus` preservadas.

Backups creados antes/durante la operacion:

- `/docker/backups/serena-t04-20260501-135202`
- `/docker/backups/serena-t04-20260501-135202/caddy-edge-docker-compose.yml.route-and-caddy-20260501-142401.bak`

## Verify

Verificacion interna desde la red `proxy`:

```sh
docker run --rm --network proxy curlimages/curl:8.10.1 -fsS http://serena-core:3000/health
```

Respuesta confirmada:

```json
{"status":"ok","service":"serena-core","environment":"production"}
```

Verificacion publica:

```sh
curl -fsS https://serena.goingmerry01.tech/health
```

Resultado confirmado: HTTP 200, `Server: Caddy`, mismo JSON de health.

Tambien se verifico restart del stack Serena y el healthcheck siguio respondiendo 200.

## Rollback

Para despublicar Serena y detener su stack:

```sh
cd /docker/serena
docker compose --env-file .env -f infra/vps/docker-compose.yml down
```

Para revertir la ruta de Caddy, restaurar el backup T04 correspondiente y recargar Caddy:

```sh
cd /docker/caddy-edge
cp /docker/backups/serena-t04-20260501-135202/caddy-edge-docker-compose.yml.route-and-caddy-20260501-142401.bak docker-compose.yml
docker compose config
docker compose up -d --force-recreate caddyfile-writer
docker exec caddy-edge caddy validate --config /config-src/Caddyfile --adapter caddyfile
docker exec caddy-edge caddy reload --config /config-src/Caddyfile --adapter caddyfile
```

Si se necesita volver al punto base previo completo de T04, usar primero el contenido de `/docker/backups/serena-t04-20260501-135202` como referencia operativa.

## Riesgos Y Pendientes

- La aplicacion todavia expone solo `/health`; no hay logica conversacional ni integracion WhatsApp.
- `serena-core` recibe variables de base de datos, pero la aplicacion todavia no usa conexion real a PostgreSQL.
- PostgreSQL ya tiene volumen persistente en VPS; cualquier rollback con borrado de volumen debe tratarse como operacion destructiva separada.
- Hay logs 502 de `estoicus` observados durante T04, pero son preexistentes y no relacionados con Serena.
- No documentar secretos de `/docker/serena/.env` en issues, commits ni runbooks.
