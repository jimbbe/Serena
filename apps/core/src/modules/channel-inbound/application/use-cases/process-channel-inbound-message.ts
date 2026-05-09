/**
 * T30 — Channel-agnostic inbound message processing use case
 * (with external identity resolution).
 *
 * Executes the full Serena pipeline for any inbound channel:
 *   1. Resolve identity via ExternalIdentityResolver
 *   2. Short-circuit blocked actors
 *   3. Evaluate via ProcessInboundMessage (unknown actors continue to gate)
 *   4. Map routing decision → AI guide use case
 *   5. Execute AI guide
 *   6. Return structured ChannelInboundResult with identity
 *
 * No real messages are sent — this is a read-only pipeline.
 */

import { randomUUID } from "node:crypto";

import type { InboundMessageCommand } from "../../../inbound-gate/domain/inbound-message-command.ts";
import type { ChannelInboundResult } from "../../../inbound-gate/application/results/channel-inbound-result.ts";
import type { ResolvedInboundActor } from "../results/resolved-inbound-actor.ts";
import type { GuideUseCaseId } from "../../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../../ai-guide/domain/guide-result.ts";
import type { ConversationMessage } from "../../../conversation-store/domain/conversation-message.ts";

import { profileToUseCaseId } from "../../../inbound-gate/application/mappers/profile-to-usecase.ts";
import type { LlmProfileId } from "../../../inbound-gate/domain/llm-profile.ts";
import type { ProcessInboundMessage } from "../../../inbound-gate/application/use-cases/process-inbound-message.ts";
import type { ProcessInboundMessageInput } from "../../../inbound-gate/application/use-cases/process-inbound-message.ts";
import type { AiGuideService } from "../../../ai-guide/application/use-cases/ai-guide-service.ts";
import type { ExternalIdentityResolver } from "../../../inbound-gate/application/ports/external-identity-resolver.ts";
import type { ConversationStore } from "../../../conversation-store/port/conversation-store.ts";
import type { ContactDirectory } from "../../../contact-directory/application/ports/contact-directory.ts";
import { hasHardRiskSignal } from "../../../inbound-gate/domain/risk-signals.ts";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------
// Mediation use cases that benefit from known-contacts context
const MEDIATION_USE_CASES = new Set<GuideUseCaseId>([
  "serena.mediation.understand_request",
  "serena.mediation.clarify",
]);

export type ProcessChannelInboundMessageDependencies = {
  processInboundMessage: ProcessInboundMessage;
  aiGuideService: AiGuideService;
  identityResolver: ExternalIdentityResolver;
  conversationStore: ConversationStore;
  /** Optional custom trace ID generator (defaults to crypto.randomUUID). */
  generateTraceId?: () => string;
  /** Optional — when provided, known contacts are fetched and passed to AI guide for mediation routes. */
  contactDirectory?: ContactDirectory;
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
  private readonly contactDirectory: ContactDirectory | undefined;

  constructor(deps: ProcessChannelInboundMessageDependencies) {
    this.processInboundMessage = deps.processInboundMessage;
    this.aiGuideService = deps.aiGuideService;
    this.identityResolver = deps.identityResolver;
    this.conversationStore = deps.conversationStore;
    this.generateTraceId = deps.generateTraceId ?? (() => randomUUID());
    this.contactDirectory = deps.contactDirectory;
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
    let messageCount = 0;
    let recentMessages: string[] = [];
    if (identity.status === "resolved") {
      const personId = identity.personId ?? cmd.externalSenderId;
      const conv = await this.conversationStore.findOrCreateConversation({
        tenantId: identity.tenantId,
        personId,
        ...(cmd.conversationId !== undefined ? { conversationId: cmd.conversationId } : {}),
      });
      conversationId = conv.id;

      // Append inbound message
      const inboundMsgId = randomUUID();
      const inboundMsg: ConversationMessage = {
        id: inboundMsgId,
        conversationId: conv.id,
        tenantId: identity.tenantId,
        personId,
        channel: cmd.channel,
        direction: "inbound",
        text: cmd.text,
        occurredAt: new Date(),
      };
      await this.conversationStore.appendMessage(inboundMsg);

      // Use the real accumulated message count from the store
      const messages = await this.conversationStore.listMessages(conversationId);
      messageCount = messages.length;

      // Build recentMessages for AiGuide context (exclude current message)
      recentMessages = messages
        .filter((m) => m.id !== inboundMsgId)
        .map((m) => `[${m.direction}] ${m.personId} via ${m.channel}: ${m.text}`);
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
            messageCount,
          },
        } : {}),
        warnings,
        errors,
      };
    }

    // 6. LLM profile required — resolve profile and execute AI guide
    let profileId = route.profileId;

    // === Semantic classifier for authorized senders ===
    try {
      const classification = await this.aiGuideService.execute(
        "serena.inbound.classify_intent",
        {
          input: cmd.text,
          actorRole: identity.role ?? "unknown",
          resolvedIdentity: identity.displayName ?? identity.personId ?? cmd.externalSenderId,
          channel: cmd.channel,
          tenantId: cmd.tenantId ?? "demo",
          personId: identity.personId ?? "",
        }
      );

      if (classification.status === "success") {
        const parsed = JSON.parse(classification.output as string);
        profileId = applyFusionPolicy(
          profileId,
          parsed.intent,
          typeof parsed.confidence === "number" ? parsed.confidence : 0,
          decision.metadata.matchedSignals,
        );
      }
      // If classifier fails → profileId stays deterministic
    } catch {
      // Safe degradation: use deterministic route
    }

    const useCaseId: GuideUseCaseId = profileToUseCaseId(profileId);

    // Fetch known contacts for mediation routes (same pattern as recentMessages in T27)
    let knownContacts: string[] = [];
    if (MEDIATION_USE_CASES.has(useCaseId) && this.contactDirectory) {
      knownContacts = (await this.contactDirectory.findAll()).map(
        (c) => `${c.displayName} (id: ${c.id})`,
      );
    }

    let guideResult: GuideResult | undefined = undefined;
    let guideError: { message: string; code?: string } | undefined = undefined;

    try {
      guideResult = await this.aiGuideService.execute(useCaseId, {
        input: cmd.text,
        actorRole: identity.role ?? "unknown",
        resolvedIdentity: identity.displayName ?? identity.personId ?? cmd.externalSenderId,
        channel: cmd.channel,
        tenantId: cmd.tenantId ?? "demo",
        personId: identity.personId ?? "",
        recentMessages,
        knownContacts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Unexpected failure — capture as guideError, do not throw
      guideError = {
        message,
        code: "pipeline_execution_failed",
      };
      errors.push(`AI guide execution failed: ${message}`);
    }

    // NOTE: Outbound messages are NOT recorded here.
    // Outbound will be registered when an explicit OutboundDraft / DecisionPolicy
    // signals that Serena should actually send a message to the user.
    // Risk reviews, mediation understanding, and AI clarifications are internal
    // operations — not conversational replies that should appear in the message
    // history.

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
          messageCount,
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

// -----------------------------------------------------------------------
// Fusion policy — pure function
// -----------------------------------------------------------------------

/**
 * Fuses the deterministic gate profile with the AI classifier intent.
 *
 * Priority order:
 * 1. Deterministic risk with HARD signal → risk_review (non-negotiable safety)
 * 2. Deterministic risk with SOFT-only signals → fall through to AI intent
 * 3. AI says risk → risk_review (can elevate any route)
 * 4. Deterministic mediation → mediation_understanding (sticky; cannot be downgraded)
 * 5. AI says mediation → mediation_understanding
 * 6. AI says clarification → clarification
 * 7. AI says conversation → conversation
 * 8. Unknown AI intent → fallback deterministic
 */
export function applyFusionPolicy(
  deterministicProfile: LlmProfileId,
  aiIntent: string,
  _aiConfidence: number,
  matchedSignals: readonly string[] = []
): LlmProfileId {
  // 1. Deterministic risk with HARD signal → non-negotiable safety
  if (deterministicProfile === "risk_review" && hasHardRiskSignal(matchedSignals)) {
    return "risk_review";
  }

  // 2. Deterministic risk with SOFT-only signals → let AI decide
  // (falls through to AI intent evaluation below)

  // 3. AI says risk → risk_review (can elevate any route, including mediation)
  if (aiIntent === "risk_review") return "risk_review";

  // 4. Deterministic mediation → sticky, cannot be downgraded to conversation or clarification
  if (deterministicProfile === "mediation_understanding") return "mediation_understanding";

  // 5. AI says mediation → mediation_understanding
  if (aiIntent === "mediation_understanding") return "mediation_understanding";

  // 6. AI says clarification → clarification
  if (aiIntent === "clarification") return "clarification";

  // 7. AI says conversation → conversation
  if (aiIntent === "conversation") return "conversation";

  // 8. Unknown AI intent → fallback deterministic
  return deterministicProfile;
}
