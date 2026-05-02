import type { RewordingContext } from "../../domain/rewording-context.ts";

export type PrudentRewording = {
  reword(originalText: string, context: RewordingContext): Promise<string>;
};
