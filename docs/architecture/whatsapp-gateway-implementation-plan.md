# Plan de Implementación: WhatsApp Gateway + Evolution API

> **Estado**: Fase 1 completada ✅
> **Inicio**: 2026-05-10
> **Última actualización**: 2026-05-10
> **Rama**: `feat/wsp-phase1-gateway-preparation`

---

## Arquitectura Objetivo

```
Internet
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  Caddy Edge (:80/:443)                               │
│                                                      │
│  serena.goingmerry01.tech   → serena-core:3000       │
│  necro.goingmerry01.tech    → necrologia-bot:3000    │
│  estoicus.goingmerry01.tech → hermes-agent:8642      │
│  wsp.goingmerry01.tech      → whatsapp-gateway:3001  │
│  (Evolution API SIN ruta pública — solo interna)     │
└──────────────────────────────────────────────────────┘
  │
  ├── [proxy network]
  │    ├── serena-core:3000             (existente)
  │    ├── necrologia-bot:3000          (existente)
  │    ├── hermes-agent:8642            (existente)
  │    └── whatsapp-gateway:3001        (nuevo)
  │         │
  │         └── [evolution-private]
  │              ├── evolution-api:8080 (nuevo, outbound internet ✅)
  │              └── evo-postgres:5432  (nuevo)
  │
  ├── [serena-internal]                 (existente)
  │    ├── serena-core:3000
  │    └── serena-postgres:5432
  │
  └── [whatsapp-internal]               (nuevo)
       └── redis:6379
```

### Nota sobre redes de Evolution API

La red `evolution-private` es un bridge normal (NO `internal: true`). Evolution API **necesita salida a internet** para conectarse a los servidores de WhatsApp (Baileys usa protocolo WhatsApp Web).

Seguridad se logra con:
- Sin `ports:` publicados al host
- Sin ruta pública en Caddy
- Docker DNS interno (solo contenedores en la misma red lo alcanzan)
- WhatsApp Gateway como único punto de control
```

### Flujo de Mensajes

```
[WhatsApp] ──→ [Evolution API] ──webhook──→ [whatsapp-gateway]
                                               │
                                      normaliza + rutea
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                      ▼
                              [serena-core]          [futuras apps]
                         POST /internal/webhook
                                    │
                              pipeline procesa
                                    │
                         ┌──────────┴──────────┐
                         ▼ (draft_ready)        │
                  [whatsapp-gateway]            │
                         │                      │
                    POST /send                  │
                         │                      │
                         ▼                      │
                  [Evolution API]               │
                         │                      │
                         ▼                      │
                    [WhatsApp] ←────────────────┘
```

### Principios de Seguridad

| Regla | Motivo |
|-------|--------|
| Evolution API **NUNCA** expuesto públicamente | Controla sesiones de WhatsApp. Un leak = acceso al número |
| Evolution API **SÍ** necesita salida a internet | Baileys conecta a servidores de WhatsApp (web.whatsapp.com) |
| Gateway es el único que habla con Evolution API | Single point of control, audit, rate limiting |
| Webhooks son tráfico interno Docker | No pasan por internet, no requieren TLS entre contenedores |
| Apps consumidoras no conocen Evolution API | Solo conocen la API del Gateway. Si cambiamos Evolution por Baileys directo, las apps no se enteran |

**Imagen Docker**: `evolutionapi/evolution-api:latest`

**Variables de entorno clave**:
- `DATABASE_CONNECTION_URI` → formato Prisma: `postgresql://user:pass@host:5432/db?schema=public`
- `CACHE_REDIS_ENABLED=true` + `CACHE_REDIS_URI=redis://redis:6379/1`
- `AUTHENTICATION_API_KEY` → API key de Evolution API
- `WEBHOOK_GLOBAL_URL` → apunta al gateway interno
- `EVOLUTION_SERVER_URL` → URL interna del servicio (`http://evolution-api:8080`)

---

## Fases de Implementación

| Fase | Descripción | Depende de | Estado |
|------|-------------|-----------|--------|
| F1 | Preparación y diseño (specs, contracts, templates) | — | ✅ Completada |
| F2 | Deploy Evolution API en VPS | F1 | 🔲 Pendiente |
| F3 | Construir WhatsApp Gateway (apps/gateway-whatsapp) | F1 | 🔲 Pendiente |
| F4 | Deploy Gateway en VPS + Caddy + DNS | F2, F3 | 🔲 Pendiente |
| F5 | Conectar Serena al Gateway real | F4 | 🔲 Pendiente |
| F6 | Hardening y documentación | F5 | 🔲 Pendiente |

**F2 y F3 pueden ejecutarse en paralelo** después de F1.

---

## Fase 1: Completada ✅

### Tareas implementadas

| # | Tarea | Archivo | Estado |
|---|-------|---------|--------|
| 1 | Corregir Evolution API refs (imagen, env vars) | `docs/architecture/whatsapp-gateway-implementation-plan.md` | ✅ |
| 2 | Gateway API contract (7 endpoints, auth, webhook) | `docs/architecture/wsp-gateway-api-contract.md` | ✅ |
| 3 | Evolution API docker-compose template | `infra/vps/evolution-api/docker-compose.yml` | ✅ |
| 4 | Evolution API .env.example template | `infra/vps/evolution-api/.env.example` | ✅ |
| 5 | Network plan (topology, matrix, security) | `docs/ops/wsp-network-plan.md` | ✅ |

### Verificación
- ✅ 5/5 tests pasan
- ✅ 0 issues críticos
- ⚠️ 4 warnings de sincronización de documentación (no defectos)

### Artifacts archivados
- `openspec/changes/archive/2026-05-10-wsp-phase1-gateway-preparation/`
- `openspec/specs/whatsapp-gateway-api/spec.md` (synced to main specs)

---

## Fase 2: Deploy Evolution API en VPS

### T2.1 — Crear docker-compose para Evolution API

- [ ] Crear `/docker/evolution-api/` en la VPS
- [ ] Copiar `infra/vps/evolution-api/docker-compose.yml` a la VPS
- [ ] Crear `.env` con variables reales (no commitear)
- [ ] `docker compose up -d`
- [ ] Verificar health de los 3 servicios

### T2.2 — Configurar Caddy para Evolution API (opcional)

- [ ] Evolution API NO necesita ruta pública (seguridad)
- [ ] Si se necesita Manager UI para debug: SSH tunnel `ssh -L 8080:evolution-api:8080 root@177.7.32.90`

### T2.3 — Vincular primer número de WhatsApp

- [ ] Crear instancia `serena-main` via API de Evolution API
- [ ] Obtener QR code y escanear con número de prueba
- [ ] Verificar conexión `open`

---

## Fase 3: Construir WhatsApp Gateway

### T3.1 — Scaffold del workspace

- [ ] Crear `apps/gateway-whatsapp/` en el monorepo
- [ ] Estructura Clean/Hexagonal: domain/, application/, infrastructure/
- [ ] Zero imports de Serena (agnóstico)

### T3.2 — Implementar cliente de Evolution API

- [ ] `EvolutionApiClient` con métodos: createInstance, getInstance, getQrCode, sendText, getConnectionStatus
- [ ] Tests unitarios con fake fetch

### T3.3 — Implementar REST API del Gateway

- [ ] `POST /instances` — crear instancia
- [ ] `GET /instances` — listar instancias
- [ ] `GET /instances/:name/qr` — obtener QR
- [ ] `DELETE /instances/:name` — desconectar instancia
- [ ] `POST /send` — enviar mensaje
- [ ] `POST /webhook/evolution` — recibir webhooks
- [ ] `GET /health` — health check

### T3.4 — Implementar webhook receiver y ruteo

- [ ] Normalizar mensajes de Evolution API a formato agnóstico
- [ ] Rutear a app correcta según instanceId
- [ ] Ignorar self-messages (fromMe: true)

---

## Fase 4: Deploy del WhatsApp Gateway en VPS

### T4.1 — Dockerizar el gateway

- [ ] Crear `apps/gateway-whatsapp/Dockerfile`
- [ ] Crear compose en `/docker/whatsapp-gateway/`

### T4.2 — Configurar Caddy y DNS

- [ ] Agregar ruta: `wsp.goingmerry01.tech → whatsapp-gateway:3001`
- [ ] Agregar registro DNS para `wsp.goingmerry01.tech`

---

## Fase 5: Conectar Serena al Gateway Real

### T5.1 — Crear endpoint de webhook inbound en Serena Core

- [ ] `POST /internal/webhook/whatsapp` en serena-core
- [ ] Convierte a `InboundMessageCommand` con `channel: "whatsapp"`
- [ ] Ejecuta `ProcessChannelInboundMessage`

### T5.2 — Crear adapter real de WhatsApp Gateway en Serena

- [ ] Implementar `WhatsAppGateway` port con adapter HTTP
- [ ] `send(to, text)` → `POST http://whatsapp-gateway:3001/send`

### T5.3 — End-to-end test con WhatsApp real

- [ ] Enviar mensaje real → Evolution API → Gateway → Serena → Pipeline → Gateway → Evolution API → WhatsApp

---

## Fase 6: Hardening y Documentación

### T6.1 — Autenticación y seguridad

- [ ] API keys dedicadas por app consumidora
- [ ] Webhook signature validation
- [ ] Rate limiting

### T6.2 — Manejo de errores y resiliencia

- [ ] Retry con exponential backoff
- [ ] Circuit breaker
- [ ] Dead letter queue

### T6.3 — Documentación operativa

- [ ] Runbooks: agregar número, reconectar instancia, rotar keys, rollback

---

## Recursos en VPS (estimado)

| Servicio | CPU | RAM | Disk |
|----------|-----|-----|------|
| Caddy (existente) | 0.1 | 50MB | 100MB |
| serena-core (existente) | 0.3 | 200MB | 500MB |
| serena-postgres (existente) | 0.2 | 150MB | 1GB |
| necrologia-bot (existente) | 0.1 | 100MB | 100MB |
| hermes-agent (existente) | 0.3 | 200MB | 1GB |
| **evolution-api** (nuevo) | 0.5 | 400MB | 200MB |
| **evo-postgres** (nuevo) | 0.2 | 150MB | 500MB |
| **redis** (nuevo) | 0.1 | 50MB | 50MB |
| **whatsapp-gateway** (nuevo) | 0.1 | 100MB | 50MB |
| **Total** | **~1.9** | **~1.4GB** | **~3.5GB** |

Capacidad VPS: 2 vCPU, 8GB RAM, 100GB disk → **Sobra espacio**.

---

## Checklist de Seguridad Pre-Deploy

- [ ] Evolution API SIN ruta pública en Caddy
- [ ] `.env` con permisos 600 en VPS, nunca commitear
- [ ] API keys generadas con `openssl rand -hex 32`
- [ ] PostgreSQL de Evolution API en red privada (`evolution-private`)
- [ ] Redis en red privada (`evolution-private`)
- [ ] API keys distintas para cada app consumidora

---

## Notas Operativas

- **QR de WhatsApp**: Se escanea UNA vez. La sesión se guarda en PostgreSQL de Evolution API.
- **Si WhatsApp se desconecta**: Evolution API intenta reconectar automáticamente.
- **Si cambia el número**: Nueva instancia, nuevo QR, nueva entrada en tabla de ruteo.
- **Manager UI de Evolution API**: Accesible internamente en `http://evolution-api:8080/manager`. Para acceso externo: `ssh -L 8080:evolution-api:8080 root@177.7.32.90`.

---

*Documento vivo. Se actualiza al completar cada fase/tarea.*
