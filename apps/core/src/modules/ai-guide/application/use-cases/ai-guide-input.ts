/**
 * Structured input type for AiGuideService and ExecutionPipeline.
 *
 * String fields remain usable for template interpolation while richer
 * context fields can travel through the pipeline without pretending they
 * are plain strings.
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
