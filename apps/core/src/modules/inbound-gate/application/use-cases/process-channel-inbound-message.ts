/**
 * T30 — Channel-agnostic inbound message processing use case
 * (with external identity resolution).
 *
 * Executes the full Serena pipeline for any inbound channel:
 *   1. Resolve identity via ExternalIdentityResolver
 *   2. Short-circuit blocked actors
 *   3. Evaluate via ProcessInboundMessage (unknown actors continue to gate)
 *   4. Map routing decision → AI guide use case
 *   5. Execute AI guide (or handle clarification not-implemented)
 *   6. Return structured ChannelInboundResult with identity
 *
 * No real messages are sent — this is a read-only pipeline.
 */

import { randomUUID } from "node:crypto";

import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";
import type { ChannelInboundResult } from "../results/channel-inbound-result.ts";
import type { ResolvedInboundActor } from "../results/resolved-inbound-actor.ts";
import type { GuideUseCaseId } from "../../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../../ai-guide/domain/guide-result.ts";
import type { ConversationMessage } from "../../../conversation-store/domain/conversation-message.ts";

import { profileToUseCaseId } from "../mappers/profile-to-usecase.ts";
import type { ProcessInboundMessage } from "./process-inbound-message.ts";
import type { ProcessInboundMessageInput } from "./process-inbound-message.ts";
import type { AiGuideService } from "../../../ai-guide/application/use-cases/ai-guide-service.ts";
import type { ExternalIdentityResolver } from "../ports/external-identity-resolver.ts";
import type { ConversationStore } from "../../../conversation-store/port/conversation-store.ts";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  identityResolver: ExternalIdentityResolver;
  conversationStore: ConversationStore;
  /** Optional custom trace ID generator (defaults to crypto.randomUUID). */
  generateTraceId?: () => string;
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ProcessChannelInboundMessage {
  private readonly processInboundMessage: ProcessInboundMessage;
  private readonly aiGuideService: AiGuideService;
  private readonly identityResolver: ExternalIdentityResolver;
  private readonly conversationStore: ConversationStore;
  private readonly generateTraceId: () => string;

  constructor(deps: ProcessChannelInboundMessageDependencies) {
    this.processInboundMessage = deps.processInboundMessage;
    this.aiGuideService = deps.aiGuideService;
    this.identityResolver = deps.identityResolver;
    this.conversationStore = deps.conversationStore;
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

    // 0. Resolve external identity BEFORE gate evaluation
    let identity: ResolvedInboundActor;
    try {
      identity = await this.identityResolver.resolve(cmd);
    } catch (err) {
      // Resolver threw — degrade to unknown with warning
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Identity resolution failed: ${message}`);
      identity = {
        status: "unknown",
        tenantId: cmd.tenantId ?? "demo",
        channel: cmd.channel,
        externalSenderId: cmd.externalSenderId,
        authorized: false,
        reason: "resolution_error",
      };
    }

    // 1. Conversation tracking — create conversation for resolved identities
    let conversationId: string | undefined;
    if (identity.status === "resolved") {
      const personId = identity.personId ?? cmd.externalSenderId;
      const conv = await this.conversationStore.findOrCreateConversation({
        tenantId: identity.tenantId,
        personId,
        ...(cmd.conversationId !== undefined ? { conversationId: cmd.conversationId } : {}),
      });
      conversationId = conv.id;

      // Append inbound message
      const inboundMsg: ConversationMessage = {
        id: randomUUID(),
        conversationId: conv.id,
        tenantId: identity.tenantId,
        personId,
        channel: cmd.channel,
        direction: "inbound",
        text: cmd.text,
        occurredAt: new Date(),
      };
      await this.conversationStore.appendMessage(inboundMsg);
    }

    // 2. Short-circuit: blocked identity
    if (identity.status === "blocked") {
      return {
        traceId,
        channel: cmd.channel,
        identity,
        inboundDecision: {
          status: "blocked",
          reason: "blocked_sender",
          metadata: {
            normalizedSenderId: cmd.externalSenderId,
            senderKnown: false,
            receivedAt: new Date().toISOString(),
            audited: false,
            policyVersion: "identity-v1",
            matchedSignals: ["identity_blocked"],
            precedence: "identity_blocked",
          },
        },
        profileId: undefined,
        useCaseId: undefined,
        guideResult: undefined,
        warnings,
        errors,
      };
    }

    // 3. Adapt InboundMessageCommand → ProcessInboundMessageInput
    //    For resolved identities: use personId as senderId (NOT externalSenderId)
    //    For unknown identities: externalSenderId passes through (gate decides)
    const adaptedInput = this.adaptInput(cmd, identity);

    // 4. Execute inbound gate evaluation
    const { decision, route } = await this.processInboundMessage.execute(adaptedInput);

    // 5. Discard path — no AI guide needed
    if (route.nextStep === "discard") {
      return {
        traceId,
        channel: cmd.channel,
        identity,
        inboundDecision: decision,
        profileId: undefined,
        useCaseId: undefined,
        guideResult: undefined,
        ...(conversationId !== undefined ? {
          conversation: {
            id: conversationId,
            status: "open",
            messageCount: 1,
          },
        } : {}),
        warnings,
        errors,
      };
    }

    // 6. LLM profile required — resolve profile and execute AI guide
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

    // Record outbound messages if simulatedOutput is present
    let outboundMessageCount = 0;
    if (guideResult !== undefined && conversationId !== undefined) {
      const outboundText =
        guideResult.status === "success" ? String(guideResult.output) : "(ai guide failed)";
      const outboundMsg: ConversationMessage = {
        id: randomUUID(),
        conversationId,
        tenantId: identity.tenantId,
        personId: identity.personId ?? cmd.externalSenderId,
        channel: cmd.channel,
        direction: "outbound",
        text: outboundText,
        occurredAt: new Date(),
      };
      await this.conversationStore.appendMessage(outboundMsg);
      outboundMessageCount = 1;
    }

    return {
      traceId,
      channel: cmd.channel,
      identity,
      inboundDecision: decision,
      profileId,
      useCaseId,
      guideResult,
      ...(guideError !== undefined ? { guideError } : {}),
      ...(conversationId !== undefined ? {
        conversation: {
          id: conversationId,
          status: "open",
          messageCount: 1 + outboundMessageCount,
        },
      } : {}),
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
   *
   * When identity is resolved, uses the internal personId as senderId
   * instead of the raw externalSenderId.  For unknown identities, the
   * externalSenderId passes through for the gate to evaluate.
   */
  private adaptInput(
    cmd: InboundMessageCommand,
    identity?: ResolvedInboundActor,
  ): ProcessInboundMessageInput {
    let receivedAt: Date;

    if (cmd.occurredAt) {
      const parsed = new Date(cmd.occurredAt);
      receivedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      receivedAt = new Date();
    }

    const senderId = identity?.personId ?? cmd.externalSenderId;

    const input: ProcessInboundMessageInput = {
      senderId,
      text: cmd.text,
      receivedAt,
    };

    if (identity?.personId !== undefined) {
      input.personId = identity.personId;
    }

    return input;
  }
}
