/**
 * Orchestrator — ProcessIncomingWhatsAppMessage use case (T15).
 *
 * Coordinates the full mediation-prudence pipeline:
 *
 *   IncomingWhatsAppMessage
 *   → InboundGate (classify)
 *   → MediationUnderstanding (extract request, if applicable)
 *   → ContactDirectory (resolve recipient, if applicable)
 *   → SessionManager (resolve or detect session)
 *   → MediationBridge (start / record reply)
 *   → PrudentRewording (reword with attribution)
 *   → PipelineResult
 *
 * The orchestrator DELEGATES every rule to existing modules.
 * It never reimplements validation, extraction, resolution,
 * turn management, or rewording.
 */

import type { InboundDecision } from "../../../inbound-gate/domain/inbound-decision.ts";
import type { InboundProcessingRoute } from "../../../inbound-gate/domain/inbound-processing-route.ts";
import type { MediationRequest } from "../../../mediation-understanding/domain/mediation-request.ts";
import type { Contact } from "../../../contact-directory/domain/contact.ts";
import type { ContactDirectory } from "../../../contact-directory/application/ports/contact-directory.ts";
import type { SessionResolution } from "../../../session-manager/domain/session-resolution.ts";
import type { ActiveSessionQuery } from "../../../session-manager/application/ports/active-session-query.ts";
import type { MediationBridgeSession } from "../../../mediation-bridge/domain/mediation-bridge-session.ts";
import type { MediationBridgeSessionStore } from "../../../mediation-bridge/application/ports/mediation-bridge-session-store.ts";
import type { RewordingContext } from "../../../prudent-rewording/domain/rewording-context.ts";
import type { PipelineInput, PipelineResult } from "../../domain/pipeline-result.ts";

// ---------------------------------------------------------------------------
// Port interfaces — structural types the orchestrator depends on.
// Concrete use-case classes satisfy these via duck typing.
// ---------------------------------------------------------------------------

export type InboundMessageProcessor = {
  execute(input: {
    senderId: string;
    text: string;
    receivedAt?: Date;
  }): Promise<{ decision: InboundDecision; route: InboundProcessingRoute }>;
};

export type MediationRequestExtractor = {
  execute(input: { text: string; senderId: string }): Promise<MediationRequest | null>;
};

export type ContactResolver = {
  execute(input: { displayName: string }): Promise<Contact | undefined>;
};

export type SessionResolver = (
  participantAId: string,
  participantBId: string,
) => Promise<SessionResolution>;

export type MediationSessionStarter = {
  execute(input: {
    requester: { id: string; displayName: string };
    recipient: { id: string; displayName: string };
    messageToRelay: string;
    createdAt?: Date;
  }): Promise<{
    session: MediationBridgeSession;
    outboundDraft: {
      toParticipantId: string;
      text: string;
      includesSerenaIntroduction: boolean;
      attribution: { fromParticipantId: string; fromDisplayName: string };
    };
  }>;
};

export type MediationReplyRecorder = {
  execute(input: {
    sessionId: string;
    fromParticipantId: string;
    text: string;
    receivedAt?: Date;
  }): Promise<
    | {
        status: "ok";
        session: MediationBridgeSession;
        outboundDraft: {
          toParticipantId: string;
          text: string;
          includesSerenaIntroduction: boolean;
          attribution: { fromParticipantId: string; fromDisplayName: string };
        };
      }
    | { status: "rejected"; reason: "not_awaiting_participant" | "session_not_found" | "session_closed" }
  >;
};

export type MessageReworder = {
  execute(input: { originalText: string; context: RewordingContext }): Promise<string>;
};

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type ProcessIncomingWhatsAppMessageDependencies = {
  processInboundMessage: InboundMessageProcessor;
  extractMediationRequest: MediationRequestExtractor;
  contactDirectory: ContactDirectory;
  resolveContact: ContactResolver;
  activeSessionQuery: ActiveSessionQuery;
  resolveSession: SessionResolver;
  startMediationBridgeSession: MediationSessionStarter;
  recordMediationBridgeReply: MediationReplyRecorder;
  mediationBridgeSessionStore: MediationBridgeSessionStore;
  rewordMessage: MessageReworder;
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ProcessIncomingWhatsAppMessage {
  private readonly deps: ProcessIncomingWhatsAppMessageDependencies;

  constructor(deps: ProcessIncomingWhatsAppMessageDependencies) {
    this.deps = deps;
  }

  async execute(input: PipelineInput): Promise<PipelineResult> {
    // ---- Step 1: Inbound Gate classification ----
    const classification = await this.deps.processInboundMessage.execute({
      senderId: input.senderWhatsAppId,
      text: input.messageText,
      receivedAt: new Date(input.receivedAt),
    });

    if (classification.route.nextStep === "discard") {
      return { type: "discard", reason: classification.route.reason };
    }

    const senderId = classification.route.context.senderId;

    // ---- Step 2: Risk/urgent content → needs human review ----
    if (classification.route.profileId === "risk_review") {
      return {
        type: "risk_review_required",
        senderId,
        matchedSignals: [...classification.route.context.matchedSignals],
      };
    }

    // ---- Step 3: Mediation signal detected ----
    if (classification.route.profileId === "mediation_understanding") {
      return this.handleMediationRequest(input, senderId);
    }

    // ---- Step 4: Conversational — check for active session replies ----
    if (classification.route.profileId === "conversation") {
      return this.handleConversationalMessage(input, senderId);
    }

    // Unknown profile — should not happen
    return { type: "discard", reason: `unknown_profile:${classification.route.profileId}` };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async handleMediationRequest(
    input: PipelineInput,
    senderId: string,
  ): Promise<PipelineResult> {
    // Extract mediation request
    const mediationRequest = await this.deps.extractMediationRequest.execute({
      text: input.messageText,
      senderId: input.senderWhatsAppId,
    });

    if (!mediationRequest) {
      return { type: "mediation_not_understood", senderId };
    }

    // Resolve recipient contact
    const recipient = await this.deps.resolveContact.execute({
      displayName: mediationRequest.recipientName,
    });

    if (!recipient) {
      return {
        type: "recipient_not_found",
        senderId,
        recipientName: mediationRequest.recipientName,
      };
    }

    // Resolve sender contact for display name
    const senderContact = await this.deps.contactDirectory.findByWhatsAppId(input.senderWhatsAppId);
    const senderDisplayName = senderContact?.displayName ?? input.senderWhatsAppId;

    // Resolve session for this pair
    const sessionResolution = await this.deps.resolveSession(
      input.senderWhatsAppId,
      recipient.whatsappId,
    );

    // Ambiguous sessions — explicit outcome, not silently resolved
    if (sessionResolution.type === "ambiguous_active_sessions") {
      return {
        type: "ambiguous_active_session",
        senderId,
        activeSessionIds: [...sessionResolution.activeSessionIds],
      };
    }

    // Existing session — record reply
    if (sessionResolution.type === "existing_session") {
      return this.recordReplyInSession(
        sessionResolution.sessionId,
        input.senderWhatsAppId,
        senderDisplayName,
        mediationRequest.messageToRelay,
        recipient,
      );
    }

    // New session — start mediation
    if (sessionResolution.type === "new_session_possible") {
      return this.startNewSession(
        input.senderWhatsAppId,
        senderDisplayName,
        recipient,
        mediationRequest.messageToRelay,
      );
    }

    // no_active_session — no mediation context for this pair
    return { type: "conversation_pending", senderId };
  }

  private async handleConversationalMessage(
    input: PipelineInput,
    senderId: string,
  ): Promise<PipelineResult> {
    // Check if sender is part of any active session
    const activeSessions = await this.deps.activeSessionQuery.findActiveSessionsByParticipant(
      input.senderWhatsAppId,
    );

    if (activeSessions.length === 0) {
      return { type: "conversation_pending", senderId };
    }

    if (activeSessions.length > 1) {
      return {
        type: "ambiguous_active_session",
        senderId,
        activeSessionIds: activeSessions.map((s: { sessionId: string }) => s.sessionId),
      };
    }

    // Exactly one active session — attempt to record reply
    const sessionInfo = activeSessions[0]!;

    // Determine the other participant for rewording context
    const isRequester = sessionInfo.requesterId === input.senderWhatsAppId;
    const otherParticipantId = isRequester
      ? sessionInfo.recipientId
      : sessionInfo.requesterId;

    // Look up session details to check awaiting participant and get names
    const session = await this.deps.mediationBridgeSessionStore.findById(sessionInfo.sessionId);

    if (!session) {
      // Session was removed between query and lookup — treat as no session
      return { type: "conversation_pending", senderId };
    }

    // Check if it's the sender's turn
    if (session.awaitingParticipantId !== input.senderWhatsAppId) {
      // Sender is in an active session but it's not their turn
      return { type: "conversation_pending", senderId };
    }

    // It's the sender's turn — record the reply
    const otherContact = await this.deps.contactDirectory.findByWhatsAppId(otherParticipantId);
    const senderContact = await this.deps.contactDirectory.findByWhatsAppId(input.senderWhatsAppId);
    const senderDisplayName = senderContact?.displayName ?? input.senderWhatsAppId;
    const otherDisplayName = otherContact?.displayName ?? otherParticipantId;

    const replyResult = await this.deps.recordMediationBridgeReply.execute({
      sessionId: sessionInfo.sessionId,
      fromParticipantId: input.senderWhatsAppId,
      text: input.messageText,
    });

    if (replyResult.status === "rejected") {
      // Bridge rejected the reply — could be session closed, wrong turn, etc.
      return { type: "conversation_pending", senderId };
    }

    // Reword the outbound text
    const isIntroduction = !session.recipientIntroduced && otherParticipantId === session.recipient.id;
    const rewordedText = await this.deps.rewordMessage.execute({
      originalText: input.messageText,
      context: {
        fromDisplayName: senderDisplayName,
        toDisplayName: otherDisplayName,
        isRecipientIntroduction: isIntroduction,
      },
    });

    return {
      type: "mediation_reply_recorded",
      sessionId: replyResult.session.sessionId,
      fromParticipantId: input.senderWhatsAppId,
      fromDisplayName: senderDisplayName,
      toParticipantId: otherParticipantId,
      toDisplayName: otherDisplayName,
      rewordedText,
    };
  }

  private async recordReplyInSession(
    sessionId: string,
    senderWhatsAppId: string,
    senderDisplayName: string,
    messageText: string,
    recipient: Contact,
  ): Promise<PipelineResult> {
    const replyResult = await this.deps.recordMediationBridgeReply.execute({
      sessionId,
      fromParticipantId: senderWhatsAppId,
      text: messageText,
    });

    if (replyResult.status === "rejected") {
      // Bridge rejected — could be closed or wrong participant
      return {
        type: "discard",
        reason: `session_reply_rejected:${replyResult.reason}`,
      };
    }

    // Determine message direction for rewording context
    const session = replyResult.session;
    const isToRecipient = session.recipient.id !== senderWhatsAppId;
    const toParticipantId = isToRecipient ? session.recipient.id : session.requester.id;
    const toDisplayName = isToRecipient ? session.recipient.displayName : session.requester.displayName;

    // Determine introduction context
    const isIntroduction = !session.recipientIntroduced && toParticipantId === session.recipient.id;

    const rewordedText = await this.deps.rewordMessage.execute({
      originalText: messageText,
      context: {
        fromDisplayName: senderDisplayName,
        toDisplayName,
        isRecipientIntroduction: isIntroduction,
      },
    });

    return {
      type: "mediation_reply_recorded",
      sessionId: session.sessionId,
      fromParticipantId: senderWhatsAppId,
      fromDisplayName: senderDisplayName,
      toParticipantId,
      toDisplayName,
      rewordedText,
    };
  }

  private async startNewSession(
    senderWhatsAppId: string,
    senderDisplayName: string,
    recipient: Contact,
    messageToRelay: string,
  ): Promise<PipelineResult> {
    const sessionResult = await this.deps.startMediationBridgeSession.execute({
      requester: { id: senderWhatsAppId, displayName: senderDisplayName },
      recipient: { id: recipient.whatsappId, displayName: recipient.displayName },
      messageToRelay,
    });

    // Reword the first message using prudent-rewording
    const rewordedText = await this.deps.rewordMessage.execute({
      originalText: messageToRelay,
      context: {
        fromDisplayName: senderDisplayName,
        toDisplayName: recipient.displayName,
        isRecipientIntroduction: true,
      },
    });

    return {
      type: "mediation_started",
      sessionId: sessionResult.session.sessionId,
      requesterId: senderWhatsAppId,
      requesterDisplayName: senderDisplayName,
      recipientId: recipient.whatsappId,
      recipientDisplayName: recipient.displayName,
      rewordedText,
    };
  }
}