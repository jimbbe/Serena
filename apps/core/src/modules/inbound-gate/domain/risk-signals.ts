/**
 * Risk signal taxonomy for the inbound gate.
 *
 * HARD signals: physical/emergency descriptions that should NEVER be downgraded.
 * SOFT signals: contextual words that MAY appear in normal or negated conversation.
 */

// ---------------------------------------------------------------------------
// HARD risk signals — deterministic gate MUST NOT degrade these
// ---------------------------------------------------------------------------

export const HARD_RISK_SIGNALS: readonly string[] = [
  // Falls / immobility
  "me caí",
  "me cai",
  "no puedo levantarme",
  "no me puedo levantar",
  "estoy en el piso",
  "no puedo moverme",
  "no me puedo mover",
  // Respiratory / cardiac
  "no puedo respirar",
  "me falta el aire",
  "dolor de pecho",
  "me duele el pecho",
  "brazo izquierdo",
  // Loss of consciousness / memory
  "me desmayé",
  "me desmaye",
  "no recuerdo nada",
  // Bleeding
  "sangre",
  "no para de salir sangre",
  // Crime / violence
  "me robaron",
  "robaron",
];

// ---------------------------------------------------------------------------
// SOFT risk signals — AI classifier MAY override these
// ---------------------------------------------------------------------------

export const SOFT_RISK_SIGNALS: readonly string[] = [
  "urgente",
  "ayuda",
  "peligro",
  "miedo",
  "raro",
  "sola",
  "emergencia",
  "riesgo",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if any matched signal corresponds to a HARD risk signal.
 *
 * Uses case-insensitive substring matching: a matched signal like "urgente"
 * will NOT match "ME CAÍ" because the HARD signal "me caí" is not a substring
 * of "urgente". But a matched signal "me caí" WILL match the HARD signal
 * "me caí" exactly (case-insensitive).
 */
export function hasHardRiskSignal(matchedSignals: readonly string[]): boolean {
  if (matchedSignals.length === 0) return false;

  const lowerMatched = matchedSignals.map((s) => s.toLowerCase());

  return HARD_RISK_SIGNALS.some((hardSignal) =>
    lowerMatched.some((matched) => matched.includes(hardSignal.toLowerCase())),
  );
}
