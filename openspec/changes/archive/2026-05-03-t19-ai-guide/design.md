# Design: Módulo `ai-guide` para Serena (T19)

## Technical Approach

Módulo Clean/Hexagonal Architecture dentro de `apps/core/src/modules/ai-guide/`, siguiendo el patrón exacto de los módulos existentes (`inbound-gate`, `mediation-bridge`, `prudent-rewording`):

- `domain/` → tipos puros y políticas (`GuideUseCaseId`, `UseCaseContract`, `GuideResult`, `ExecutionPolicy`)
- `application/ports/` → interfaces abstractas (`LlmProvider`, `AiInvocationAudit`)
- `application/use-cases/` → lógica de orquestación (`UseCaseRegistry`, `ExecutionPipeline`, `AiGuideService`)
- `infrastructure/memory/` → implementaciones in-memory testeables (`MockLlmProvider`, `InMemoryAiInvocationAudit`)
- `tests/` → unitarios con `node:test` + `assert/strict`

`AiGuideService` es la fachada: recibe `GuideUseCaseId` + input, resuelve el contrato en el registry, ejecuta el pipeline, audita y devuelve `GuideResult<T>`. No conoce WhatsApp, sesiones de mediación ni contactos. El orchestrator será su único consumidor en una tarea futura.

## Architecture Decisions

| # | Decision | Choice | Alternatives Rejected | Rationale |
|---|----------|--------|-----------------------|-----------|
| 1 | Módulo separado vs. extender orchestrator | Módulo `ai-guide/` independiente | Extender orchestrator directamente; paquete en `packages/shared/` | El LLM no es el módulo — el caso de uso IA lo es. El orchestrator ya tiene 400+ líneas. Módulo separado mantiene SRP y permite inyectar `AiGuideService` como una dependencia más. |
| 2 | `LlmProvider` como puerto | Type alias `LlmProvider` en `application/ports/` | Dependencia directa a OpenAI SDK; clase abstracta | Testing con `MockLlmProvider` determinístico sin mocks de red. Cambio de proveedor (OpenAI→OpenRouter) sin tocar lógica de negocio. Sigue el patrón `DecisionAudit` / `ContactDirectory` del proyecto. |
| 3 | `GuideResult<T>` genérico | `type GuideResult<T = unknown> = { output: T; ... }` | Union discriminada por `useCaseId`; `output: unknown` | Cada caso de uso devuelve distinto output: `string` para conversation, `{ score, flags }` para risk. El genérico mantiene type safety sin acoplar los tipos de dominio. |
| 4 | Testing con `node:test` nativo | `node:test` + `node:assert/strict`, sin frameworks | Vitest, Jest, Mocha | El proyecto no tiene dependencias npm en `@serena/core`. `node:test` es built-in desde Node 18. Sigue el patrón de `inbound-gate/tests/`. |
| 5 | Mapeo `LlmProfileId` → `GuideUseCaseId` | Interno al módulo, con `NotImplementedError` para `clarification` | Mapeo en el orchestrator; lanzar undefined sin error | Mantiene el acoplamiento bidireccional mínimo. `clarification` preparado pero no implementado — error explícito para que el orchestrator lo maneje gracefulmente. |
| 6 | Aplicación en `use-cases/` vs raíz de `application/` | `application/use-cases/` (sigue convención existente) | `application/` directo (propuesta inicial) | Todos los módulos existentes (`inbound-gate`, `mediation-bridge`, `prudent-rewording`) usan `application/use-cases/`. Consistencia del codebase sobre preferencia estética. |
| 7 | Independencia de dominio | `ai-guide` NO importa de `inbound-gate`, `mediation-bridge`, `whatsapp-gateway` | Reutilizar tipos de inbound-gate directamente | Principio de inversión de dependencia: el módulo define su propio `GuideUseCaseId`. El mapeo desde `LlmProfileId` se hace con string literals duplicados (código muerto intencional para desacoplar). |

## Data Flow

```
AiGuideService.execute(useCaseId, input)
  │
  ├─1→ UseCaseRegistry.get(useCaseId) → UseCaseContract | NotFoundError
  │
  ├─2→ ExecutionPipeline.execute(contract, input)
  │      │
  │      ├─2a→ Build prompt (systemPrompt + inputTemplate interpolation)
  │      ├─2b→ LlmProvider.invoke({ systemPrompt, userPrompt, policy })
  │      │      └→ { content, tokensUsed?, modelUsed? }
  │      ├─2c→ Validate output (nominal check vs outputSchemaName)
  │      ├─2d→ AiInvocationAudit.record(useCaseId, prompt, result)
  │      └─2e→ Return GuideResult<T>
  │
  └─3→ Return GuideResult<T> to caller
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/core/src/modules/ai-guide/domain/guide-use-case-id.ts` | **Create** | String literal type: `"serena.conversation.reply" \| "serena.risk.review" \| "serena.mediation.understand_request" \| "serena.mediation.clarify"` |
| `apps/core/src/modules/ai-guide/domain/use-case-contract.ts` | **Create** | Tipo con `id`, `systemPrompt`, `inputTemplate`, `outputSchemaName`, `executionPolicy` |
| `apps/core/src/modules/ai-guide/domain/guide-result.ts` | **Create** | Genérico `GuideResult<T>` con `useCaseId`, `output: T`, `metadata` (tokens, modelo, tiempo, retryCount), `audited` |
| `apps/core/src/modules/ai-guide/domain/execution-policy.ts` | **Create** | Tipo con `maxTokens`, `temperature`, `retryOnFailure`, `maxRetries`, `timeoutMs` |
| `apps/core/src/modules/ai-guide/application/ports/llm-provider.ts` | **Create** | `LlmProvider` type alias: `invoke(input) → Promise<{content, tokensUsed?, modelUsed?}>` |
| `apps/core/src/modules/ai-guide/application/ports/ai-invocation-audit.ts` | **Create** | `AiInvocationAudit` type alias: `record(input, result) → Promise<void>` |
| `apps/core/src/modules/ai-guide/application/use-cases/use-case-registry.ts` | **Create** | `UseCaseRegistry` class: `register()`, `get()`, `getAll()` |
| `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts` | **Create** | `ExecutionPipeline` class: orquesta provider → audit flow |
| `apps/core/src/modules/ai-guide/application/use-cases/ai-guide-service.ts` | **Create** | `AiGuideService` class: fachada pública, `execute(useCaseId, input) → GuideResult` |
| `apps/core/src/modules/ai-guide/infrastructure/memory/mock-llm-provider.ts` | **Create** | `MockLlmProvider` class: respuestas determinísticas por useCaseId |
| `apps/core/src/modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts` | **Create** | `InMemoryAiInvocationAudit` class: almacena invocaciones en array |
| `apps/core/src/modules/ai-guide/tests/use-case-registry.test.ts` | **Create** | Tests: registro, recuperación, sobrescritura, IDs inexistentes |
| `apps/core/src/modules/ai-guide/tests/execution-pipeline.test.ts` | **Create** | Tests: ejecución exitosa, fallback en error, auditoría |
| `apps/core/src/modules/ai-guide/tests/ai-guide-service.test.ts` | **Create** | Tests: integración registry+pipeline, useCaseId inválido |
| `apps/core/src/modules/ai-guide/tests/mock-llm-provider.test.ts` | **Create** | Tests: determinismo, respuesta por useCaseId |

## Interfaces / Contracts

### Domain Types

```typescript
// guide-use-case-id.ts
export type GuideUseCaseId =
  | "serena.conversation.reply"
  | "serena.risk.review"
  | "serena.mediation.understand_request"
  | "serena.mediation.clarify";

// execution-policy.ts
export type ExecutionPolicy = {
  maxTokens: number;
  temperature: number;
  retryOnFailure: boolean;
  maxRetries: number;
  timeoutMs: number;
};

// use-case-contract.ts
export type UseCaseContract = {
  id: GuideUseCaseId;
  systemPrompt: string;
  inputTemplate: string;
  outputSchemaName: string;
  executionPolicy: ExecutionPolicy;
};

// guide-result.ts
export type GuideResult<T = unknown> = {
  useCaseId: GuideUseCaseId;
  output: T;
  metadata: {
    tokensUsed?: number;
    modelUsed?: string;
    executionTimeMs: number;
    retryCount: number;
  };
  audited: boolean;
};
```

### Port Types (type aliases, not interfaces)

```typescript
// llm-provider.ts
export type LlmProvider = {
  invoke(input: {
    systemPrompt: string;
    userPrompt: string;
    policy: ExecutionPolicy;
  }): Promise<{ content: string; tokensUsed?: number; modelUsed?: string }>;
};

// ai-invocation-audit.ts
export type AiInvocationAudit = {
  record(
    input: { useCaseId: GuideUseCaseId; systemPrompt: string; userPrompt: string },
    result: { output: string; tokensUsed?: number; executionTimeMs: number; success: boolean; error?: string }
  ): Promise<void>;
};
```

### Application Classes

```typescript
// use-case-registry.ts
export class UseCaseRegistry {
  register(contract: UseCaseContract): void;
  get(id: GuideUseCaseId): UseCaseContract | undefined;
  getAll(): readonly UseCaseContract[];
}

// execution-pipeline.ts
export class ExecutionPipeline {
  constructor(deps: { provider: LlmProvider; audit?: AiInvocationAudit });
  execute(contract: UseCaseContract, input: Record<string, string>): Promise<GuideResult>;
}

// ai-guide-service.ts
export class AiGuideService {
  constructor(deps: { registry: UseCaseRegistry; pipeline: ExecutionPipeline });
  execute(useCaseId: GuideUseCaseId, input: Record<string, string>): Promise<GuideResult>;
}
```

### Internal Mapping (`LlmProfileId` → `GuideUseCaseId`)

```typescript
// Definido privadamente dentro de ai-guide-service.ts o en un archivo de mapeo
const PROFILE_TO_USE_CASE: Record<string, GuideUseCaseId> = {
  conversation: "serena.conversation.reply",
  risk_review: "serena.risk.review",
  mediation_understanding: "serena.mediation.understand_request",
  clarification: "serena.mediation.clarify", // preparado, no implementado aún
};
```

Para `clarification`, el servicio lanza `NotImplementedError` si se intenta ejecutar sin contrato registrado.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Domain | Tipos compilables, sin tests de ejecución | TypeScript compiler verifica tipos |
| Ports | Tipos compilables | TypeScript compiler verifica |
| **Unit — Registry** | `register`, `get` (existente e inexistente), `getAll`, sobrescritura | `UseCaseRegistry` + contratos dummy |
| **Unit — Pipeline** | Ejecución exitosa con mock, interpolación de template, auditoría, manejo de errores | `ExecutionPipeline` + `MockLlmProvider` + `InMemoryAiInvocationAudit` |
| **Unit — Service** | `execute` con useCaseId válido, useCaseId sin contrato, mapeo profileId→useCaseId | `AiGuideService` + registry pre-poblado + pipeline con mock |
| **Unit — Mocks** | `MockLlmProvider` devuelve respuestas determinísticas; `InMemoryAiInvocationAudit` almacena y recupera | Tests directos sobre las clases mock |

**Runner**: `node --experimental-strip-types --test src/modules/ai-guide/tests/*.test.ts`  
**Type check**: `tsc -p tsconfig.json --noEmit`

## Migration / Rollout

No migration required. El módulo es nuevo, sin consumidores existentes. El orchestrator lo integrará en una tarea futura (post-T19).

Rollback: eliminar `apps/core/src/modules/ai-guide/` completo. Sin efectos colaterales en otros módulos.

## Open Questions

- [ ] **Definición final de system prompts**: Los `systemPrompt` e `inputTemplate` serán placeholders en T19. ¿Quién define el contenido de producto? (Probablemente una tarea de prompt engineering post-T19)
- [ ] **Validación real de output schemas**: `outputSchemaName` es nominal en T19. ¿Se usará JSON Schema, Zod o validación manual más adelante?
- [ ] **Provider real (OpenAI/OpenRouter)**: ¿En qué tarea se implementa el adapter concreto? T19 solo prepara el puerto y el mock.
