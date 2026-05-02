import type { MediationBridgeSession } from "../../domain/mediation-bridge-session.ts";

export type MediationBridgeSessionStore = {
  save(session: MediationBridgeSession): Promise<void>;
  findById(sessionId: string): Promise<MediationBridgeSession | undefined>;
};