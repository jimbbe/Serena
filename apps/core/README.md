# Serena Core

Minimal local service for T02.

## Scope (T02)

- expose `GET /health` over HTTP
- keep service framework-free (`node:http`)
- receive PostgreSQL config by environment only
- do **not** connect to PostgreSQL yet

## Run inside Docker Compose

From repository root:

```sh
docker compose up --build
```

Check health endpoint:

```sh
curl http://localhost:3000/health
```

Expected response (example):

```json
{"status":"ok","service":"serena-core","environment":"local"}
```

Stop stack:

```sh
docker compose down
```
