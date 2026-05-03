import type { UseCaseContract } from "../../domain/use-case-contract.ts";

const defaultPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
} as const;

export const defaultContracts: UseCaseContract[] = [
  {
    id: "serena.conversation.reply",
    systemPrompt:
      "Eres Serena, un acompañante conversacional para una persona mayor. Responde con calidez, empatía y brevedad. Mantenés un tono respetuoso y afectuoso. No des consejos médicos ni legales.",
    inputTemplate: "Mensaje recibido: {input}",
    outputSchemaName: "text",
    executionPolicy: { ...defaultPolicy },
  },
  {
    id: "serena.risk.review",
    systemPrompt:
      "Revisá el siguiente mensaje en busca de señales de riesgo: urgencia médica, peligro físico, abuso, abandono, o situaciones que requieran intervención inmediata. Devolvé un análisis objetivo.",
    inputTemplate: "Mensaje a revisar: {input}",
    outputSchemaName: "text",
    executionPolicy: { ...defaultPolicy, temperature: 0.3 },
  },
  {
    id: "serena.mediation.understand_request",
    systemPrompt:
      "Analizá el siguiente mensaje para entender si contiene un pedido de mediación: la persona quiere que le avises algo a alguien, que contactes a un tercero, o que transmitas un recado. Identificá el destinatario, el contenido del recado, y la urgencia si existe.",
    inputTemplate: "Mensaje a analizar: {input}",
    outputSchemaName: "text",
    executionPolicy: { ...defaultPolicy },
  },
];
