import type { CloseReason, MediationBridgeSession } from "../../domain/mediation-bridge-session.ts";

export type CloseMediationBridgeSessionInput = {
  sessionId: string;
  closeReason: CloseReason;
};

export type CloseMediationBridgeSessionResult =
  | { status: "ok"; session: MediationBridgeSession }
  | { status: "rejected"; reason: "session_not_found" | "session_already_closed" };

export type CloseMediationBridgeSessionDependencies = {
  sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;
};

export class CloseMediationBridgeSession {
  private readonly sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;

  constructor(dependencies: CloseMediationBridgeSessionDependencies) {
    this.sessionStore = dependencies.sessionStore;
  }

  async execute(input: CloseMediationBridgeSessionInput): Promise<CloseMediationBridgeSessionResult> {
    const session = await this.sessionStore.findById(input.sessionId);

    if (!session) {
      return { status: "rejected", reason: "session_not_found" };
    }

    if (session.status === "closed") {
      return { status: "rejected", reason: "session_already_closed" };
    }

    const closedSession: MediationBridgeSession = {
      ...session,
      status: "closed",
      closeReason: input.closeReason,
      updatedAt: new Date().toISOString(),
    };

    await this.sessionStore.save(closedSession);

    return { status: "ok", session: closedSession };
  }
}