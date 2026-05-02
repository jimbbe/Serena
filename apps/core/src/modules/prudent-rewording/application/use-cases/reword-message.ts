import type { RewordingContext } from "../../domain/rewording-context.ts";
import type { PrudentRewording } from "../ports/prudent-rewording.ts";

export type RewordMessageInput = {
  originalText: string;
  context: RewordingContext;
};

export type RewordMessageDependencies = {
  prudentRewording: PrudentRewording;
};

export class RewordMessage {
  private readonly prudentRewording: PrudentRewording;

  constructor(deps: RewordMessageDependencies) {
    this.prudentRewording = deps.prudentRewording;
  }

  async execute(input: RewordMessageInput): Promise<string> {
    return this.prudentRewording.reword(input.originalText, input.context);
  }
}
