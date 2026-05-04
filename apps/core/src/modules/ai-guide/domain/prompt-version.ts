import type { PromptId } from "./prompt-id.ts";

/**
 * Extracts the numeric version from a PromptId suffix `.v{N}`.
 *
 * @example parsePromptVersion("serena.conversation.reply.v1") // 1
 * @example parsePromptVersion("serena.risk.review.v2")        // 2
 *
 * @throws If the PromptId does not end with `.v{N}` where N is a positive integer.
 */
export function parsePromptVersion(id: PromptId): number {
  const match = id.match(/\.v(\d+)$/);
  if (!match) {
    throw new Error(`Invalid PromptId format: "${id}" — expected ".v{N}" suffix`);
  }
  return parseInt(match[1]!, 10);
}
