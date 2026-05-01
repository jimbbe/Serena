import type { InboundDecision } from "../../domain/inbound-decision.ts";

export type DecisionAudit = {
  record(input: { senderId: string; text: string }, decision: InboundDecision): Promise<void>;
};
