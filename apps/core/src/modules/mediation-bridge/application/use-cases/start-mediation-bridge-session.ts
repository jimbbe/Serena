import type { CloseReason, MediationBridgeSession, Participant } from "../../domain/mediation-bridge-session.ts";

export type StartMediationBridgeSessionInput = {
  requester: Participant;
  recipient: Participant;
  messageToRelay: string;
  createdAt?: Date;
};

export type StartMediationBridgeSessionOutput = {
  session: MediationBridgeSession;
  outboundDraft: {
    toParticipantId: string;
    text: string;
    includesSerenaIntroduction: boolean;
    attribution: {
      fromParticipantId: string;
      fromDisplayName: string;
    };
  };
};

export type StartMediationBridgeSessionDependencies = {
  sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;
  generateId?: () => string;
};

export class StartMediationBridgeSession {
  private readonly sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;
  private readonly generateId: () => string;

  constructor(dependencies: StartMediationBridgeSessionDependencies) {
    this.sessionStore = dependencies.sessionStore;
    this.generateId = dependencies.generateId ?? crypto.randomUUID;
  }

  async execute(input: StartMediationBridgeSessionInput): Promise<StartMediationBridgeSessionOutput> {
    const now = input.createdAt ?? new Date();
    const sessionId = this.generateId();
    const turnId = this.generateId();

    const includesIntroduction = true;
    const draftText = `Hola ${input.recipient.displayName}, soy Serena. ${input.requester.displayName} me pidió decirte que ${input.messageToRelay}`;

    const outboundDraft = {
      toParticipantId: input.recipient.id,
      text: draftText,
      includesSerenaIntroduction: includesIntroduction,
      attribution: {
        fromParticipantId: input.requester.id,
        fromDisplayName: input.requester.displayName,
      },
    };

    const turn = {
      turnId,
      fromParticipantId: input.requester.id,
      toParticipantId: input.recipient.id,
      originalText: input.messageToRelay,
      outboundDraft,
      createdAt: now.toISOString(),
    };

    const session: MediationBridgeSession = {
      sessionId,
      requester: input.requester,
      recipient: input.recipient,
      status: "awaiting_recipient_reply",
      turns: [turn],
      awaitingParticipantId: input.recipient.id,
      recipientIntroduced: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.sessionStore.save(session);

    return { session, outboundDraft };
  }
}