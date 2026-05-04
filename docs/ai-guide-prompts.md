# AI Guide — Prompt System

Documentación autoritativa del sistema de prompts de Serena. Cubre el `PromptRegistry`, `ContextPolicy`, `OutputContract`, y el flujo completo desde un `useCaseId` hasta el `GuideResult`.

---

## 1. PromptRegistry — Concepto

### Qué es

El **PromptRegistry** es el catálogo centralizado de definiciones de prompts versionados. En lugar de incrustar strings de system prompts en los contratos de casos de uso, los prompts se definen una sola vez con ID versionado y se resuelven en tiempo de ejecución.

### Por qué existe

Antes de este cambio, los `UseCaseContract` tenían `systemPrompt` e `inputTemplate` como strings inline. Esto causaba dos problemas graves:

1. **Fragilidad en tests**: `MockLlmProvider` keyeaba respuestas por el texto exacto del system prompt. Cualquier cambio de texto (una coma, un espacio) rompía tests en cadena.
2. **Imposibilidad de auditar versiones**: Sin un identificador estable, era imposible saber qué versión de un prompt produjo un resultado dado.

El `PromptRegistry` resuelve ambos: los mocks keyean por `promptId` (inmutable), y el `GuideResult` registra `promptId` y `promptVersion` en metadata.

### Cómo se resuelven los prompts

```
useCaseId → UseCaseContract.promptId → PromptRegistry.get(promptId) → PromptDefinition
```

El `PromptRegistry` es un port en `application/ports/` con implementación en memoria (`InMemoryPromptRegistry`). No tiene dependencias externas (sin DB, sin red, sin archivos).

---

## 2. PromptId — Formato

Los `PromptId` siguen la convención: `{module}.{capability}.{action}.v{n}`

```
serena.conversation.reply.v1
serena.risk.review.v1
serena.mediation.understand_request.v1
serena.mediation.clarify.v1
```

- Son un TypeScript string literal union (mismo patrón que `GuideUseCaseId`).
- La versión (`v1`, `v2`, etc.) es parte del ID.
- El campo `version` en `PromptDefinition` es el número extraído del sufijo (`v1` → `1`).

---

## 3. PromptDefinition — Estructura

Cada prompt tiene esta definición completa:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `PromptId` | Identificador versionado |
| `version` | `number` | Número de versión (extraído del ID) |
| `useCaseId` | `GuideUseCaseId` | Caso de uso al que pertenece |
| `description` | `string` | Propósito del prompt |
| `systemPrompt` | `string` | Prompt de sistema que recibe el LLM |
| `inputTemplate` | `string?` | Template con placeholders `{input}` para el mensaje del usuario |
| `developerPrompt` | `string?` | Instrucciones adicionales para el LLM (developer message) |
| `contextPolicy` | `ContextPolicy` | Qué contexto se incluye al invocar el LLM |
| `outputContract` | `OutputContract` | Formato esperado: `text` o `json` |
| `safetyNotes` | `string[]?` | Consideraciones de seguridad |

---

## 4. UseCaseContract — Forma

El contrato es **lean**: referencia el prompt por ID y define la política de ejecución.

```typescript
{
  id: GuideUseCaseId;
  promptId: PromptId;
  executionPolicy: ExecutionPolicy;
}
```

**Importante**: El `contextPolicy` vive en `PromptDefinition` (single source of truth), NO se duplica en el contrato.

---

## 5. ContextPolicy — Banderas

Define exactamente qué contexto recibe el LLM para cada caso de uso.

| Bandera | Tipo | Descripción |
|---------|------|-------------|
| `includeCurrentMessage` | `boolean` | Incluye el mensaje actual del usuario |
| `includeResolvedIdentity` | `boolean` | Incluye la identidad resuelta de la persona |
| `includeChannelMetadata` | `boolean` | Incluye metadata del canal (WhatsApp, voz, etc.) |
| `includeConversationHistory` | `boolean` | Incluye historial reciente de conversación |
| `maxRecentMessages?` | `number` | Límite de mensajes recientes si `includeConversationHistory` es true |
| `includeKnownContacts` | `boolean` | Incluye lista de contactos conocidos |
| `includeSafetyMemory` | `boolean` | Incluye memoria de seguridad (riesgos previos) |
| `includeFullConversation` | `boolean` | Incluye la conversación completa (Phase 1: siempre false) |
| `notes?` | `string` | Notas para documentación |

### Valores por caso de uso

| Use Case | currentMsg | identity | channel | history | maxRecent | contacts | safety | fullConv |
|----------|-----------|----------|---------|---------|-----------|----------|--------|----------|
| `serena.conversation.reply` | ✅ | ✅ | ✅ | ✅ | 8 | ❌ | ✅ | ❌ |
| `serena.risk.review` | ✅ | ✅ | ✅ | ✅ | 5 | ❌ | ✅ | ❌ |
| `serena.mediation.understand_request` | ✅ | ✅ | ✅ | ✅ | 4 | ✅ | ❌ | ❌ |
| `serena.mediation.clarify` | ✅ | ✅ | ❌ | ✅ | 3 | ✅ | ❌ | ❌ |

---

## 6. OutputContract — Text vs JSON

| Prompt | Formato | Schema |
|--------|---------|--------|
| `serena.conversation.reply.v1` | `text` | Texto libre, respuesta conversacional |
| `serena.risk.review.v1` | `json` | `{ riskLevel, signals[], requiresImmediateAction, reasoning }` |
| `serena.mediation.understand_request.v1` | `json` | `{ hasMediationRequest, recipient?, messageContent?, urgency, confidence, reasoning }` |
| `serena.mediation.clarify.v1` | `json` | `{ clarificationQuestions[], ambiguousElements[], suggestedResponse }` |

---

## 7. Flujo Completo

```
profileId → useCaseId → promptId → PromptRegistry → ContextBuilder → ExecutionPipeline → GuideResult
```

1. El router de perfiles determina el `useCaseId` según el contenido del mensaje.
2. `AiGuideService` obtiene el `UseCaseContract` del `UseCaseRegistry`.
3. El `ExecutionPipeline` resuelve el `PromptDefinition` desde el `PromptRegistry` usando `contract.promptId`.
4. El `ContextBuilder` arma el `userPrompt` según el `ContextPolicy` (template interpolation + flags).
5. El pipeline invoca al `LlmProvider` con `{ promptId, promptVersion, systemPrompt, userPrompt, developerPrompt? }`.
6. El resultado se audita con `{ promptId, promptVersion, useCaseId, userPrompt }`.
7. El `GuideResult` incluye `promptId` y `promptVersion` en `metadata`.

---

## 8. Por Qué los Prompts No Viven en los Adaptadores de WhatsApp

**Separación de concerns**: Los prompts son dominio de AI Guide, no de infraestructura de mensajería.

- Los adaptadores de WhatsApp manejan transporte (recibir/enviar mensajes).
- Los prompts definen el comportamiento del LLM.
- Si los prompts vivieran en el adaptador, cambiar de WhatsApp a Telegram requeriría duplicar prompts.
- El `PromptRegistry` permite que cualquier canal use los mismos prompts versionados.

**Domain ownership**: Los prompts pertenecen al módulo `ai-guide`, que es responsable de la calidad y seguridad de las respuestas del LLM.

---

## 9. Cómo Versionar un Prompt Nuevo

1. **Nombrar**: Seguir la convención `{module}.{capability}.{action}.v{n}`
   - Ejemplo: `serena.conversation.reply.v2`
2. **Agregar al tipo**: Añadir el nuevo ID al union type `PromptId` en `domain/prompt-id.ts`.
3. **Definir**: Crear la entrada en `defaultPrompts` en `application/prompts/default-prompts.ts`.
4. **Actualizar contrato**: Si un caso de uso migra a la nueva versión, actualizar `promptId` en `contracts.ts`.
5. **Coexistencia**: Versiones viejas y nuevas pueden coexistir en el registry. Distintos casos de uso pueden usar distintas versiones.

---

## 10. Cómo Auditar Qué Versión de Prompt Produjo un Resultado

Cada `GuideResult` (success y failed) incluye en su `metadata`:

```typescript
{
  promptId: PromptId;      // ej. "serena.conversation.reply.v1"
  promptVersion: number;   // ej. 1
  // ... otros campos de metadata
}
```

Los registros de auditoría (`AuditRecord`) también almacenan `promptId` y `promptVersion`.

Para trazar qué prompt produjo un resultado:
1. Inspeccionar `result.metadata.promptId` y `result.metadata.promptVersion`.
2. Buscar en los registros de auditoría por `promptId` para ver todas las invocaciones de esa versión.
3. Comparar resultados entre versiones (`v1` vs `v2`) para evaluar mejoras.

---

## Referencias

- Spec: `openspec/changes/prompt-registry/spec.md`
- Design: `openspec/changes/prompt-registry/design.md`
- Tasks: `openspec/changes/prompt-registry/tasks.md`
- Domain types: `apps/core/src/modules/ai-guide/domain/`
- Implementations: `apps/core/src/modules/ai-guide/application/prompts/`
- Tests: `apps/core/src/modules/ai-guide/tests/`
