/**
 * T17B — ProcessedMessageStore port.
 *
 * Tracks processed messageIds to enable idempotent pipeline execution.
 * Domain port — implementations live in infrastructure/.
 */

import type { PipelineResult } from "../../orchestrator/domain/pipeline-result.ts";

export type ProcessedMessageStore = {
  /** Returns true if messageId was already processed. */
  has(messageId: string): boolean;
  /** Returns the cached PipelineResult, or undefined if not found. */
  get(messageId: string): PipelineResult | undefined;
  /** Persists a processed messageId → result mapping. */
  save(messageId: string, result: PipelineResult): void;
};
