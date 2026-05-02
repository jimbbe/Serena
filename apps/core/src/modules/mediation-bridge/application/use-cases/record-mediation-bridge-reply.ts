import type { MediationBridgeSession } from "../../domain/mediation-bridge-session.ts";
import type { MediationBridgeTurn } from "../../domain/mediation-bridge-turn.ts";
import type { OutboundDraft } from "../../domain/outbound-draft.ts";

export type RecordMediationBridgeReplyInput = {
  sessionId: string;
  fromParticipantId: string;
  text: string;
  receivedAt?: Date;
};

export type RecordMediationBridgeReplyResult =
  | { status: "ok"; session: MediationBridgeSession; outboundDraft: OutboundDraft }
  | { status: "rejected"; reason: "not_awaiting_participant" | "session_not_found" | "session_closed" };

export type RecordMediationBridgeReplyDependencies = {
  sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;
  generateId?: () => string;
};

export class RecordMediationBridgeReply {
  private readonly sessionStore: import("../ports/mediation-bridge-session-store.ts").MediationBridgeSessionStore;
  private readonly generateId: () => string;

  constructor(dependencies: RecordMediationBridgeReplyDependencies) {
    this.sessionStore = dependencies.sessionStore;
    this.generateId = dependencies.generateId ?? crypto.randomUUID;
  }

  async execute(input: RecordMediationBridgeReplyInput): Promise<RecordMediationBridgeReplyResult> {
    const session = await this.sessionStore.findById(input.sessionId);

    if (!session) {
      return { status: "rejected", reason: "session_not_found" };
    }

    if (session.status === "closed") {
      return { status: "rejected", reason: "session_closed" };
    }

    if (input.fromParticipantId !== session.awaitingParticipantId) {
      return { status: "rejected", reason: "not_awaiting_participant" };
    }

    const now = input.receivedAt ?? new Date();
    const turnId = this.generateId();

    const toParticipantId = input.fromParticipantId === session.recipient.id
      ? session.requester.id
      : session.recipient.id;

    const toParticipant = input.fromParticipantId === session.recipient.id
      ? session.requester
      : session.recipient;

    const includesIntroduction = !session.recipientIntroduced && toParticipantId === session.recipient.id;

    const draftText = includesIntroduction
      ? `Hola ${toParticipant.displayName}, soy Serena. ${input.fromParticipantId === session.requester.id ? session.requester.displayName : session.recipient.displayName} me pidió decirte que ${input.text}`
      : `${input.fromParticipantId === session.requester.id ? session.requester.displayName : session.recipient.displayName} me pidió decirte que ${input.text}`;

    const outboundDraft: OutboundDraft = {
      toParticipantId,
      text: draftText,
      includesSerenaIntroduction: includesIntroduction,
      attribution: {
        fromParticipantId: input.fromParticipantId,
        fromDisplayName: input.fromParticipantId === session.requester.id
          ? session.requester.displayName
          : session.recipient.displayName,
      },
    };

    const turn: MediationBridgeTurn = {
      turnId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId,
      originalText: input.text,
      outboundDraft,
      createdAt: now.toISOString(),
    };

    const nextAwaitingParticipantId = toParticipantId;

    const updatedSession: MediationBridgeSession = {
      ...session,
      turns: [...session.turns, turn],
      awaitingParticipantId: nextAwaitingParticipantId,
      recipientIntroduced: includesIntroduction ? true : session.recipientIntroduced,
      status: input.fromParticipantId === session.recipient.id
        ? "awaiting_requester_reply"
        : "awaiting_recipient_reply",
      updatedAt: now.toISOString(),
    };

    await this.sessionStore.save(updatedSession);

    return { status: "ok", session: updatedSession, outboundDraft };
  }
}