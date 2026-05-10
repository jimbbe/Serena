/**
 * T32 — In-memory MediationFlowStore adapter.
 *
 * Uses a Map for flow state storage. Follows the same pattern as
 * InMemoryConversationStore.
 *
 * Active flows (findable): idle, clarifying, confirming
 * Inactive flows (NOT findable): paused, resolved
 */

import type { MediationFlowState, MediationFlowStatus } from "../domain/mediation-flow-state.ts";
import type { MediationFlowStore } from "../port/mediation-flow-store.ts";

const ACTIVE_STATUSES: ReadonlySet<MediationFlowStatus> = new Set([
  "idle",
  "clarifying",
  "confirming",
]);

export class InMemoryMediationFlowStore implements MediationFlowStore {
  private readonly flows = new Map<string, MediationFlowState>();

  async findActiveByConversation(
    conversationId: string,
  ): Promise<MediationFlowState | undefined> {
    const flow = this.flows.get(conversationId);
    if (flow === undefined) return undefined;
    if (!ACTIVE_STATUSES.has(flow.status)) return undefined;
    return flow;
  }

  async startFlow(state: MediationFlowState): Promise<MediationFlowState> {
    this.flows.set(state.conversationId, state);
    return state;
  }

  async updateFlow(state: MediationFlowState): Promise<MediationFlowState> {
    this.flows.set(state.conversationId, state);
    return state;
  }

  async clearFlow(conversationId: string): Promise<void> {
    this.flows.delete(conversationId);
  }

  async pauseFlow(conversationId: string): Promise<MediationFlowState | undefined> {
    const flow = this.flows.get(conversationId);
    if (flow === undefined) return undefined;
    // Only pause active flows
    if (!ACTIVE_STATUSES.has(flow.status)) return undefined;

    const paused: MediationFlowState = {
      ...flow,
      status: "paused",
      pendingAction: null,
      updatedAt: new Date(),
    };
    this.flows.set(conversationId, paused);
    return paused;
  }

  async resumeFlow(conversationId: string): Promise<MediationFlowState | undefined> {
    const flow = this.flows.get(conversationId);
    if (flow === undefined) return undefined;
    if (flow.status !== "paused") return undefined;

    const resumed: MediationFlowState = {
      ...flow,
      status: "clarifying",
      updatedAt: new Date(),
    };
    this.flows.set(conversationId, resumed);
    return resumed;
  }
}
