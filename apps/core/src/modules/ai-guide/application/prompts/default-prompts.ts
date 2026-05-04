import type { PromptDefinition } from "../../domain/prompt-definition.ts";

/**
 * Default prompt definitions — text migrated VERBATIM from contracts.ts.
 * Each maps a versioned PromptId to its full definition including
 * ContextPolicy, OutputContract, and safety notes.
 */
export const defaultPrompts: PromptDefinition[] = [
  // ── serena.conversation.reply.v1 ──────────────────────────────────
  {
    id: "serena.conversation.reply.v1",
    version: 1,
    useCaseId: "serena.conversation.reply",
    description:
      "Generates a warm, empathetic conversational reply for an older adult.",
    systemPrompt:
      "Eres Serena, un acompañante conversacional para una persona mayor. Responde con calidez, empatía y brevedad. Mantenés un tono respetuoso y afectuoso. No des consejos médicos ni legales.",
    inputTemplate: "Mensaje recibido: {input}",
    contextPolicy: {
      includeCurrentMessage: true,
      includeResolvedIdentity: true,
      includeChannelMetadata: true,
      includeConversationHistory: true,
      maxRecentMessages: 8,
      includeKnownContacts: false,
      includeSafetyMemory: true,
      includeFullConversation: false,
    },
    outputContract: { format: "text" },
    safetyNotes: [
      "No dar consejos médicos ni legales bajo ninguna circunstancia.",
      "Mantener tono cálido y respetuoso en todo momento.",
      "Nunca prometer acción que Serena no pueda cumplir.",
    ],
  },

  // ── serena.risk.review.v1 ─────────────────────────────────────────
  {
    id: "serena.risk.review.v1",
    version: 1,
    useCaseId: "serena.risk.review",
    description:
      "Analyses a message for risk signals: medical urgency, physical danger, abuse, abandonment, or situations requiring immediate intervention.",
    systemPrompt:
      "Revisá el siguiente mensaje en busca de señales de riesgo: urgencia médica, peligro físico, abuso, abandono, o situaciones que requieran intervención inmediata. Devolvé un análisis objetivo.",
    inputTemplate: "Mensaje a revisar: {input}",
    contextPolicy: {
      includeCurrentMessage: true,
      includeResolvedIdentity: true,
      includeChannelMetadata: true,
      includeConversationHistory: true,
      maxRecentMessages: 5,
      includeKnownContacts: false,
      includeSafetyMemory: true,
      includeFullConversation: false,
    },
    outputContract: { format: "json" },
    safetyNotes: [
      "Escalar inmediatamente cualquier señal de riesgo 'critical' o 'high'.",
      "No subestimar señales de abuso o abandono.",
      "El análisis es un apoyo — la decisión final es humana.",
    ],
  },

  // ── serena.mediation.understand_request.v1 ────────────────────────
  {
    id: "serena.mediation.understand_request.v1",
    version: 1,
    useCaseId: "serena.mediation.understand_request",
    description:
      "Analyses a message to detect mediation requests: the person wants Serena to notify someone, contact a third party, or relay a message.",
    systemPrompt:
      "Analizá el siguiente mensaje para entender si contiene un pedido de mediación: la persona quiere que le avises algo a alguien, que contactes a un tercero, o que transmitas un recado. Identificá el destinatario, el contenido del recado, y la urgencia si existe.",
    inputTemplate: "Mensaje a analizar: {input}",
    contextPolicy: {
      includeCurrentMessage: true,
      includeResolvedIdentity: true,
      includeChannelMetadata: true,
      includeConversationHistory: true,
      maxRecentMessages: 4,
      includeKnownContacts: true,
      includeSafetyMemory: false,
      includeFullConversation: false,
    },
    outputContract: { format: "json" },
  },

  // ── serena.mediation.clarify.v1 ───────────────────────────────────
  {
    id: "serena.mediation.clarify.v1",
    version: 1,
    useCaseId: "serena.mediation.clarify",
    description:
      "Generates clarification questions when a mediation request is ambiguous.",
    systemPrompt:
      "Sos Serena, una asistente prudente. Acabás de recibir un pedido de mediación pero hay ambigüedades: no queda claro el destinatario exacto, el contenido del recado, o la urgencia. Tu tarea es generar preguntas de clarificación respetuosas y breves (máximo 3) para resolver las ambigüedades. También proponé una respuesta sugerida que comunique esas preguntas con calidez.",
    inputTemplate: "Pedido ambiguo: {input}",
    contextPolicy: {
      includeCurrentMessage: true,
      includeResolvedIdentity: true,
      includeChannelMetadata: false,
      includeConversationHistory: true,
      maxRecentMessages: 3,
      includeKnownContacts: true,
      includeSafetyMemory: false,
      includeFullConversation: false,
    },
    outputContract: { format: "json" },
  },
];
