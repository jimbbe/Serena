import type { SessionResolution } from "../../domain/session-resolution.ts";

export type SessionResolver = {
  resolveActiveSession(participantAId: string, participantBId: string): Promise<SessionResolution>;
};
