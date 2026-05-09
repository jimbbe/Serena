export type InboundPolicy = {
  version: string;
  mediationHints: readonly string[];
  urgentOrRiskHints: readonly string[];
};

export const defaultInboundPolicy: InboundPolicy = {
  version: "t08-v1",
  mediationHints: ["avisale", "decile", "llama", "llamá", "pedile", "escribile", "mensaje", "contactar"],
  urgentOrRiskHints: [
    // Hard signals — physical/emergency descriptions
    "me caí",
    "me cai",
    "no puedo levantarme",
    "no me puedo levantar",
    "estoy en el piso",
    "no puedo moverme",
    "no me puedo mover",
    "no puedo respirar",
    "me falta el aire",
    "dolor de pecho",
    "me duele el pecho",
    "brazo izquierdo",
    "me desmayé",
    "me desmaye",
    "no recuerdo nada",
    "sangre",
    "no para de salir sangre",
    "me robaron",
    "robaron",
    // Soft signals — contextual (AI may override in fusion)
    "alguien raro",
    "tengo mucho miedo",
    "urgente",
    "ayuda",
    "peligro",
  ],
};
