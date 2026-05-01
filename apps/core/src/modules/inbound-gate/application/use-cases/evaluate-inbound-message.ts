import type { InboundDecision, InboundDecisionReason, InboundDecisionStatus } from "../../domain/inbound-decision.ts";
import { defaultInboundPolicy, type InboundPolicy } from "../../domain/inbound-policy.ts";
import type { ContactDirectory } from "../ports/contact-directory.ts";
import type { DecisionAudit } from "../ports/decision-audit.ts";

export type EvaluateInboundMessageInput = {
  senderId: string;
  text: string;
  receivedAt?: Date;
};

export type EvaluateInboundMessageDependencies = {
  contactDirectory: ContactDirectory;
  decisionAudit?: DecisionAudit;
  policy?: InboundPolicy;
};

export class EvaluateInboundMessage {
  private readonly contactDirectory: ContactDirectory;
  private readonly decisionAudit: DecisionAudit | undefined;
  private readonly policy: InboundPolicy;

  constructor(dependencies: EvaluateInboundMessageDependencies) {
    this.contactDirectory = dependencies.contactDirectory;
    this.decisionAudit = dependencies.decisionAudit;
    this.policy = dependencies.policy ?? defaultInboundPolicy;
  }

  async execute(input: EvaluateInboundMessageInput): Promise<InboundDecision> {
    const normalizedSenderId = normalize(input.senderId);
    const normalizedText = normalize(input.text);

    if (!normalizedSenderId) {
      return this.auditAndReturn(
        input,
        this.makeDecision("blocked", "invalid_sender", normalizedSenderId, false, input.receivedAt, [], "invalid_sender"),
      );
    }

    if (!normalizedText) {
      return this.auditAndReturn(
        input,
        this.makeDecision("blocked", "invalid_text", normalizedSenderId, false, input.receivedAt, [], "invalid_text"),
      );
    }

    const senderKnown = await this.contactDirectory.hasAllowedSender(normalizedSenderId);
    const matchedUrgentOrRiskSignals = getMatchedSignals(normalizedText, this.policy.urgentOrRiskHints);
    const matchedMediationSignals = getMatchedSignals(normalizedText, this.policy.mediationHints);

    if (!senderKnown) {
      return this.auditAndReturn(
        input,
        this.makeDecision(
          "blocked",
          "unknown_sender",
          normalizedSenderId,
          false,
          input.receivedAt,
          matchedUrgentOrRiskSignals,
          "unknown_sender",
        ),
      );
    }

    if (matchedUrgentOrRiskSignals.length > 0) {
      return this.auditAndReturn(
        input,
        this.makeDecision(
          "needs_mediation",
          "urgent_or_risk_content",
          normalizedSenderId,
          true,
          input.receivedAt,
          matchedUrgentOrRiskSignals,
          "urgent_or_risk_over_mediation",
        ),
      );
    }

    if (matchedMediationSignals.length > 0) {
      return this.auditAndReturn(
        input,
        this.makeDecision(
          "needs_mediation",
          "third_party_mediation_request",
          normalizedSenderId,
          true,
          input.receivedAt,
          matchedMediationSignals,
          "mediation_over_conversation",
        ),
      );
    }

    return this.auditAndReturn(
      input,
      this.makeDecision("allowed", "known_sender_conversational", normalizedSenderId, true, input.receivedAt, [], "conversation_default"),
    );
  }

  private makeDecision(
    status: InboundDecisionStatus,
    reason: InboundDecisionReason,
    normalizedSenderId: string,
    senderKnown: boolean,
    receivedAt?: Date,
    matchedSignals: readonly string[] = [],
    precedence:
      | "invalid_sender"
      | "invalid_text"
      | "unknown_sender"
      | "urgent_or_risk_over_mediation"
      | "mediation_over_conversation"
      | "conversation_default" = "conversation_default",
  ): InboundDecision {
    return {
      status,
      reason,
      metadata: {
        normalizedSenderId,
        senderKnown,
        receivedAt: (receivedAt ?? new Date()).toISOString(),
        audited: false,
        policyVersion: this.policy.version,
        matchedSignals,
        precedence,
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

function getMatchedSignals(text: string, hints: readonly string[]): string[] {
  return hints.filter((hint) => text.includes(hint));
}
