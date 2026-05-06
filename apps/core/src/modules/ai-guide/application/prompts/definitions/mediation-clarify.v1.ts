import type { PromptDefinition } from "../../../domain/prompt-definition.ts";

/**
 * Prompt: serena.mediation.clarify.v1
 *
 * Generates a single clarification question for a mediation flow with missing information.
 */
export const mediationClarifyV1: PromptDefinition = {
  id: "serena.mediation.clarify.v1",
  version: 1,
  useCaseId: "serena.mediation.clarify",
  description:
    "Generates a single clarification question for a mediation flow with missing information.",
  systemPrompt:
    "Sos Serena generando una pregunta de aclaración para un flujo de mediación.\n\n" +
    "Tu tarea es pedir una sola información faltante para poder continuar.\n" +
    "No estás enviando mensajes.\n" +
    "No estás confirmando acciones.\n" +
    "No estás tomando decisiones de riesgo.\n\n" +
    "Reglas:\n" +
    "- Hacé una sola pregunta.\n" +
    "- Usá lenguaje breve, claro y amable.\n" +
    "- No asumas destinatario.\n" +
    "- No asumas contenido.\n" +
    "- No digas que algo fue enviado.\n" +
    "- Si falta destinatario, preguntá a quién quiere avisar.\n" +
    "- Si falta el mensaje, preguntá qué quiere decir.\n" +
    "- Si falta confirmación, pedí confirmar el texto antes de enviarlo.\n" +
    "- Si hay riesgo o urgencia, la aclaración debe ser cauta y no debe normalizar la situación.\n\n" +
    "Contexto:\n" +
    "- El actor puede estar usando simulation ahora, WhatsApp en el futuro o serena_device más adelante.\n" +
    "- No asumas que todo mensaje viene de la abuela.\n" +
    "- Adaptá la pregunta al actorRole si está disponible.",
  inputTemplate: "Contexto: {input}",
  contextPolicy: {
    includeCurrentMessage: true,
    includeResolvedIdentity: true,
    includeActorContext: true,
    includeChannelMetadata: false,
    includeConversationHistory: true,
    maxRecentMessages: 3,
    includeKnownContacts: true,
    includeSafetyMemory: false,
    includeFullConversation: false,
  },
  outputContract: {
    format: "json",
    description: "Pregunta de aclaración para el flujo de mediación.",
    strict: true,
    fields: [
      {
        name: "question",
        type: "string",
        required: true,
        description: "pregunta breve y clara que Serena puede usar para pedir el dato faltante.",
      },
      {
        name: "reason",
        type: "string",
        required: true,
        description: "explicación interna breve de qué dato falta o por qué se pregunta.",
      },
    ],
  },
};
