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
  /**
   * Default external sender for all steps (step-level overrides allowed).
   *
   * Optional at scenario level — when absent, every step MUST provide its
   * own `externalSenderId`.  Validation guarantees at least one source
   * (scenario default or per-step override) is present before the runner
   * receives the request.
   */
  externalSenderId?: string;
  /** Default conversation identifier (step-level overrides allowed). */
  conversationId?: string;
  /** Stop iteration on first step failure. Default false. */
  stopOnError?: boolean;
  /**
   * Default metadata merged into every step (step-level overrides allowed).
   * Step-level keys take priority over scenario-level keys.
   */
  metadata?: Record<string, unknown>;
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
// isScenarioStepFailure — shared predicate (used by runner + calculateSummary)
// ---------------------------------------------------------------------------

/**
 * Central definition of "step failure" used consistently by both
 * {@link SimulationScenarioRunner} (for `stopOnError`) and
 * {@link calculateSummary} (for the `failedSteps` count).
 *
 * A step is **failed** when:
 *   - An exception was caught (`error !== null`)
 *   - The pipeline returned `null` (impossible in normal flow, defensive)
 *   - The result contains top-level errors (`errors.length > 0`)
 *   - The AI guide returned `status: "failed"`
 *   - A structured `guideError` is present
 *
 * All other outcomes (allowed, blocked, needs_mediation, discard) are
 * considered successful pipeline executions.
 */
export function isScenarioStepFailure(step: ScenarioStepResult): boolean {
  const result = step.result;
  return (
    step.error !== null ||
    result === null ||
    result.errors.length > 0 ||
    result.guideResult?.status === "failed" ||
    result.guideError !== undefined
  );
}

// ---------------------------------------------------------------------------
// calculateSummary — pure function (no side effects, testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Computes ScenarioSummary from an array of step results.
 *
 * Delegates the success/failure classification to {@link isScenarioStepFailure}
 * so the definition stays in one place.  Event counts are extracted from
 * {@link ChannelInboundResult.inboundDecision} and
 * {@link ChannelInboundResult.identity}.
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
    const stepFailed = isScenarioStepFailure(step);

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
      // externalSenderId: validation guarantees at least one source exists
      const command: InboundMessageCommand = {
        channel: stepInput.channel ?? request.channel,
        externalSenderId: (stepInput.externalSenderId ?? request.externalSenderId)!,
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

      // Merge scenario-level metadata with step-level (step wins on key conflict)
      const scenariosMeta = request.metadata;
      const stepsMeta = stepInput.metadata;
      if (scenariosMeta !== undefined || stepsMeta !== undefined) {
        command.metadata = {
          ...(scenariosMeta ?? {}),
          ...(stepsMeta ?? {}),
        };
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

      // stopOnError: use the shared failure predicate so controlled
      // failures (guideResult.status === "failed", guideError, etc.)
      // also stop execution — not just thrown exceptions.
      const lastStep = steps[steps.length - 1]!;
      if (stopOnError && isScenarioStepFailure(lastStep)) {
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
