import type {
  ActiveSessionInfo,
  ActiveSessionQuery,
} from "../../application/ports/active-session-query.ts";

export class InMemorySessionQuery implements ActiveSessionQuery {
  private readonly sessions = new Map<string, ActiveSessionInfo>();

  add(session: ActiveSessionInfo): void {
    this.sessions.set(session.sessionId, session);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  async findActiveSessionsByParticipant(participantId: string): Promise<ActiveSessionInfo[]> {
    const result: ActiveSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      if (session.requesterId === participantId || session.recipientId === participantId) {
        result.push(session);
      }
    }
    return result;
  }
}
