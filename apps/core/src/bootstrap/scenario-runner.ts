/**
 * TXX — Multi-step scenario runner for simulation endpoints.
 *
 * Orchestrates sequential execution of InboundMessageCommand steps
 * against the existing ProcessChannelInboundMessage use case.
 * Lives in bootstrap/ — it is a dev-tool orchestrator, not domain logic.
 *
 * No domain logic duplication: every step delegates to
 * ProcessChannelInboundMessage.execute() exactly once.
 */

import { randomUUID } from "node:crypto";

import type { InboundChannel, InboundMessageCommand } from "../modules/inbound-gate/domain/inbound-message-command.ts";
import type { ChannelInboundResult } from "../modules/inbound-gate/application/results/channel-inbound-result.ts";
import type { ProcessChannelInboundMessage } from "../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single step in a multi-step scenario. */
export type ScenarioStepInput = {
  /** Message text content — required per step. */
  text: string;
  /** Override the scenario-level channel for this step. */
  channel?: InboundChannel;
  /** Override the scenario-level sender for this step. */
  externalSenderId?: string;
  /** Resolved person identifier (if known). */
  personId?: string;
  /** Active conversation identifier. */
  conversationId?: string;
  /** Channel-specific extras. */
  metadata?: Record<string, unknown>;
  /** ISO 8601 timestamp (defaults to now). */
  occurredAt?: string;
};

/** Top-level scenario payload sent to the runner. */
export type ScenarioRequest = {
  /** Unique scenario identifier (e.g. "greeting-001"). */
  scenarioId: string;
  /** Multi-tenant identifier. */
  tenantId: string;
  /** Default channel for all steps (step-level overrides allowed). */
  channel: InboundChannel;
  /** Default external sender for all steps (step-level overrides allowed). */
  externalSenderId: string;
  /** Default conversation identifier (step-level overrides allowed). */
  conversationId?: string;
  /** Stop iteration on first step failure. Default false. */
  stopOnError?: boolean;
  /** Ordered list of steps. */
  steps: ScenarioStepInput[];
};

/** Result of executing a single scenario step. */
export type ScenarioStepResult = {
  /** Zero-based index in the steps array. */
  index: number;
  /** Exact input built for this step (defaults + overrides applied). */
  input: {
    channel: InboundChannel;
    externalSenderId: string;
    text: string;
    personId?: string;
    conversationId?: string;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  };
  /** Full pipeline result (null if the use case threw). */
  result: ChannelInboundResult | null;
  /** Error message captured from a thrown exception (null if none). */
  error: string | null;
};

/** Aggregate counts across all steps. */
export type ScenarioSummary = {
  /** Total number of steps requested. */
  totalSteps: number;
  /** Steps that completed without errors or AI failures. */
  successfulSteps: number;
  /** Steps that failed (error thrown, errors[] non-empty, or AI failure). */
  failedSteps: number;
  /** Steps where inbound decision reason is "urgent_or_risk_content". */
  riskEvents: number;
  /** Steps where the gate requested or needed mediation. */
  mediationEvents: number;
  /** Steps where identity resolution returned status "unknown". */
  unknownSenders: number;
  /** Steps where sender was blocked (identity blocked or decision blocked). */
  blockedSenders: number;
};

/** Full multi-step scenario execution result. */
export type ScenarioResult = {
  /** Echo of the request scenarioId. */
  scenarioId: string;
  /** Correlation ID for the entire scenario run. */
  traceId: string;
  /** Per-step results in order. */
  steps: ScenarioStepResult[];
  /** Aggregate summary. */
  summary: ScenarioSummary;
};

// ---------------------------------------------------------------------------
// calculateSummary — pure function (no side effects, testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Computes ScenarioSummary from an array of step results.
 *
 * A step is **successful** when:
 *   - No throw was captured (error === null)
 *   - The result exists (not null)
 *   - The result has zero top-level errors
 *   - The AI guide result is not a failure (undefined or success)
 *   - There is no structured guideError
 *
 * A step is **failed** when any of the above conditions is violated.
 *
 * Event counts are extracted from {@link ChannelInboundResult.inboundDecision}
 * and {@link ChannelInboundResult.identity}.
 */
export function calculateSummary(steps: ScenarioStepResult[]): ScenarioSummary {
  let successfulSteps = 0;
  let failedSteps = 0;
  let riskEvents = 0;
  let mediationEvents = 0;
  let unknownSenders = 0;
  let blockedSenders = 0;

  for (const step of steps) {
    const res = step.result;
    const stepFailed =
      step.error !== null ||
      res === null ||
      res.errors.length > 0 ||
      res.guideResult?.status === "failed" ||
      res.guideError !== undefined;

    if (stepFailed) {
      failedSteps++;
    } else {
      successfulSteps++;
    }

    // Event counts — only inspect when result is present
    if (res !== null) {
      const decision = res.inboundDecision;
      const identity = res.identity;

      if (decision.reason === "urgent_or_risk_content") {
        riskEvents++;
      }
      if (
        decision.reason === "third_party_mediation_request" ||
        decision.status === "needs_mediation"
      ) {
        mediationEvents++;
      }
      if (identity?.status === "unknown") {
        unknownSenders++;
      }
      if (identity?.status === "blocked" || decision.status === "blocked") {
        blockedSenders++;
      }
    }
  }

  return {
    totalSteps: steps.length,
    successfulSteps,
    failedSteps,
    riskEvents,
    mediationEvents,
    unknownSenders,
    blockedSenders,
  };
}

// ---------------------------------------------------------------------------
// SimulationScenarioRunner
// ---------------------------------------------------------------------------

export type SimulationScenarioRunnerDependencies = {
  /** The existing channel-agnostic inbound pipeline use case. */
  processChannelInboundMessage: ProcessChannelInboundMessage;
  /** Optional custom trace ID generator (defaults to crypto.randomUUID). */
  generateTraceId?: () => string;
};

export class SimulationScenarioRunner {
  private readonly processChannelInboundMessage: ProcessChannelInboundMessage;
  private readonly generateTraceId: () => string;

  constructor(deps: SimulationScenarioRunnerDependencies) {
    this.processChannelInboundMessage = deps.processChannelInboundMessage;
    this.generateTraceId = deps.generateTraceId ?? (() => randomUUID());
  }

  /**
   * Executes a multi-step scenario sequentially against the inbound pipeline.
   *
   * For each step:
   *   1. Build an {@link InboundMessageCommand} from scenario defaults + step overrides
   *   2. Call {@link ProcessChannelInboundMessage.execute}
   *   3. Capture the result or any thrown error
   *   4. If stopOnError is true and an error occurs, break out of the loop
   *
   * After all steps, computes and attaches a {@link ScenarioSummary}.
   */
  async execute(request: ScenarioRequest): Promise<ScenarioResult> {
    const traceId = this.generateTraceId();
    const steps: ScenarioStepResult[] = [];
    const stopOnError = request.stopOnError ?? false;

    for (let i = 0; i < request.steps.length; i++) {
      const stepInput = request.steps[i]!;

      // Build InboundMessageCommand with scenario defaults + step overrides
      const command: InboundMessageCommand = {
        channel: stepInput.channel ?? request.channel,
        externalSenderId: stepInput.externalSenderId ?? request.externalSenderId,
        text: stepInput.text,
        tenantId: request.tenantId,
      };

      if (stepInput.personId !== undefined) {
        command.personId = stepInput.personId;
      }

      const effectiveConversationId = stepInput.conversationId ?? request.conversationId;
      if (effectiveConversationId !== undefined) {
        command.conversationId = effectiveConversationId;
      }

      if (stepInput.occurredAt !== undefined) {
        command.occurredAt = stepInput.occurredAt;
      }

      if (stepInput.metadata !== undefined) {
        command.metadata = stepInput.metadata;
      }

      // Capture exact input as sent to the pipeline
      const capturedInput: ScenarioStepResult["input"] = {
        channel: command.channel,
        externalSenderId: command.externalSenderId,
        text: command.text,
      };
      if (command.personId !== undefined) capturedInput.personId = command.personId;
      if (command.conversationId !== undefined) capturedInput.conversationId = command.conversationId;
      if (command.occurredAt !== undefined) capturedInput.occurredAt = command.occurredAt;
      if (command.metadata !== undefined) capturedInput.metadata = command.metadata;

      // Execute pipeline step
      let result: ChannelInboundResult | null = null;
      let error: string | null = null;

      try {
        result = await this.processChannelInboundMessage.execute(command);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      steps.push({
        index: i,
        input: capturedInput,
        result,
        error,
      });

      // stopOnError: break out of loop on the first failure
      if (stopOnError && error !== null) {
        break;
      }
    }

    const summary = calculateSummary(steps);

    return {
      scenarioId: request.scenarioId,
      traceId,
      steps,
      summary,
    };
  }
}
