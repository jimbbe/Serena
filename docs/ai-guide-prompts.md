# AI Guide — Prompt System

Documentación autoritativa del sistema de prompts de Serena. Cubre el `PromptRegistry`, `ContextPolicy`, `OutputContract`, actor context, y el flujo completo desde un `useCaseId` hasta el `GuideResult`.

---

## 1. Visión del Producto

### MVP inmediato: puente de mediación

El primer MVP prueba a **Serena como puente de mediación entre dos personas**. Ejemplo concreto: Jim le dice a Serena _"Decile a Mari que llego más tarde"_, Serena analiza el pedido, extrae destinatario y mensaje, redacta draft, y pide confirmación.

Todo esto se prueba vía **Simulation API / Scenario Runner**, sin WhatsApp real, sin LLM real, sin dispositivo físico.

### Futuro

Serena está pensada para una única persona mayor (la abuela), con:
- Un **dispositivo físico local** (`serena_device`) para ella.
- **WhatsApp** como canal remoto para familiares, autorizados, admin o desconocidos.
- **Roles y permisos** que determinen qué puede hacer cada actor.
- **Risk review** como sistema de seguridad, no como conversación casual.

Pero eso viene después. El MVP actual valida **mediación**.

---

## 2. PromptRegistry — Concepto

### Qué es

El **PromptRegistry** es el catálogo centralizado de definiciones de prompts versionados. En lugar de incrustar strings de system prompts en los contratos de casos de uso, los prompts se definen una sola vez con ID versionado y se resuelven en tiempo de ejecución.

### Por qué existe

Antes de este cambio, los `UseCaseContract` tenían `systemPrompt` e `inputTemplate` como strings inline. Esto causaba dos problemas graves:

1. **Fragilidad en tests**: `MockLlmProvider` keyeaba respuestas por el texto exacto del system prompt. Cualquier cambio de texto rompía tests en cadena.
2. **Imposibilidad de auditar versiones**: Sin un identificador estable, era imposible saber qué versión de un prompt produjo un resultado dado.

El `PromptRegistry` resuelve ambos: los mocks keyean por `promptId` (inmutable), y el `GuideResult` registra `promptId` y `promptVersion` en metadata.

### Por qué el prompt se elige por caso de uso, no por canal

El prompt pertenece al dominio de AI Guide, no al adaptador de infraestructura. Si los prompts vivieran en el adaptador de WhatsApp, cambiar de canal requeriría duplicar prompts. El `PromptRegistry` permite que cualquier canal (`whatsapp`, `serena_device`, `simulation`) use los mismos prompts versionados.

---

## 3. PromptId — Formato

Los `PromptId` siguen la convención: `{module}.{capability}.{action}.v{n}`

```
serena.mediation.understand_request.v1
serena.mediation.clarify.v1
serena.conversation.reply.v1
serena.risk.review.v1
```

- Son un TypeScript string literal union (mismo patrón que `GuideUseCaseId`).
- La versión (`v1`, `v2`, etc.) es parte del ID.
- El campo `version` en `PromptDefinition` es el número extraído del sufijo (`v1` → `1`).

---

## 4. PromptDefinition — Estructura

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

## 5. UseCaseContract — Forma

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

## 6. ContextPolicy — Banderas

Define exactamente qué contexto recibe el LLM para cada caso de uso.

| Bandera | Tipo | Descripción |
|---------|------|-------------|
| `includeCurrentMessage` | `boolean` | Incluye el mensaje actual del usuario |
| `includeResolvedIdentity` | `boolean` | Incluye la identidad resuelta de la persona |
| `includeActorContext` | `boolean` | Incluye contexto del actor (rol, canal, permisos) |
| `includeChannelMetadata` | `boolean` | Incluye metadata del canal (WhatsApp, voz, etc.) |
| `includeConversationHistory` | `boolean` | Incluye historial reciente de conversación |
| `maxRecentMessages?` | `number` | Límite de mensajes recientes si `includeConversationHistory` es true |
| `includeKnownContacts` | `boolean` | Incluye lista de contactos conocidos |
| `includeSafetyMemory` | `boolean` | Incluye memoria de seguridad (riesgos previos) |
| `includeFullConversation` | `boolean` | Incluye la conversación completa (Phase 1: siempre false) |
| `notes?` | `string` | Notas para documentación |

### Valores por caso de uso (MVP)

| Use Case | current | identity | actor | channel | history | max | contacts | safety | full |
|----------|---------|----------|-------|---------|---------|-----|----------|--------|------|
| `mediation.understand_request` | ✅ | ✅ | ✅ | ✅ | ✅ | 4 | ✅ | ❌ | ❌ |
| `mediation.clarify` | ✅ | ✅ | ✅ | ❌ | ✅ | 3 | ✅ | ❌ | ❌ |
| `conversation.reply` | ✅ | ✅ | ✅ | ✅ | ✅ | 6 | ❌ | ❌ | ❌ |
| `risk.review` | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | ❌ | ❌ | ❌ |

**Regla fuerte**: ningún caso incluye conversación completa por defecto.

---

## 7. OutputContract

El `OutputContract` documenta en código qué campos devuelve cada prompt y qué significa cada uno. Esto le permite a Serena (y a futuro a un validador) saber qué esperar sin depender exclusivamente del prompt.

### Forma del contrato

```typescript
// Para salida de texto
type OutputContract = {
  format: "text";
  description: string;
};

// Para salida JSON con campos estructurados
type OutputContract = {
  format: "json";
  description: string;
  fields: OutputFieldDefinition[];
  strict: boolean;
};

type OutputFieldDefinition = {
  name: string;
  type: "string" | "boolean" | "string[]" | "enum" | "enum[]" | "number" | "object" | "unknown" | "null" | "string | null";
  required: boolean;
  description: string;
  allowedValues?: string[];
};
```

### Contratos por caso de uso

#### serena.mediation.understand_request.v1

```json
{
  "isMediationRequest": true | false,
  "recipientHint": "nombre" | null,
  "messageDraft": "mensaje" | null,
  "requiresConfirmation": true | false,
  "missingFields": ["recipient", "message", "confirmation"],
  "riskSignal": true | false
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `isMediationRequest` | `boolean` | true | true si el actor quiere que Serena transmita, pregunte o avise algo a otra persona. |
| `recipientHint` | `string \| null` | true | nombre, vínculo o identificador del destinatario mencionado. null si no está claro. |
| `messageDraft` | `string \| null` | true | versión breve, fiel y neutral del mensaje que se quiere transmitir. null si no hay mensaje claro. |
| `requiresConfirmation` | `boolean` | true | true si Serena debe pedir confirmación antes de enviar o continuar. |
| `missingFields` | `string[]` | true | datos faltantes que Serena necesita antes de continuar. Valores permitidos: `["recipient", "message", "confirmation"]`. |
| `riskSignal` | `boolean` | true | true si el pedido contiene señales de salud, caída, urgencia, angustia fuerte, estafa, abuso o peligro. |

#### serena.mediation.clarify.v1

```json
{
  "question": "pregunta breve",
  "reason": "explicación del dato faltante"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `question` | `string` | true | pregunta breve y clara que Serena puede usar para pedir el dato faltante. |
| `reason` | `string` | true | explicación interna breve de qué dato falta o por qué se pregunta. |

#### serena.conversation.reply.v1

Formato: `text`

Texto breve user-facing que Serena puede mostrar o decir al actor. No incluye JSON ni análisis interno.

#### serena.risk.review.v1

```json
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskType": "health" | "emotional" | "safety" | "scam" | "confusion" | "unknown",
  "source": "direct" | "reported" | "system" | "unknown",
  "situationSummary": "resumen breve",
  "recommendedAction": "reply" | "clarify" | "notify_contact" | "human_review",
  "requiresEscalation": true | false,
  "missingInformation": ["dato faltante"]
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `riskLevel` | `enum` | true | gravedad operativa del riesgo. Valores: `["low", "medium", "high", "critical"]`. |
| `riskType` | `enum` | true | categoría principal del riesgo detectado. Valores: `["health", "emotional", "safety", "scam", "confusion", "unknown"]`. |
| `source` | `enum` | true | origen de la información. Valores: `["direct", "reported", "system", "unknown"]`. |
| `situationSummary` | `string` | true | resumen breve de la situación sin diagnóstico. |
| `recommendedAction` | `enum` | true | próxima acción sugerida para Serena. Valores: `["reply", "clarify", "notify_contact", "human_review"]`. |
| `requiresEscalation` | `boolean` | true | true si Serena debería involucrar a una persona autorizada o revisión humana. |
| `missingInformation` | `string[]` | true | datos relevantes que faltan para decidir mejor. |

---

## 8. Actor Context

El `ContextBuilder` acepta un campo `actorContext` que se construye a partir de la identidad resuelta del mensaje. Está **preparado** para crecimiento futuro, pero sin implementar todavía un `PermissionPolicy` completo.

Campos previstos (futuro):
- `actorRole`: `"elder" | "authorized_contact" | "unauthorized_contact" | "admin" | "unknown"`
- `channel`: canal de origen
- `permissions`: permisos del actor
- `isPrimarySubject`: si es la persona principal
- `relationshipToSubject`: vínculo con la persona principal

En el MVP actual, el `actorRole` se deriva del `ResolvedInboundActor.role`:
- `"elder"` → `elder`
- `"contact"` → `authorized_contact` (contacto conocido/autorizado en el seed data)

El `PermissionPolicy` completo vendrá en una fase futura.

---

## 9. Flujo Completo

```
profileId → useCaseId → UseCaseContract → promptId
  → PromptRegistry.get(promptId) → PromptDefinition
  → ContextBuilder.build(policy, contextData) → userPrompt
  → LlmProvider.invoke({ promptId, promptVersion, systemPrompt, userPrompt })
  → GuideResult { metadata: { ..., promptId, promptVersion } }
```

1. `ProcessChannelInboundMessage` resuelve la identidad del actor.
2. El router de perfiles determina el `useCaseId` según el contenido del mensaje.
3. `AiGuideService` obtiene el `UseCaseContract` del `UseCaseRegistry`.
4. El `ExecutionPipeline` resuelve el `PromptDefinition` desde el `PromptRegistry`.
5. El `ContextBuilder` arma el `userPrompt` según el `ContextPolicy`, incluyendo actor context y metadata del canal.
6. El pipeline invoca al `LlmProvider` con `{ promptId, promptVersion, systemPrompt, userPrompt }`.
7. El resultado se audita con `{ promptId, promptVersion, useCaseId, userPrompt }`.
8. El `GuideResult` incluye `promptId` y `promptVersion` en `metadata`.

---

## 10. Principios de Diseño

- **El LLM no es el módulo; el caso de uso es el módulo.**
- **El prompt se elige por caso de uso, no por canal.**
- **Cada caso recibe solo el contexto necesario.**
- **No mandar toda la conversación por defecto.**
- `mediation.understand_request` **no envía mensajes** — solo analiza.
- `mediation.clarify` **no asume información faltante** — pregunta.
- `conversation.reply` **no promete acciones no ejecutadas.**
- `risk.review` **no responde al usuario final** — clasifica.
- Los outputs JSON deben ser estables y validables.
- Clean Architecture: dominio sin dependencias, aplicación depende de dominio, infraestructura implementa puertos.

---

## 11. Cómo Versionar un Prompt Nuevo

1. **Nombrar**: Seguir la convención `{module}.{capability}.{action}.v{n}`
2. **Agregar al tipo**: Añadir el nuevo ID al union type `PromptId` en `domain/prompt-id.ts`.
3. **Definir**: Crear la entrada en `defaultPrompts` en `application/prompts/default-prompts.ts`.
4. **Actualizar contrato**: Si un caso de uso migra a la nueva versión, actualizar `promptId` en `contracts.ts`.
5. **Coexistencia**: Versiones viejas y nuevas pueden coexistir en el registry.

---

## 12. Cómo Auditar Qué Versión de Prompt Produjo un Resultado

Cada `GuideResult` (success y failed) incluye en su `metadata`:

```typescript
{
  promptId: PromptId;      // ej. "serena.mediation.understand_request.v1"
  promptVersion: number;   // ej. 1
}
```

Los registros de auditoría (`AuditRecord`) también almacenan `promptId` y `promptVersion`.

---

## 13. Restricciones del MVP

No implementado todavía:
- WhatsApp real ni `serena_device` real.
- OpenAI/OpenRouter adapter.
- Envío real de mensajes.
- Permisos/admin completos (PermissionPolicy).
- Prompts en DB.
- Panel admin.
- Memoria semántica avanzada.
- Summarizer.
- Herramientas externas.

---

## Referencias

- Domain types: `apps/core/src/modules/ai-guide/domain/`
- Prompt definitions: `apps/core/src/modules/ai-guide/application/prompts/default-prompts.ts`
- ContextBuilder: `apps/core/src/modules/ai-guide/application/prompts/context-builder.ts`
- Pipeline: `apps/core/src/modules/ai-guide/application/use-cases/execution-pipeline.ts`
- Tests: `apps/core/src/modules/ai-guide/tests/`
