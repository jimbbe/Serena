/**
 * T17B — InMemoryProcessedMessageStore adapter.
 *
 * Stores processed messageId → PipelineResult mappings in a Map.
 * Data is lost on process restart — documented limitation.
 */

import type { ProcessedMessageStore } from "../../domain/processed-message-store.ts";
import type { PipelineResult } from "../../../orchestrator/domain/pipeline-result.ts";

export class InMemoryProcessedMessageStore implements ProcessedMessageStore {
  private readonly store = new Map<string, PipelineResult>();

  has(messageId: string): boolean {
    return this.store.has(messageId);
  }

  get(messageId: string): PipelineResult | undefined {
    return this.store.get(messageId);
  }

  save(messageId: string, result: PipelineResult): void {
    this.store.set(messageId, result);
  }
}
