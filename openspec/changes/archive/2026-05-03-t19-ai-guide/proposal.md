# Proposal: Módulo `ai-guide` para Serena (T19)

## Intent

El pipeline de Serena recibe mensajes de WhatsApp y los clasifica en rutas que requieren ejecución de LLM (`llm_profile_required`), pero no existe ningún módulo capaz de ejecutar un caso de uso de IA. Este cambio crea la infraestructura agnóstica de proveedor para que el orchestrator pueda invocar LLMs de forma estructurada, auditada y testeable, sin acoplar a ningún proveedor real.

## Scope

### In Scope
- Módulo `apps/core/src/modules/ai-guide/` con dominio, puertos, lógica e infraestructura in-memory
- Tipos de dominio: `GuideUseCaseId`, `UseCaseContract`, `GuideResult`, `ExecutionPolicy`
- Puertos: `LlmProvider` (agnóstico), `AiInvocationAudit` (auditoría)
- Lógica: `UseCaseRegistry`, `ExecutionPipeline`, `AiGuideService`
- Infraestructura: `MockLlmProvider` determinístico, `InMemoryAiInvocationAudit`
- Tests unitarios con `node:test` + `assert/strict`
- Mapeo interno: `LlmProfileId` → `GuideUseCaseId`

### Out of Scope
- Integración con OpenAI, OpenRouter u otro proveedor real
- Modificar `inbound-gate`, `mediation-bridge` ni `orchestrator`
- Envío de mensajes por WhatsApp
- Validación real de JSON schemas de output
- Definición final de system prompts (se usarán placeholders)

## Capabilities

### New Capabilities
- `ai-guide-execution`: ejecución de casos de uso IA con contrato, provider agnóstico y auditoría

### Modified Capabilities
- None

## Approach

Clean/Hexagonal Architecture siguiendo el patrón exacto de los módulos existentes (`inbound-gate`, `mediation-bridge`):

1. **Domain** define qué se necesita (contratos, políticas, resultados)
2. **Application ports** definen interfaces abstractas (`LlmProvider`, `AiInvocationAudit`)
3. **Application logic** orquesta: registry → pipeline → service
4. **Infrastructure in-memory** provee implementaciones testeables sin dependencias externas

El `AiGuideService` es la fachada pública: recibe `GuideUseCaseId` + input, resuelve el contrato, ejecuta el pipeline con el provider, audita y devuelve `GuideResult`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/ai-guide/` | New | Módulo completo (domain, application, infrastructure, tests) |
| `apps/core/src/modules/inbound-gate/domain/llm-profile.ts` | None (reference only) | Import de `LlmProfileId` para mapeo interno |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Acoplamiento futuro con orchestrator | Medium | T19 solo prepara el módulo; la integración se hace en tarea separada |
| Prompts placeholder sin definición de producto | High | Documentar que los prompts son mínimos; tarea posterior los define |
| Output schema validation nominal | Medium | `outputSchemaName` es string nominal en T19; validación real después |
| TypeScript strict mode (`exactOptionalPropertyTypes`) | Low | Seguir patrones existentes del proyecto con cuidado en opcionales |

## Rollback Plan

Eliminar el directorio `apps/core/src/modules/ai-guide/` completo. No hay imports externos ni modificaciones en otros módulos, por lo que la eliminación es limpia y sin efectos colaterales.

## Dependencies

- Ninguna dependencia npm nueva
- Referencia interna a `LlmProfileId` de `inbound-gate` (sin modificar)

## Success Criteria

- [ ] `AiGuideService` resuelve un `GuideUseCaseId` y devuelve `GuideResult` con metadata de ejecución
- [ ] `MockLlmProvider` devuelve respuestas determinísticas sin dependencias externas
- [ ] `InMemoryAiInvocationAudit` registra invocaciones accesibles para verificación
- [ ] Todos los tests unitarios pasan con `npm test`
- [ ] `npm run check` sin errores de tipo ni lint
- [ ] Cero dependencias npm nuevas en `@serena/core`
- [ ] Cero modificaciones en módulos existentes (solo imports de referencia)
