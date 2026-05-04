/**
 * T27 — Structured input type for AiGuideService and ExecutionPipeline.
 *
 * Typed fields for non-string context data (recentMessages, knownContacts,
 * safetyMemory) coexist with a string-oriented index signature.  Template
 * interpolation extracts only string fields into a `Record<string, string>`
 * before calling renderTemplate() — the index signature here is intentionally
 * looser than `Record<string, string>` so that array fields are accepted.
 */
export type AiGuideInput = {
  input: string;
  actorRole?: string;
  channel?: string;
  resolvedIdentity?: string;
  recentMessages?: string[];
  knownContacts?: string[];
  safetyMemory?: string;
  [key: string]: string | string[] | undefined;
};
