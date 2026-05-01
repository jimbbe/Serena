import type { InboundDecision, InboundDecisionReason, InboundDecisionStatus } from "../../domain/inbound-decision.ts";
import type { ContactDirectory } from "../ports/contact-directory.ts";
import type { DecisionAudit } from "../ports/decision-audit.ts";

const MEDIATION_HINTS = ["avisale", "decile", "llama", "llamá", "pedile", "escribile", "mensaje", "contactar"];
const URGENT_HINTS = ["urgente", "riesgo", "emergencia", "ayuda", "peligro"];

export type EvaluateInboundMessageInput = {
  senderId: string;
  text: string;
  receivedAt?: Date;
};

export class EvaluateInboundMessage {
  private readonly contactDirectory: ContactDirectory;
  private readonly decisionAudit: DecisionAudit | undefined;

  constructor(contactDirectory: ContactDirectory, decisionAudit?: DecisionAudit) {
    this.contactDirectory = contactDirectory;
    this.decisionAudit = decisionAudit;
  }

  async execute(input: EvaluateInboundMessageInput): Promise<InboundDecision> {
    const normalizedSenderId = normalize(input.senderId);
    const normalizedText = normalize(input.text);

    if (!normalizedSenderId) {
      return this.auditAndReturn(input, this.makeDecision("blocked", "invalid_sender", normalizedSenderId, false, input.receivedAt));
    }

    if (!normalizedText) {
      return this.auditAndReturn(input, this.makeDecision("blocked", "invalid_text", normalizedSenderId, false, input.receivedAt));
    }

    const senderKnown = await this.contactDirectory.hasAllowedSender(normalizedSenderId);

    if (!senderKnown) {
      return this.auditAndReturn(input, this.makeDecision("blocked", "unknown_sender", normalizedSenderId, false, input.receivedAt));
    }

    const urgent = includesAny(normalizedText, URGENT_HINTS);
    if (urgent) {
      return this.auditAndReturn(
        input,
        this.makeDecision("needs_mediation", "urgent_or_risk_content", normalizedSenderId, true, input.receivedAt),
      );
    }

    const mediationRequested = includesAny(normalizedText, MEDIATION_HINTS);
    if (mediationRequested) {
      return this.auditAndReturn(
        input,
        this.makeDecision("needs_mediation", "third_party_mediation_request", normalizedSenderId, true, input.receivedAt),
      );
    }

    return this.auditAndReturn(
      input,
      this.makeDecision("allowed", "known_sender_conversational", normalizedSenderId, true, input.receivedAt),
    );
  }

  private makeDecision(
    status: InboundDecisionStatus,
    reason: InboundDecisionReason,
    normalizedSenderId: string,
    senderKnown: boolean,
    receivedAt?: Date,
  ): InboundDecision {
    return {
      status,
      reason,
      metadata: {
        normalizedSenderId,
        senderKnown,
        receivedAt: (receivedAt ?? new Date()).toISOString(),
        audited: false,
      },
    };
  }

  private async auditAndReturn(input: EvaluateInboundMessageInput, decision: InboundDecision): Promise<InboundDecision> {
    if (!this.decisionAudit) {
      return decision;
    }

    await this.decisionAudit.record({ senderId: input.senderId, text: input.text }, decision);

    return {
      ...decision,
      metadata: {
        ...decision.metadata,
        audited: true,
      },
    };
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}
