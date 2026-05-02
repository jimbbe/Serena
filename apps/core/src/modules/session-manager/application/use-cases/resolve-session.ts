import type { SessionResolution } from "../../domain/session-resolution.ts";
import type { ActiveSessionQuery } from "../ports/active-session-query.ts";

export function createResolveSession(deps: { activeSessionQuery: ActiveSessionQuery }) {
  const { activeSessionQuery } = deps;

  return async function resolveSession(
    participantAId: string,
    participantBId: string,
  ): Promise<SessionResolution> {
    const aSessions = await activeSessionQuery.findActiveSessionsByParticipant(participantAId);
    const bSessions = await activeSessionQuery.findActiveSessionsByParticipant(participantBId);

    // Build a set of session IDs where participantB is involved for O(1) lookup
    const bSessionIds = new Set(bSessions.map((s) => s.sessionId));

    // Find sessions where BOTH participants are involved
    // The session must have one as requester and the other as recipient
    const sharedSessions = aSessions.filter(
      (s) =>
        bSessionIds.has(s.sessionId) &&
        ((s.requesterId === participantAId && s.recipientId === participantBId) ||
          (s.requesterId === participantBId && s.recipientId === participantAId)),
    );

    if (sharedSessions.length === 1) {
      return { type: "existing_session", sessionId: sharedSessions[0]!.sessionId };
    }

    if (sharedSessions.length > 1) {
      return {
        type: "ambiguous_active_sessions",
        activeSessionIds: sharedSessions.map((s) => s.sessionId),
      };
    }

    // 0 shared sessions — the pair has no active session, but a new one can be started
    return { type: "new_session_possible" };
  };
}
