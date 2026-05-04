/** Defines what context the LLM receives per use case (REQ-4). */
export type ContextPolicy = {
  includeCurrentMessage: boolean;
  includeResolvedIdentity: boolean;
  includeActorContext: boolean;
  includeChannelMetadata: boolean;
  includeConversationHistory: boolean;
  maxRecentMessages?: number;
  includeKnownContacts: boolean;
  includeSafetyMemory: boolean;
  includeFullConversation: boolean;
  notes?: string;
};
