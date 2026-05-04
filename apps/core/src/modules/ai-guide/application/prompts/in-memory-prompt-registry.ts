import type { PromptRegistry } from "../ports/prompt-registry.ts";
import type { PromptDefinition } from "../../domain/prompt-definition.ts";
import type { PromptId } from "../../domain/prompt-id.ts";

export class InMemoryPromptRegistry implements PromptRegistry {
  private readonly prompts: Map<PromptId, PromptDefinition>;

  constructor(prompts: PromptDefinition[]) {
    this.prompts = new Map();
    for (const p of prompts) {
      if (this.prompts.has(p.id)) {
        throw new Error(`Duplicate prompt ID in registry: ${p.id}`);
      }
      this.prompts.set(p.id, p);
    }
  }

  get(promptId: PromptId): PromptDefinition {
    const def = this.prompts.get(promptId);
    if (!def) {
      throw new Error(`Prompt not found in registry: ${promptId}`);
    }
    return def;
  }

  list(): PromptDefinition[] {
    return Array.from(this.prompts.values());
  }
}
