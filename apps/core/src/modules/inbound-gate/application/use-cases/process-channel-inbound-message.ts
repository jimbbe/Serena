/**
 * T20 — Channel-agnostic inbound message processing use case.
 *
 * Executes the full Serena pipeline for any inbound channel:
 *   1. Evaluate via ProcessInboundMessage
 *   2. Map routing decision → AI guide use case
 *   3. Execute AI guide (or handle clarification not-implemented)
 *   4. Return structured ChannelInboundResult
 *
 * No real messages are sent — this is a read-only pipeline.
 */

import { randomUUID } from "node:crypto";

import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";
import type { ChannelInboundResult } from "../results/channel-inbound-result.ts";
import type { GuideUseCaseId } from "../../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../../ai-guide/domain/guide-result.ts";

import { profileToUseCaseId } from "../mappers/profile-to-usecase.ts";
import type { ProcessInboundMessage } from "./process-inbound-message.ts";
import type { ProcessInboundMessageInput } from "./process-inbound-message.ts";
import type { AiGuideService } from "../../../ai-guide/application/use-cases/ai-guide-service.ts";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  /** Optional custom trace ID generator (defaults to crypto.randomUUID). */
  generateTraceId?: () => string;
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ProcessChannelInboundMessage {
  private readonly processInboundMessage: ProcessInboundMessage;
  private readonly aiGuideService: AiGuideService;
  private readonly generateTraceId: () => string;

  constructor(deps: ProcessChannelInboundMessageDependencies) {
    this.processInboundMessage = deps.processInboundMessage;
    this.aiGuideService = deps.aiGuideService;
    this.generateTraceId = deps.generateTraceId ?? (() => randomUUID());
  }

  async execute(cmd: InboundMessageCommand): Promise<ChannelInboundResult> {
    const traceId = this.generateTraceId();
    const warnings: string[] = [];
    const errors: string[] = [];

    // Collect warnings for missing optional-but-useful fields
    if (!cmd.tenantId) {
      warnings.push("Missing optional field: tenantId");
    }
    if (!cmd.personId) {
      warnings.push("Missing optional field: personId");
    }
    if (!cmd.conversationId) {
      warnings.push("Missing optional field: conversationId");
    }

    // 1. Adapt InboundMessageCommand → ProcessInboundMessageInput
    const adaptedInput = this.adaptInput(cmd);

    // 2. Execute inbound gate evaluation
    const { decision, route } = await this.processInboundMessage.execute(adaptedInput);

    // 3. Discard path — no AI guide needed
    if (route.nextStep === "discard") {
      return {
        traceId,
        channel: cmd.channel,
        inboundDecision: decision,
        profileId: undefined,
        useCaseId: undefined,
        guideResult: undefined,
        warnings,
        errors,
      };
    }

    // 4. LLM profile required — resolve profile and execute AI guide
    const profileId = route.profileId;
    const useCaseId: GuideUseCaseId = profileToUseCaseId(profileId);

    let guideResult: GuideResult | undefined = undefined;
    let guideError: { message: string; code?: string } | undefined = undefined;

    try {
      guideResult = await this.aiGuideService.execute(useCaseId, {
        input: cmd.text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Clarification is not yet implemented — structured error, not a crash
      if (message.includes("Not implemented")) {
        guideError = {
          message: "Clarification use case not yet implemented",
          code: "not_implemented",
        };
        warnings.push(
          "clarification profile maps to a not-yet-implemented use case",
        );
      } else {
        // Unexpected failure — still capture as guideError, do not throw
        guideError = {
          message,
          code: "pipeline_execution_failed",
        };
        errors.push(`AI guide execution failed: ${message}`);
      }
    }

    return {
      traceId,
      channel: cmd.channel,
      inboundDecision: decision,
      profileId,
      useCaseId,
      guideResult,
      ...(guideError !== undefined ? { guideError } : {}),
      warnings,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Adapts the channel-agnostic command to the existing
   * ProcessInboundMessageInput shape.
   */
  private adaptInput(cmd: InboundMessageCommand): ProcessInboundMessageInput {
    let receivedAt: Date;

    if (cmd.occurredAt) {
      const parsed = new Date(cmd.occurredAt);
      receivedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      receivedAt = new Date();
    }

    return {
      senderId: cmd.externalSenderId,
      text: cmd.text,
      receivedAt,
    };
  }
}
