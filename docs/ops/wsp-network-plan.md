# WSP Network Plan

> **Status**: Phase 1 complete
> **Purpose**: Document Docker network topology for WhatsApp Gateway stack

---

## Key Concept: Private vs Internal

**"Private network" does NOT mean "internal network".**

| Docker Network Type | Outbound Internet | Inbound from other containers | Inbound from host |
|---------------------|-------------------|------------------------------|-------------------|
| `internal: true`    | ❌ BLOCKED        | ✅ Only from same network    | ❌ No             |
| Normal bridge       | ✅ ALLOWED        | ✅ Only from same network    | ❌ No             |
| External (`proxy`)  | ✅ ALLOWED        | ✅ From any container        | ✅ Via published ports |

**Evolution API needs outbound internet** to connect to WhatsApp servers (Baileys uses WhatsApp Web protocol). If we put it on an `internal: true` network, it cannot reach WhatsApp and the whole system breaks.

**Security is achieved by:**
1. **No `ports:`** — Evolution API does not publish any port to the host
2. **No Caddy route** — No public domain points to Evolution API
3. **Docker DNS** — Only containers on the same private network can reach it by name
4. **Gateway as single control point** — Only the WhatsApp Gateway talks to Evolution API

---

## Network Topology

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Host (Hostinger VPS 177.7.32.90)                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Network: proxy (external, shared)                   │    │
│  │                                                     │    │
│  │  caddy-edge:80,443  (existing)                      │    │
│  │  serena-core:3000   (existing)                      │    │
│  │  necrologia-bot:3000 (existing)                     │    │
│  │  hermes-agent:8642  (existing)                      │    │
│  │  whatsapp-gateway:3001 (future)                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Network: serena-internal (internal, existing)       │    │
│  │                                                     │    │
│  │  serena-core:3000                                   │    │
│  │  serena-postgres:5432                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Network: evolution-private (bridge, new)            │    │
│  │                                                     │    │
│  │  evolution-api:8080  ← needs OUTBOUND internet      │    │
│  │  evo-postgres:5432                                  │    │
│  │  redis:6379                                         │    │
│  │  whatsapp-gateway:3001 (bridges to this network)    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Outbound Internet (allowed for evolution-private)   │    │
│  │                                                     │    │
│  │  evolution-api → WhatsApp servers (Baileys/WS)      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Network Membership Matrix

| Container | proxy | serena-internal | evolution-private | Outbound Internet |
|-----------|-------|-----------------|-------------------|-------------------|
| caddy-edge | ✅ | ❌ | ❌ | ✅ |
| serena-core | ✅ | ✅ | ❌ | ✅ |
| serena-postgres | ❌ | ✅ | ❌ | ❌ |
| necrologia-bot | ✅ | ❌ | ❌ | ✅ |
| hermes-agent | ✅ | ❌ | ❌ | ✅ |
| **evolution-api** | ❌ | ❌ | ✅ | ✅ (needs WhatsApp) |
| **evo-postgres** | ❌ | ❌ | ✅ | ❌ |
| **redis** | ❌ | ❌ | ✅ | ❌ |
| **whatsapp-gateway** | ✅ | ❌ | ✅ | ✅ |

## Communication Flow

```
Internet → Caddy → whatsapp-gateway (proxy network)
                                      │
                                      ↓
                              evolution-api (evolution-private)
                                      │
                                      ↓
                              evo-postgres (evolution-private)
                              redis (evolution-private)

evolution-api → WhatsApp servers (outbound internet)

whatsapp-gateway → serena-core (proxy network, internal routing)
```

## Security Rationale

### Why `evolution-private` (bridge) and NOT `internal: true`?

1. **Evolution API MUST reach WhatsApp servers**:
   - Baileys connects to WhatsApp Web via WebSocket to `web.whatsapp.com`
   - QR code generation, message sending, and connection maintenance all require internet
   - `internal: true` blocks ALL outbound traffic, including DNS resolution to WhatsApp

2. **Security is NOT achieved by blocking outbound**:
   - Security means no one from outside can reach Evolution API
   - This is achieved by NOT publishing ports (`ports:`) and having NO Caddy route
   - Docker DNS still isolates Evolution API — only containers on `evolution-private` can reach it by name

3. **whatsapp-gateway bridges proxy + evolution-private**:
   - Single point of control: only the gateway can talk to Evolution API
   - Consumer apps (Serena, future) only talk to the gateway, never to Evolution API directly
   - If we swap Evolution API for Baileys direct or Meta Cloud API, consumer apps don't change

4. **No host port publishing**:
   - Evolution API uses `expose` (internal Docker DNS), not `ports` (host binding)
   - No port 8080, 5432, or 6379 reachable from the host or internet
   - Only Caddy publishes ports 80/443

### Port Summary

| Service | Internal Port | Published to Host | Accessible Via | Outbound Internet |
|---------|--------------|-------------------|----------------|-------------------|
| caddy-edge | 80, 443 | ✅ Yes | Internet | ✅ |
| serena-core | 3000 | ❌ No | Caddy + proxy network | ✅ |
| serena-postgres | 5432 | ❌ No | serena-internal only | ❌ |
| evolution-api | 8080 | ❌ No | evolution-private only | ✅ (WhatsApp) |
| evo-postgres | 5432 | ❌ No | evolution-private only | ❌ |
| redis | 6379 | ❌ No | evolution-private only | ❌ |
| whatsapp-gateway | 3001 | ❌ No | Caddy + proxy + evolution-private | ✅ |

---

*Document created during Phase 1 of wsp-phase1-gateway-preparation.*
