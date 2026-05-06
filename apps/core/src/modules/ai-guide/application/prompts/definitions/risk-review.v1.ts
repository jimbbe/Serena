import type { PromptDefinition } from "../../../domain/prompt-definition.ts";

/**
 * Prompt: serena.risk.review.v1
 *
 * Evaluates a message for risk signals. Prepared for future use; not the center of the current mediation MVP.
 */
export const riskReviewV1: PromptDefinition = {
  id: "serena.risk.review.v1",
  version: 1,
  useCaseId: "serena.risk.review",
  description:
    "Evaluates a message for risk signals. Prepared for future use; not the center of the current mediation MVP.",
  systemPrompt:
    "Sos un evaluador de riesgo operativo para Serena.\n\n" +
    "Tu tarea NO es responder al usuario final.\n" +
    "Tu tarea es analizar el mensaje y devolver una clasificación estructurada para que Serena decida cuánta autonomía puede tener.\n\n" +
    "Evaluá señales de:\n" +
    "- salud o malestar físico;\n" +
    "- caída o imposibilidad de moverse;\n" +
    "- dificultad para respirar;\n" +
    "- dolor fuerte;\n" +
    "- confusión, desorientación o deterioro cognitivo aparente;\n" +
    "- seguridad física;\n" +
    "- posible estafa, manipulación o pedido sospechoso;\n" +
    "- abuso, coerción o presión de terceros;\n" +
    "- soledad severa, angustia intensa o daño emocional;\n" +
    "- urgencia o necesidad de intervención humana.\n\n" +
    "Reglas:\n" +
    "- No diagnostiques.\n" +
    "- No respondas al usuario.\n" +
    "- No indiques que una acción ya fue ejecutada.\n" +
    "- No exageres riesgo si falta evidencia.\n" +
    "- Si falta información relevante, agregala en missingInformation.\n" +
    '- Si actorRole indica que habla la persona afectada, source debe ser "direct".\n' +
    '- Si actorRole indica que habla un contacto autorizado reportando sobre otra persona, source debe ser "reported".\n' +
    '- Si no está claro quién informa, source debe ser "unknown".\n' +
    "- Usá high o critical cuando haya caída, imposibilidad de levantarse, dificultad respiratoria, peligro inmediato, posible autodaño o situación que requiera intervención urgente.",
  inputTemplate: "Mensaje a revisar: {input}",
  contextPolicy: {
    includeCurrentMessage: true,
    includeResolvedIdentity: true,
    includeActorContext: true,
    includeChannelMetadata: true,
    includeConversationHistory: true,
    maxRecentMessages: 5,
    includeKnownContacts: false,
    includeSafetyMemory: false,
    includeFullConversation: false,
  },
  outputContract: {
    format: "json",
    description: "Clasificación estructurada de riesgo operativo para Serena.",
    strict: true,
    fields: [
      {
        name: "riskLevel",
        type: "enum",
        required: true,
        description: "gravedad operativa del riesgo.",
        allowedValues: ["low", "medium", "high", "critical"],
      },
      {
        name: "riskType",
        type: "enum",
        required: true,
        description: "categoría principal del riesgo detectado.",
        allowedValues: ["health", "emotional", "safety", "scam", "confusion", "unknown"],
      },
      {
        name: "source",
        type: "enum",
        required: true,
        description: "origen de la información.",
        allowedValues: ["direct", "reported", "system", "unknown"],
      },
      {
        name: "situationSummary",
        type: "string",
        required: true,
        description: "resumen breve de la situación sin diagnóstico.",
      },
      {
        name: "recommendedAction",
        type: "enum",
        required: true,
        description: "próxima acción sugerida para Serena.",
        allowedValues: ["reply", "clarify", "notify_contact", "human_review"],
      },
      {
        name: "requiresEscalation",
        type: "boolean",
        required: true,
        description: "true si Serena debería involucrar a una persona autorizada o revisión humana.",
      },
      {
        name: "missingInformation",
        type: "string[]",
        required: true,
        description: "datos relevantes que faltan para decidir mejor.",
      },
    ],
  },
  safetyNotes: [
    "No diagnosticar ni responder al usuario final.",
    "Escalar high/critical inmediatamente.",
    "Distinguir source: direct vs reported vs unknown.",
    "No exagerar riesgo sin evidencia.",
  ],
};
