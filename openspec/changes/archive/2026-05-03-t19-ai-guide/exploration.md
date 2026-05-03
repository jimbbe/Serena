# Exploration: Módulo `ai-guide` para Serena (T19)

## Current State

El pipeline actual de Serena Core funciona así:

```
IncomingWhatsAppMessage
→ InboundGate (classify → InboundProcessingRoute con nextStep: llm_profile_required)
→ Orchestrator (dispatch según profileId: conversation, mediation_understanding, risk_review)
→ Módulos de negocio (mediation-understanding, contact-directory, etc.)
→ PipelineResult
→ WhatsApp Gateway (mapPipelineResultToGatewayAction)
```

**Lo que existe:**
- `LlmProfileId` es un tipo string literal: `"conversation" | "mediation_understanding" | "risk_review" | "clarification"`
- `InboundProcessingRoute` con `nextStep: "llm_profile_required"` lleva `profileId` y `context`
- El orchestrator dispatcha según `profileId` pero **NO ejecuta LLM real** — solo enruta a módulos de reglas
- Los módulos existentes (prudent-rewording, mediation-understanding) usan templates/rules, NO LLM
- Patrón Clean Architecture consistente: `domain/` → `application/ports/` → `application/use-cases/` → `infrastructure/memory/` → `tests/`
- Tests con `node:test` + `assert/strict`, sin frameworks externos
- `tsconfig.base.json`: ES2022, NodeNext, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes

**Lo que NO existe:**
- No hay módulo `ai-guide`
- No hay puerto `LlmProvider`
- No hay concepto de `UseCaseContract` o `GuideUseCaseId`
- No hay `ExecutionPolicy` ni `ExecutionPipeline`
- No hay audit de invocaciones AI (`AiInvocationAudit`)

## Affected Areas

- `apps/core/src/modules/ai-guide/` — **nuevo módulo** (no existe)
- `apps/core/src/modules/inbound-gate/domain/llm-profile.ts` — referencia: define `LlmProfileId`
- `apps/core/src/modules/inbound-gate/domain/inbound-processing-route.ts` — referencia: `InboundProcessingRoute` con `llm_profile_required`
- `apps/core/src/modules/orchestrator/domain/pipeline-result.ts` — referencia: `PipelineResult` variants
- `apps/core/src/modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts` — futuro consumidor de ai-guide
- `apps/core/package.json` — puede necesitar actualización si hay nuevos workspaces (no aplica, ai-guide es interno a core)

## Approaches

### Approach 1: Módulo independiente `ai-guide` (Recomendado)

Crear `apps/core/src/modules/ai-guide/` como módulo Clean Architecture completo, agnóstico de cualquier proveedor LLM.

**Estructura:**
```
ai-guide/
├── domain/
│   ├── guide-use-case-id.ts        # type GuideUseCaseId = "serena.conversation.reply" | ...
│   ├── use-case-contract.ts        # interface con systemPrompt, inputTemplate, outputSchema, executionPolicy
│   ├── guide-result.ts             # resultado estructurado del pipeline
│   └── execution-policy.ts         # restricciones: maxTokens, temperature, retryPolicy, timeout
├── application/
│   ├── ports/
│   │   ├── llm-provider.ts         # interface LlmProvider { invoke(input): Promise<output> }
│   │   └── ai-invocation-audit.ts  # interface AiInvocationAudit { record(...): Promise<void> }
│   ├── use-case-registry.ts        # registro de contratos por GuideUseCaseId
│   ├── execution-pipeline.ts       # orquestador interno: validate → build prompt → invoke → validate output
│   └── ai-guide-service.ts         # fachada pública: execute(useCaseId, input) → GuideResult
├── infrastructure/memory/
│   ├── mock-llm-provider.ts        # MockLlmProvider determinístico para tests
│   └── in-memory-ai-invocation-audit.ts # adapter in-memory para auditoría
└── tests/
    ├── use-case-registry.test.ts
    ├── execution-pipeline.test.ts
    ├── ai-guide-service.test.ts
    └── mock-llm-provider.test.ts
```

**Pros:**
- Sigue el patrón exacto del proyecto (inbound-gate, mediation-bridge, etc.)
- Completamente agnóstico de proveedor — el `LlmProvider` es un puerto
- Testeable con `MockLlmProvider` determinístico
- Sin dependencias de WhatsApp ni envío de mensajes
- El orchestrator puede inyectar `AiGuideService` como dependencia más adelante
- Separa claramente "qué se necesita" (contratos) de "cómo se ejecuta" (provider)

**Cons:**
- Requiere definir todos los tipos desde cero
- El mapeo profileId → useCaseId necesita documentación clara

**Effort:** Medium

### Approach 2: Extender el orchestrator directamente

Agregar la lógica de ejecución de LLM directamente dentro del orchestrator, sin módulo separado.

**Pros:**
- Menos archivos
- Cambio más directo

**Cons:**
- Viola el principio de Clean Architecture del proyecto
- El orchestrator ya es grande (405 líneas)
- Acopla la ejecución de LLM con la coordinación de módulos
- No permite reutilizar el registry de use cases en otros contextos
- Hardcodea los prompts dentro del orchestrator

**Effort:** Low (pero costo de mantenimiento alto)

### Approach 3: Módulo compartido en `packages/shared/`

Crear el ai-guide como paquete compartido.

**Pros:**
- Podría ser reutilizado por otros servicios (panel, gateway, etc.)

**Cons:**
- Prematuro — no hay otro consumidor
- El proyecto mantiene la convención de módulos dentro de `apps/core/src/modules/`
- Agrega complejidad de build innecesaria

**Effort:** Medium-High

## Recommendation

**Approach 1: Módulo independiente `ai-guide`**

Razones:
1. Sigue EXACTAMENTE el patrón Clean Architecture del proyecto
2. Es el más testeable (MockLlmProvider in-memory)
3. Mantiene separación de responsabilidades clara
4. Permite al orchestrator inyectar `AiGuideService` como una dependencia más (como ya hace con `InboundMessageProcessor`, `MessageReworder`, etc.)
5. El puerto `LlmProvider` permite cambiar de proveedor sin tocar lógica de negocio

## Tipos Necesarios

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
  inputTemplate: string; // template con placeholders
  outputSchemaName: string; // nombre del schema esperado
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

### Port Interfaces

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
  record(input: {
    useCaseId: GuideUseCaseId;
    systemPrompt: string;
    userPrompt: string;
  }, result: {
    output: string;
    tokensUsed?: number;
    executionTimeMs: number;
    success: boolean;
    error?: string;
  }): Promise<void>;
};
```

### Application Types

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

## Mapeo de Profile IDs a Use Case IDs

| LlmProfileId (inbound-gate) | GuideUseCaseId (ai-guide) | Estado |
|---|---|---|
| `conversation` | `serena.conversation.reply` | Implementar |
| `risk_review` | `serena.risk.review` | Implementar |
| `mediation_understanding` | `serena.mediation.understand_request` | Implementar |
| `clarification` | `serena.mediation.clarify` | Preparar (no implementar aún) |

**Nota:** Los 4 profile IDs ya existen en `llm-profile.ts`. El módulo `ai-guide` NO modifica ese tipo — solo consume los valores y los mapea internamente a `GuideUseCaseId`.

## Riesgos

1. **Acoplamiento futuro con el orchestrator:** El orchestrator actualmente dispatcha por `profileId` directamente a módulos de reglas. Cuando `ai-guide` exista, el orchestrator necesitará inyectar `AiGuideService` como dependencia. Esto es un cambio en el orchestrator que debe hacerse en una tarea separada (no en T19).

2. **Definición de prompts:** Los `systemPrompt` e `inputTemplate` de cada `UseCaseContract` son contenido de producto que debe definirse con cuidado. Para T19, pueden ser placeholders o templates mínimos — la definición real puede venir en una tarea posterior.

3. **Output schema validation:** El `outputSchemaName` sugiere validación de output. Para T19, puede ser un string nominal (solo para trazabilidad). Validación real de schema JSON puede venir después.

4. **No hay dependencias npm externas:** El proyecto actualmente no usa ninguna librería externa en `@serena/core`. El `MockLlmProvider` debe ser completamente determinístico sin dependencias.

5. **TypeScript strict mode:** `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` requieren cuidado extra con tipos opcionales e indexados.

## Ready for Proposal

**Yes.** La exploración identificó:
- El patrón arquitectónico exacto a seguir (Clean Architecture como los demás módulos)
- Todos los tipos necesarios y sus relaciones
- El mapeo claro de profileId → useCaseId
- Que el módulo debe ser completamente agnóstico de proveedor
- Que los tests deben usar `node:test` + `assert/strict` sin frameworks externos
- Que no se debe modificar el orchestrator en esta tarea (se prepara el terreno)

**Recomendación para el orchestrator:** Ejecutar `/sdd-propose` para crear la propuesta de cambio con scope, approach y rollback plan.
