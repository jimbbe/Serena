import type { DecisionAudit } from "../../application/ports/decision-audit.ts";
import type { InboundDecision } from "../../domain/inbound-decision.ts";

export type AuditedDecision = {
  input: { senderId: string; text: string };
  decision: InboundDecision;
};

export class InMemoryDecisionAudit implements DecisionAudit {
  private readonly entries: AuditedDecision[] = [];

  async record(input: { senderId: string; text: string }, decision: InboundDecision): Promise<void> {
    this.entries.push({ input, decision });
  }

  getAll(): readonly AuditedDecision[] {
    return this.entries;
  }
}
