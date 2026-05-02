export type MediationPattern = {
  verb: string;
  regex: RegExp;
  hasMessageCapture: boolean;
};

export const SPANISH_MEDIATION_PATTERNS: readonly MediationPattern[] = [
  {
    verb: "avisale",
    regex: /^(?:avisale|av[íi]sale|avisa)\s+a\s+(\S+(?:\s+\S+)?)\s+que\s+(.+)$/i,
    hasMessageCapture: true,
  },
  {
    verb: "decile",
    regex: /^(?:decile|dec[íi]le|deci)\s+a\s+(\S+(?:\s+\S+)?)\s+que\s+(.+)$/i,
    hasMessageCapture: true,
  },
  {
    verb: "pedile",
    regex: /^(?:pedile|ped[íi]le|pedi)\s+a\s+(\S+(?:\s+\S+)?)\s+que\s+(.+)$/i,
    hasMessageCapture: true,
  },
  {
    verb: "escribile",
    regex: /^(?:escribile|escrib[íi]le|escribi)\s+a\s+(\S+(?:\s+\S+)?)\s+que\s+(.+)$/i,
    hasMessageCapture: true,
  },
  {
    verb: "llamá",
    regex: /^(?:llam[áa]|llamale|llam[áa]le)\s+a\s+(\S+(?:\s+\S+)?)$/i,
    hasMessageCapture: false,
  },
  {
    verb: "contactá",
    regex: /^(?:contact[áa]|contactale|contact[áa]le)\s+a\s+(\S+(?:\s+\S+)?)$/i,
    hasMessageCapture: false,
  },
  {
    verb: "mensaje",
    regex: /^(?:mensaje|mensajeale)\s+a\s+(\S+(?:\s+\S+)?)$/i,
    hasMessageCapture: false,
  },
];
