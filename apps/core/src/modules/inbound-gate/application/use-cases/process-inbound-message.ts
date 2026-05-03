import type { InboundDecision } from "../../domain/inbound-decision.ts";
import type { InboundProcessingRoute } from "../../domain/inbound-processing-route.ts";
import type { LlmProfileId } from "../../domain/llm-profile.ts";
import {
  EvaluateInboundMessage,
  type EvaluateInboundMessageDependencies,
  type EvaluateInboundMessageInput,
} from "./evaluate-inbound-message.ts";

export type ProcessInboundMessageInput = {
  senderId: string;
  text: string;
  receivedAt?: Date;
  /** Resolved person identifier from external identity resolution. Optional for compatibility. */
  personId?: string;
};

type InboundEvaluator = {
  execute(input: EvaluateInboundMessageInput): Promise<InboundDecision>;
};

export type ProcessInboundMessageDependencies =
  | {
      evaluator: InboundEvaluator;
    }
  | EvaluateInboundMessageDependencies;

export type ProcessInboundMessageOutput = {
  decision: InboundDecision;
  route: InboundProcessingRoute;
};

export class ProcessInboundMessage {
  private readonly evaluator: InboundEvaluator;

  constructor(dependencies: ProcessInboundMessageDependencies) {
    if ("evaluator" in dependencies) {
      this.evaluator = dependencies.evaluator;
      return;
    }

    this.evaluator = new EvaluateInboundMessage(dependencies);
  }

  async execute(input: ProcessInboundMessageInput): Promise<ProcessInboundMessageOutput> {
    const decision = await this.evaluator.execute(input);

    if (decision.status === "blocked") {
      return {
        decision,
        route: {
          nextStep: "discard",
          reason: decision.reason,
        },
      };
    }

    return {
      decision,
      route: {
        nextStep: "llm_profile_required",
        profileId: resolveProfileId(decision),
        reason: decision.reason,
        context: {
          senderId: input.senderId,
          normalizedSenderId: decision.metadata.normalizedSenderId,
          originalText: input.text,
          receivedAt: decision.metadata.receivedAt,
          decisionStatus: decision.status,
          decisionReason: decision.reason,
          policyVersion: decision.metadata.policyVersion,
          matchedSignals: decision.metadata.matchedSignals,
          precedence: decision.metadata.precedence,
        },
      },
    };
  }
}

function resolveProfileId(decision: InboundDecision): LlmProfileId {
  if (decision.reason === "urgent_or_risk_content") {
    return "risk_review";
  }

  if (decision.reason === "third_party_mediation_request") {
    return "mediation_understanding";
  }

  return "conversation";
}
