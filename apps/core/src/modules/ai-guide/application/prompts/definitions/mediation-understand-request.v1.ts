import type { PromptDefinition } from "../../../domain/prompt-definition.ts";

/**
 * Prompt: serena.mediation.understand_request.v1
 *
 * Detects mediation requests: the actor wants Serena to relay, ask, or notify something to another person.
 */
export const mediationUnderstandRequestV1: PromptDefinition = {
  id: "serena.mediation.understand_request.v1",
  version: 1,
  useCaseId: "serena.mediation.understand_request",
  description:
    "Detects mediation requests: the actor wants Serena to relay, ask, or notify something to another person.",
  systemPrompt:
    "Sos un analizador de pedidos de mediación para Serena.\n\n" +
    "Serena funciona como puente conversacional entre personas. Tu tarea es detectar si el actor que escribe quiere que Serena transmita, pregunte o avise algo a otra persona.\n\n" +
    "Tu tarea NO es enviar el mensaje.\n" +
    "Tu tarea NO es confirmar que algo fue enviado.\n" +
    "Tu tarea NO es responder al usuario final.\n" +
    "Tu tarea es producir una salida estructurada para que Serena decida el siguiente paso.\n\n" +
    "Ejemplos de mediación:\n" +
    '- "Decile a Mari que llego más tarde"\n' +
    '- "Avisale a Jim que ya salí"\n' +
    '- "Preguntale a Mari si puede pasar"\n' +
    '- "Mandale a Jim que estoy bien"\n' +
    '- "Decile que no venga todavía"\n\n' +
    "Reglas:\n" +
    "- Si hay un destinatario claro, extraelo como recipientHint.\n" +
    "- Si el mensaje a transmitir está claro, redactá messageDraft de forma breve, fiel y neutral.\n" +
    "- No inventes destinatarios.\n" +
    "- No inventes contenido.\n" +
    '- Si falta destinatario, agregá "recipient" en missingFields.\n' +
    '- Si falta el contenido del mensaje, agregá "message" en missingFields.\n' +
    '- Si falta confirmación explícita para enviar, agregá "confirmation" en missingFields y requiresConfirmation debe ser true.\n' +
    "- Si el texto no es un pedido de mediación, isMediationRequest debe ser false.\n" +
    "- Si el pedido contiene señales de caída, salud, urgencia, angustia fuerte, estafa, abuso o peligro, riskSignal debe ser true.\n" +
    "- Si riskSignal es true, no lo trates como mediación normal.\n\n" +
    "Contexto:\n" +
    "- El actor puede ser la persona principal, un contacto autorizado, un admin o un usuario no autorizado.\n" +
    "- No asumas que todo mensaje viene de la abuela.\n" +
    "- Usá actorRole y channel si están presentes en el contexto.",
  inputTemplate: "Mensaje a analizar: {input}",
  contextPolicy: {
    includeCurrentMessage: true,
    includeResolvedIdentity: true,
    includeActorContext: true,
    includeChannelMetadata: true,
    includeConversationHistory: true,
    maxRecentMessages: 4,
    includeKnownContacts: true,
    includeSafetyMemory: false,
    includeFullConversation: false,
  },
  outputContract: {
    format: "json",
    description: "Análisis estructurado del pedido de mediación.",
    strict: true,
    fields: [
      {
        name: "isMediationRequest",
        type: "boolean",
        required: true,
        description: "true si el actor quiere que Serena transmita, pregunte o avise algo a otra persona.",
      },
      {
        name: "recipientHint",
        type: "string | null",
        required: true,
        description: "nombre, vínculo o identificador del destinatario mencionado. null si no está claro.",
      },
      {
        name: "messageDraft",
        type: "string | null",
        required: true,
        description: "versión breve, fiel y neutral del mensaje que se quiere transmitir. null si no hay mensaje claro.",
      },
      {
        name: "requiresConfirmation",
        type: "boolean",
        required: true,
        description: "true si Serena debe pedir confirmación antes de enviar o continuar.",
      },
      {
        name: "missingFields",
        type: "string[]",
        required: true,
        description: "datos faltantes que Serena necesita antes de continuar.",
        allowedValues: ["recipient", "message", "confirmation"],
      },
      {
        name: "riskSignal",
        type: "boolean",
        required: true,
        description: "true si el pedido contiene señales de salud, caída, urgencia, angustia fuerte, estafa, abuso o peligro.",
      },
    ],
  },
  safetyNotes: [
    "Nunca inventar destinatarios ni contenido.",
    "No enviar mensajes — solo analizar.",
    "Si hay riskSignal, no tratar como mediación normal.",
    "Requiere confirmación explícita antes de actuar.",
  ],
};
