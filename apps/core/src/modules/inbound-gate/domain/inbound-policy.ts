export type InboundPolicy = {
  version: string;
  mediationHints: readonly string[];
  urgentOrRiskHints: readonly string[];
};

export const defaultInboundPolicy: InboundPolicy = {
  version: "t07-v1",
  mediationHints: ["avisale", "decile", "llama", "llamá", "pedile", "escribile", "mensaje", "contactar"],
  urgentOrRiskHints: ["urgente", "riesgo", "emergencia", "ayuda", "peligro"],
};
