# WSP Network Plan

> **Status**: Phase 1 complete
> **Purpose**: Document Docker network topology for WhatsApp Gateway stack

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
│  │ Network: evolution-internal (internal, new)         │    │
│  │                                                     │    │
│  │  evolution-api:8080                                 │    │
│  │  evo-postgres:5432                                  │    │
│  │  redis:6379                                         │    │
│  │  whatsapp-gateway:3001 (bridges to this network)    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Network Membership Matrix

| Container | proxy | serena-internal | evolution-internal |
|-----------|-------|-----------------|-------------------|
| caddy-edge | ✅ | ❌ | ❌ |
| serena-core | ✅ | ✅ | ❌ |
| serena-postgres | ❌ | ✅ | ❌ |
| necrologia-bot | ✅ | ❌ | ❌ |
| hermes-agent | ✅ | ❌ | ❌ |
| **evolution-api** | ❌ | ❌ | ✅ |
| **evo-postgres** | ❌ | ❌ | ✅ |
| **redis** | ❌ | ❌ | ✅ |
| **whatsapp-gateway** | ✅ | ❌ | ✅ |

## Communication Flow

```
Internet → Caddy → whatsapp-gateway (proxy network)
                                      │
                                      ↓
                              evolution-api (evolution-internal)
                                      │
                                      ↓
                              evo-postgres (evolution-internal)
                              redis (evolution-internal)

whatsapp-gateway → serena-core (proxy network, internal routing)
```

## Security Rationale

### Why internal networks?

1. **evolution-internal is `internal: true`**:
   - No container on this network can reach the internet
   - Only containers explicitly attached to this network can communicate
   - Evolution API is isolated from all other services except the gateway
   - Prevents accidental exposure of Evolution API's management interface

2. **whatsapp-gateway bridges proxy + evolution-internal**:
   - Single point of control: only the gateway can talk to Evolution API
   - Consumer apps (Serena, future) only talk to the gateway, never to Evolution API directly
   - If we swap Evolution API for Baileys direct or Meta Cloud API, consumer apps don't change

3. **No host port publishing**:
   - Evolution API uses `expose` (internal Docker DNS), not `ports` (host binding)
   - No port 8080, 5432, or 6379 reachable from the host or internet
   - Only Caddy publishes ports 80/443

### Port Summary

| Service | Internal Port | Published to Host | Accessible Via |
|---------|--------------|-------------------|----------------|
| caddy-edge | 80, 443 | ✅ Yes | Internet |
| serena-core | 3000 | ❌ No | Caddy + proxy network |
| serena-postgres | 5432 | ❌ No | serena-internal only |
| evolution-api | 8080 | ❌ No | evolution-internal only |
| evo-postgres | 5432 | ❌ No | evolution-internal only |
| redis | 6379 | ❌ No | evolution-internal only |
| whatsapp-gateway | 3001 | ❌ No | Caddy + proxy + evolution-internal |

---

*Document created during Phase 1 of wsp-phase1-gateway-preparation.*
