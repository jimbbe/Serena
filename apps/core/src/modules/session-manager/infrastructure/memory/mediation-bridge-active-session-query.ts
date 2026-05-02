/**
 * Session Manager — MediationBridgeActiveSessionQuery adapter.
 *
 * Bridges the ActiveSessionQuery port to the MediationBridgeSessionStore.
 * Reads sessions directly from the bridge store and filters for active
 * (non-closed) ones, eliminating the need for manual double-registration
 * in integration tests.
 *
 * Production equivalent: a PostgreSQL-backed adapter that queries
 * the mediation_sessions table directly.
 */

import type { ActiveSessionQuery, ActiveSessionInfo } from "../../application/ports/active-session-query.ts";
import type { InMemoryMediationBridgeSessionStore } from "../../../mediation-bridge/infrastructure/memory/in-memory-mediation-bridge-session-store.ts";

export class MediationBridgeActiveSessionQuery implements ActiveSessionQuery {
  private readonly store: InMemoryMediationBridgeSessionStore;

  constructor(store: InMemoryMediationBridgeSessionStore) {
    this.store = store;
  }

  async findActiveSessionsByParticipant(participantId: string): Promise<ActiveSessionInfo[]> {
    const all = this.store.findAll();

    return all
      .filter((s) => s.status !== "closed")
      .filter(
        (s) => s.requester.id === participantId || s.recipient.id === participantId,
      )
      .map((s) => ({
        sessionId: s.sessionId,
        requesterId: s.requester.id,
        recipientId: s.recipient.id,
        status: s.status,
        createdAt: s.createdAt,
      }));
  }
}