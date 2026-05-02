import type { MediationUnderstanding } from "../../application/ports/mediation-understanding.ts";
import type { MediationRequest } from "../../domain/mediation-request.ts";
import {
  SPANISH_MEDIATION_PATTERNS,
  type MediationPattern,
} from "./spanish-mediation-patterns.ts";

export class RuleBasedMediationUnderstanding implements MediationUnderstanding {
  private patterns: readonly MediationPattern[];
  
  constructor(patterns: readonly MediationPattern[] = SPANISH_MEDIATION_PATTERNS) {
    this.patterns = patterns;
  }

  async extract(text: string, _senderId: string): Promise<MediationRequest | null> {
    const normalizedText = text.trim();

    for (const pattern of this.patterns) {
      const match = normalizedText.match(pattern.regex);
      if (match) {
        const recipientName = match[1]!.trim();
        const messageToRelay = pattern.hasMessageCapture
          ? match[2]!.trim()
          : pattern.verb;

        return {
          recipientName,
          messageToRelay,
          confidence: "high",
          source: "rule",
        };
      }
    }

    return null;
  }
}
