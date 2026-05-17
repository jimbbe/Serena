# Design: T42 Gateway WA Private Staging

## Technical Approach

T42 is a minimal hardening + private rollout design. First, change only the `POST /instances` response boundary so internal instance creation still calls Evolution and stores `InstanceState`, but the HTTP response omits raw `apiKey`. Then tighten private staging docs/smoke/runbook around backup-first VPS mutation, operator-only access, no Caddy/DNS/public admin, no pairing, no real sends, and explicit closure evidence.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Secret response boundary | Remove `apiKey` only in `createInstanceHandler` response body. Keep `appKey` parameter until follow-up cleanup. | Change `InstanceManager`, Evolution client, or auth config. | The leak is at HTTP serialization. Manager behavior must remain unchanged and Evolution remains source of truth. |
| Test hardening | Add negative assertions in handler and integration tests that `apiKey`/credential fields are absent. | Only update expected object shape. | Absence tests prevent regression and encode the safety property directly. |
| Staging access | Use operator-only private reachability: SSH tunnel/helper container/approved internal path. | Public Caddy route, DNS record, or host port. | Scope explicitly forbids public admin exposure; Caddy stays untouched. |
| Rollout safety | Require backup + rollback evidence before any VPS mutation. | Deploy first, document later. | This is staging infrastructure with persistent Evolution volumes; rollback must exist BEFORE mutation. |
| Instance state risk | Document that `InstanceManager` is in-memory and restart loses local tracking; do not solve persistence in T42. | Add PostgreSQL/rehydration now. | Out of scope; Evolution is the session source of truth and rehydration belongs to a future change. |

## Data Flow

```text
POST /instances
  → auth: X-Gateway-Admin-Key
  → createInstanceHandler validates name
  → InstanceManager.createInstance(name)
  → EvolutionClient.createInstance + connectInstance
  → InstanceManager stores in-memory InstanceState
  → HTTP 201 { name, status, qr }   # no apiKey/credential material

Private smoke
  operator-only path → gateway-wa private endpoint
  → /health, auth rejection, unknown route, malformed /send
  → evidence update; no pairing, no real send, no public exposure
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/gateway-wa/src/infrastructure/instances/handlers.ts` | Modify | Omit `apiKey` from create-instance response; preserve manager call and `appKey` parameter compatibility. |
| `apps/gateway-wa/src/infrastructure/instances/handlers.test.ts` | Modify | Update success expectation to `{ name, status, qr }`; assert `apiKey`, app/admin/internal token fields are absent. |
| `apps/gateway-wa/src/tests/integration.test.ts` | Modify | Assert live HTTP `POST /instances` does not return `apiKey` or credentials. |
| `docs/architecture/wsp-gateway-api-contract.md` | Modify | Update `POST /instances` response contract to safe metadata only. |
| `openspec/specs/gateway-instance-management/spec.md` | Modify | Sync main spec after archive: no raw `apiKey` in success response. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modify | Add T42 rollout section: backup path, private access, rollback, non-actions, evidence. |
| `scripts/smoke/gateway-wa-staging-smoke.ts` | Modify | Keep non-destructive checks and add fail-closed wording/guards for private base URL expectations; never print secrets. |
| `infra/vps/gateway-wa-staging/*` | Modify | Preserve no host ports/public route; comments may clarify private topology and backup-first rollout. |
| `docs/project-status.md` | Modify | Add prepared/executed T42 status and test count if implementation changes tests. |
| `docs/ops/*t42*` or runbook evidence section | Create/Modify | Record closure evidence: deployed services, backup path, checks, rollback, explicit non-actions. |

## Interfaces / Contracts

`POST /instances` success body becomes:

```ts
type CreateInstanceResponse = {
  name: string;
  status: "disconnected";
  qr: string | null;
};
```

No credential-like response keys are allowed: `apiKey`, `appKey`, `adminKey`, `internalToken`, `evolutionApiKey`, `token`, `secret`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Handler success/invalid/duplicate paths | `node:test`; update existing handler tests and add explicit absence assertions. |
| Integration | Real HTTP `POST /instances` contract | Existing gateway integration test with fake Evolution fetch; assert no credential fields. |
| Ops smoke | Private non-destructive readiness | Run helper only through private operator path; health/auth/unknown-route/malformed-send/private reachability. |

## Migration / Rollout

No data migration required. Rollout is backup-first: snapshot/archive staging directory and Evolution volumes metadata before mutation; deploy only private staging services; run smoke through operator-only access; update evidence; abort on any Caddy/DNS/public-admin/host-port requirement. Rollback stops/removes only staging gateway/Evolution services and restores the pre-mutation backup, leaving Serena Core/Caddy/DNS untouched.

## Open Questions

- [ ] Future task: durable instance persistence or startup rehydration from Evolution API.
