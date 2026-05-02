import type { MediationBridgeSession } from "../../domain/mediation-bridge-session.ts";
import type { MediationBridgeSessionStore } from "../../application/ports/mediation-bridge-session-store.ts";

export class InMemoryMediationBridgeSessionStore implements MediationBridgeSessionStore {
  private readonly sessions = new Map<string, MediationBridgeSession>();

  async save(session: MediationBridgeSession): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async findById(sessionId: string): Promise<MediationBridgeSession | undefined> {
    return this.sessions.get(sessionId);
  }
}