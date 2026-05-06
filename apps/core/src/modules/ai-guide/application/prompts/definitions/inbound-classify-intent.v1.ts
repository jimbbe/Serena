import type { PromptDefinition } from "../../../domain/prompt-definition.ts";

export const inboundClassifyIntentV1: PromptDefinition = {
  id: "serena.inbound.classify_intent.v1",
  version: 1,
  useCaseId: "serena.inbound.classify_intent",
  description: "Clasifica la intención del mensaje entrante para ruteo operativo.",
  systemPrompt:
    "Sos un clasificador de intención para Serena.\n\n" +
    "Tu tarea NO es responder al usuario.\n" +
    "Tu tarea NO es ejecutar acciones.\n" +
    "Tu tarea NO es enviar mensajes.\n" +
    "Tu única tarea es clasificar el mensaje en uno de estos casos de uso:\n\n" +
    "1. conversation — charla casual, compañía, recuerdo, agradecimiento, rutina, clima\n" +
    "   NO es mediación ni riesgo\n" +
    '   Ejemplo: "Hola Serena, ¿cómo estás?"\n' +
    '   Ejemplo: "Después voy a llamar a una amiga"\n' +
    '   Ejemplo: "No necesito nada urgente"\n\n' +
    "2. mediation_understanding — el actor quiere que Serena transmita o avise algo A OTRA PERSONA\n" +
    "   NO si el actor dice que él/ella misma va a contactar a alguien\n" +
    '   Ejemplo: "Avisale a Carlos que llego tarde"\n' +
    '   Ejemplo: "Decile a Juan que me llame"\n' +
    '   Ejemplo: "¿Podés preguntarle a María si viene?"\n\n' +
    "3. risk_review — caída, inmovilidad, emergencia, peligro, dolor fuerte, confusión, angustia intensa\n" +
    '   Ejemplo: "Me caí y no puedo levantarme"\n' +
    '   Ejemplo: "Estoy en peligro"\n' +
    "   NO si el mensaje NIEGA urgencia: 'No necesito nada urgente' → conversation\n\n" +
    "4. clarification — parece pedir una acción pero falta información para clasificar con seguridad\n\n" +
    "Prioridad:\n" +
    "- riesgo real → risk_review\n" +
    "- pedido a tercero → mediation_understanding\n" +
    "- sin acción ni riesgo → conversation\n" +
    "- no estás seguro → clarification\n" +
    "- interpretá la frase completa, no palabras aisladas",
  inputTemplate: "Mensaje a clasificar: {input}",
  contextPolicy: {
    includeCurrentMessage: true,
    includeResolvedIdentity: true,
    includeActorContext: true,
    includeChannelMetadata: false,
    includeConversationHistory: false,
    maxRecentMessages: 0,
    includeKnownContacts: false,
    includeSafetyMemory: false,
    includeFullConversation: false,
  },
  outputContract: {
    format: "json",
    description: "Clasificación de intención operativa.",
    strict: true,
    fields: [
      {
        name: "intent",
        type: "enum",
        required: true,
        description: "Caso de uso operativo al que rutea este mensaje.",
        allowedValues: [
          "conversation",
          "mediation_understanding",
          "risk_review",
          "clarification",
        ],
      },
      {
        name: "confidence",
        type: "number",
        required: true,
        description: "0.0 a 1.0 — seguridad de la clasificación.",
      },
      {
        name: "reason",
        type: "string",
        required: true,
        description: "Explicación breve de por qué esta clasificación.",
      },
    ],
  },
  safetyNotes: [
    "No inventar intención",
    "No clasificar como conversación mensajes con riesgo real",
    "No asumir mediación si el actor habla de llamar él mismo",
    "Usar clarification ante ambigüedad",
  ],
};
