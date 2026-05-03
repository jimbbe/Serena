# Proposal: T17B — Internal Hardening (Serena)

## Intent

El endpoint `POST /internal/pipeline/process` es actualmente abierto: sin autenticacion ni proteccion contra mensajes duplicados. T17A documento la necesidad de `X-Serena-Internal-Token` e idempotencia por `messageId`. T17B implementa ambos para que el endpoint sea seguro y robusto antes de conectar el WhatsApp Gateway real. Ademas agrega CI basico para evitar regresiones.

## Scope

### In Scope
- **Auth**: Proteger `POST /internal/pipeline/process` con header `X-Serena-Internal-Token` (401/403)
- **Idempotency**: Requerir `messageId` en payload JSON; detectar duplicados con `ProcessedMessageStore` in-memory
- **CI**: `.github/workflows/ci.yml` con `npm ci`, `npm run check`, `npm test`
- **Tests**: 8+ tests nuevos cubriendo auth, idempotencia, 404, 405
- **Docs**: Actualizar README, project-status, crear `docs/t17b-internal-hardening.md`

### Out of Scope
- Evolution API, WhatsApp real, PostgreSQL, migraciones, deploy, LLM, panel web, JWT/OAuth, cambios en Caddy, rediseño del orchestrator

## Capabilities

### New Capabilities
- `internal-auth`: Autenticacion del endpoint interno via token compartido
- `idempotency-cache`: Deteccion y cache de mensajes procesados por messageId
- `ci-pipeline`: Integracion continua automatizada en GitHub Actions

### Modified Capabilities
- `internal-pipeline-http`: Requiere token valido y messageId; responde 401/403/409 segun caso

## Approach

1. **Auth en server.ts**: Interceptar antes del pipeline handler; leer `SERENA_INTERNAL_TOKEN` de env; comparar con header `X-Serena-Internal-Token`. GET /health stays public.
2. **Idempotency**: Nuevo port `ProcessedMessageStore` en `modules/internal-pipeline/domain/`, adapter `InMemoryProcessedMessageStore` en `modules/internal-pipeline/infrastructure/`. Wrapper alrededor del handler: check → cache hit (return cached) → execute → save → return.
3. **messageId validation**: Agregar al `validatePipelineInput` existente — `messageId` required non-empty string.
4. **CI**: Workflow estandar en `.github/workflows/ci.yml`.
5. **Tests**: Extender `internal-pipeline-http.test.ts` con nuevo fixture que inyecte token.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/bootstrap/server.ts` | Modified | Add token auth middleware before pipeline handler |
| `apps/core/src/bootstrap/internal-pipeline-handler.ts` | Modified | Wrap with idempotency check, validate messageId |
| `apps/core/src/config/env.ts` | Modified | Add `internalToken` to AppEnv |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire ProcessedMessageStore |
| `apps/core/src/modules/internal-pipeline/` | New | Domain port + in-memory adapter for ProcessedMessageStore |
| `apps/core/src/bootstrap/tests/internal-pipeline-http.test.ts` | Modified | Add auth + idempotency tests |
| `.env.example` | Modified | Add SERENA_INTERNAL_TOKEN |
| `.github/workflows/ci.yml` | New | CI workflow |
| `docs/t17b-internal-hardening.md` | New | Task documentation |
| `README.md` | Modified | Update status section |
| `docs/project-status.md` | Modified | Add T17B section |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing tests break due to missing token | High | Update test fixture to inject token; keep tests passing |
| Idempotency store grows unbounded in memory | Medium | Acceptable for Phase 1 (in-memory); document for T19 (PostgreSQL) |
| Token mismatch between services in Docker | Low | Use same env var in compose; document in .env.example |

## Rollback Plan

Revert the commit: auth check removed, endpoint returns to open state, messageId validation removed, idempotency store unused. No data migration to undo (all in-memory). CI workflow deletion has no runtime impact.

## Dependencies

- None. Pure internal hardening with no external services.

## Success Criteria

- [ ] `GET /health` returns 200 without token
- [ ] `POST /internal/pipeline/process` without token → 401
- [ ] `POST /internal/pipeline/process` with wrong token → 403
- [ ] `POST /internal/pipeline/process` with valid token + valid payload → 200
- [ ] `POST /internal/pipeline/process` without messageId → 400
- [ ] Duplicate messageId returns cached result with `duplicate: true`
- [ ] Unknown route → 404, wrong method → 405
- [ ] `npm run check` passes
- [ ] All tests pass (155 existing + new auth/idempotency tests)
- [ ] CI workflow runs on PR and push to main
