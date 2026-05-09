/**
 * T32 — MediationFlowStore port.
 *
 * Abstracts flow state persistence behind a type alias following the
 * existing port convention (matching ConversationStore pattern).
 *
 * This port is OPTIONAL in dependency injection — when undefined, the
 * pipeline falls back to the current classification-only behavior.
 */

import type { MediationFlowState } from "../domain/mediation-flow-state.ts";

export type MediationFlowStore = {
  /** Find an active (non-resolved) flow for a conversation. */
  findActiveByConversation(
    conversationId: string,
  ): Promise<MediationFlowState | undefined>;

  /** Start a new flow or replace an existing one. */
  startFlow(state: MediationFlowState): Promise<MediationFlowState>;

  /** Update an existing flow state. */
  updateFlow(state: MediationFlowState): Promise<MediationFlowState>;

  /** Remove the flow state for a conversation. */
  clearFlow(conversationId: string): Promise<void>;

  /** Pause an active flow (e.g., due to risk signal). Returns undefined if no flow. */
  pauseFlow(conversationId: string): Promise<MediationFlowState | undefined>;

  /** Resume a paused flow. Returns undefined if no flow or not paused. */
  resumeFlow(conversationId: string): Promise<MediationFlowState | undefined>;
};
