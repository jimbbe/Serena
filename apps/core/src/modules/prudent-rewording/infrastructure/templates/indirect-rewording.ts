import type { RewordingContext } from "../../domain/rewording-context.ts";
import type { PrudentRewording } from "../../application/ports/prudent-rewording.ts";

export class IndirectRewording implements PrudentRewording {
  async reword(originalText: string, context: RewordingContext): Promise<string> {
    const attribution = `${context.fromDisplayName} me pidió decirte que`;

    if (context.isRecipientIntroduction) {
      return `Hola ${context.toDisplayName}, soy Serena. ${attribution} ${originalText}`;
    }

    return `${attribution} ${originalText}`;
  }
}
