import type { ContextPolicy } from "../../domain/context-policy.ts";

/**
 * Data passed to ContextBuilder for assembling the user-facing prompt.
 * All fields are optional except currentMessage — the builder handles
 * missing data gracefully per the ContextPolicy flags.
 */
export type ContextData = {
  currentMessage: string;
  resolvedIdentity?: string | undefined;
  actorContext?: string | undefined;
  channelMetadata?: string | undefined;
  recentMessages?: string[] | undefined;
  knownContacts?: string[] | undefined;
  safetyMemory?: string | undefined;
};

/**
 * Assembles the user prompt string from explicit ContextPolicy flags.
 */
export class ContextBuilder {
  /**
   * Builds a plain string from the given context data, respecting all
   * ContextPolicy flags. Missing optional data is omitted gracefully
   * without error.
   */
  build(policy: ContextPolicy, data: ContextData): string {
    const sections: string[] = [];

    // Current message (always included if policy says so)
    if (policy.includeCurrentMessage) {
      const msg = data.currentMessage.trim();
      if (msg.length > 0) {
        sections.push(`Mensaje actual: ${msg}`);
      }
    }

    // Resolved identity
    if (policy.includeResolvedIdentity && data.resolvedIdentity) {
      sections.push(`Identidad: ${data.resolvedIdentity}`);
    }

    // Actor context (only the fields actually provided by the pipeline)
    if (policy.includeActorContext && data.actorContext) {
      sections.push(`Contexto del actor: ${data.actorContext}`);
    }

    // Channel metadata
    if (policy.includeChannelMetadata && data.channelMetadata) {
      sections.push(`Canal: ${data.channelMetadata}`);
    }

    // Conversation history (respects maxRecentMessages)
    if (policy.includeConversationHistory && data.recentMessages && data.recentMessages.length > 0) {
      const limit = policy.maxRecentMessages;
      const messages = limit !== undefined
        ? data.recentMessages.slice(-limit)
        : data.recentMessages;
      if (messages.length > 0) {
        sections.push(`Historial reciente (${messages.length} mensajes):\n${messages.map((m) => `- ${m}`).join("\n")}`);
      }
    }

    if (policy.includeFullConversation) {
      throw new Error("ContextPolicy includeFullConversation is not supported yet");
    }

    // Known contacts
    if (policy.includeKnownContacts && data.knownContacts && data.knownContacts.length > 0) {
      sections.push(`Contactos conocidos: ${data.knownContacts.join(", ")}`);
    }

    // Safety memory
    if (policy.includeSafetyMemory && data.safetyMemory) {
      sections.push(`Memoria de seguridad: ${data.safetyMemory}`);
    }

    return sections.join("\n\n");
  }

  /**
   * Renders a template string by replacing `{key}` placeholders with
   * values from the provided record. Extracted from the old pipeline's
   * renderTemplate for testability.
   */
  renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      return values[key] ?? `{${key}}`;
    });
  }
}
