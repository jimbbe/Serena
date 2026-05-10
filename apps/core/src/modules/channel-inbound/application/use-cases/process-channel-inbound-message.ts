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
import type { InboundDecision } from "../../../inbound-gate/domain/inbound-decision.ts";

import { profileToUseCaseId } from "../../../inbound-gate/application/mappers/profile-to-usecase.ts";
import type { LlmProfileId } from "../../../inbound-gate/domain/llm-profile.ts";
import type { ProcessInboundMessage } from "../../../inbound-gate/application/use-cases/process-inbound-message.ts";
import type { ProcessInboundMessageInput } from "../../../inbound-gate/application/use-cases/process-inbound-message.ts";
import type { AiGuideService } from "../../../ai-guide/application/use-cases/ai-guide-service.ts";
import type { ExternalIdentityResolver } from "../../../inbound-gate/application/ports/external-identity-resolver.ts";
import type { ConversationStore } from "../../../conversation-store/port/conversation-store.ts";
import type { ContactDirectory } from "../../../contact-directory/application/ports/contact-directory.ts";
import type { MediationFlowStore } from "../../../mediation-flow/port/mediation-flow-store.ts";
import type { MediationFlowState, PendingAction, MissingMediationField } from "../../../mediation-flow/domain/mediation-flow-state.ts";
import { resolveConfirmationInput } from "../../../mediation-flow/application/resolve-confirmation-input.ts";
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
  /** T32 — Optional mediation flow store. When undefined, falls back to current no-flow behavior. */
  mediationFlowStore?: MediationFlowStore;
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
  private readonly mediationFlowStore: MediationFlowStore | undefined;

  constructor(deps: ProcessChannelInboundMessageDependencies) {
    this.processInboundMessage = deps.processInboundMessage;
    this.aiGuideService = deps.aiGuideService;
    this.identityResolver = deps.identityResolver;
    this.conversationStore = deps.conversationStore;
    this.generateTraceId = deps.generateTraceId ?? (() => randomUUID());
    this.contactDirectory = deps.contactDirectory;
    this.mediationFlowStore = deps.mediationFlowStore;
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

    // === T32: Flow check [A] — before gate evaluation ===
    // Only applies when MediationFlowStore is provided and conversation exists
    if (this.mediationFlowStore !== undefined && conversationId !== undefined && identity.status === "resolved") {
      const activeFlow = await this.mediationFlowStore.findActiveByConversation(conversationId);
      if (activeFlow !== undefined) {
        // Check for risk signal — ALWAYS pauses flow
        const { decision: gateDecision } = await this.processInboundMessage.execute(this.adaptInput(cmd, identity));
        if (gateDecision.reason === "urgent_or_risk_content" && hasHardRiskSignal(gateDecision.metadata.matchedSignals)) {
          await this.mediationFlowStore.pauseFlow(conversationId);
          warnings.push("Risk signal detected — mediation flow paused");
          return this.buildFlowResult({
            traceId, channel: cmd.channel, identity, warnings, errors, conversationId,
            flowState: { status: "paused", pendingAction: null, missingFields: activeFlow.missingFields, draftRecipientHint: activeFlow.draft?.recipientHint ?? null, draftMessageDraft: activeFlow.draft?.messageDraft ?? null, version: activeFlow.draft?.version ?? 0 },
            promptText: "Detectamos una posible situación de riesgo. Tu pedido de mediación queda en pausa.",
          });
        }

        // Active confirming flow → resolve via keyword resolver
        if (activeFlow.status === "confirming") {
          const resolution = resolveConfirmationInput(cmd.text);
          return await this.handleConfirmingFlow({
            traceId, channel: cmd.channel, identity, warnings, errors, conversationId,
            flow: activeFlow, resolution, personId: identity.personId ?? cmd.externalSenderId,
            userText: cmd.text,
          });
        }

        // Active clarifying flow → route to AI guide with flow context
        if (activeFlow.status === "clarifying") {
          return await this.handleClarifyingFlow({
            traceId, channel: cmd.channel, identity, warnings, errors, conversationId,
            flow: activeFlow, cmd, gateDecision: gateDecision, personId: identity.personId ?? cmd.externalSenderId,
          });
        }
      }
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

    // T32 — Confirmation/cancellation/edit words only have meaning when an active
    // mediation flow exists. Without a pending draft, keep them conversational.
    const skipSemanticClassifier = isStandaloneFlowControlInput(cmd.text);
    if (skipSemanticClassifier) {
      profileId = "conversation";
    }

    // === Semantic classifier for authorized senders ===
    if (!skipSemanticClassifier) {
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

    // === T32: Flow start [B] — after AI guide execution ===
    // Parse guideResult for mediation output to start a new flow
    if (this.mediationFlowStore !== undefined && conversationId !== undefined && guideResult !== undefined && identity.status === "resolved") {
      const mediationOutput = parseMediationGuideOutput(guideResult);
      if (mediationOutput !== undefined) {
        const now = new Date();
        const draftId = randomUUID();
        const normalizedOutput = normalizeInitialMediationOutput(mediationOutput, cmd.text);
        const missingFields = normalizedOutput.missingFields;
        const status: MediationFlowState["status"] = missingFields.length === 0 || (missingFields.length === 1 && missingFields[0] === "confirmation") ? "confirming" : "clarifying";
        // T32 fix: ensure pendingAction is never null in confirming state
        const rawAction = derivePendingAction(missingFields);
        const pendingAction = status === "confirming" ? "confirm_mediation" : rawAction;

        const draft: MediationFlowState["draft"] = {
          id: draftId,
          conversationId,
          requesterPersonId: identity.personId ?? cmd.externalSenderId,
          recipientHint: normalizedOutput.recipientHint,
          messageDraft: normalizedOutput.messageDraft,
          sourceMessageId: randomUUID(),
          sourceText: cmd.text,
          version: 1,
          status: "draft",
        };

        const flowState: MediationFlowState = {
          conversationId,
          personId: identity.personId ?? cmd.externalSenderId,
          status,
          draft,
          pendingAction,
          missingFields,
          lastQuestion: null,
          createdAt: now,
          updatedAt: now,
        };

        await this.mediationFlowStore.startFlow(flowState);

        const promptText = buildPromptText(flowState);
        return this.buildFlowResult({
          traceId, channel: cmd.channel, identity, warnings, errors, conversationId,
          profileId, useCaseId, guideResult,
          ...(guideError !== undefined ? { guideError } : {}),
          flowState: {
            status: flowState.status,
            pendingAction: flowState.pendingAction,
            missingFields: flowState.missingFields,
            draftRecipientHint: draft.recipientHint,
            draftMessageDraft: draft.messageDraft,
            version: draft.version,
          },
          promptText,
        });
      }
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

  // -----------------------------------------------------------------------
  // T32 — Flow routing helpers
  // -----------------------------------------------------------------------

  /** Build a ChannelInboundResult with optional flow state fields. */
  private buildFlowResult(args: {
    traceId: string;
    channel: InboundMessageCommand["channel"];
    identity: ResolvedInboundActor;
    warnings: string[];
    errors: string[];
    conversationId?: string;
    profileId?: LlmProfileId;
    useCaseId?: GuideUseCaseId;
    guideResult?: GuideResult | undefined;
    guideError?: { message: string; code?: string };
    flowState?: ChannelInboundResult["flowState"];
    promptText?: string;
    /** For confirming flow: the inbound decision from gate evaluation. */
    inboundDecision?: InboundDecision;
  }): ChannelInboundResult {
    const result: ChannelInboundResult = {
      traceId: args.traceId,
      channel: args.channel,
      identity: args.identity,
      inboundDecision: args.inboundDecision ?? {
        status: "allowed",
        reason: "known_sender_conversational",
        metadata: {
          normalizedSenderId: args.identity.externalSenderId,
          senderKnown: true,
          receivedAt: new Date().toISOString(),
          audited: false,
          policyVersion: "flow-v1",
          matchedSignals: [],
          precedence: "conversation_default",
        },
      },
      profileId: args.profileId,
      useCaseId: args.useCaseId,
      guideResult: args.guideResult,
      ...(args.guideError !== undefined ? { guideError: args.guideError } : {}),
      ...(args.conversationId !== undefined ? {
        conversation: {
          id: args.conversationId,
          status: "open",
          messageCount: 0,
        },
      } : {}),
      warnings: args.warnings,
      errors: args.errors,
    };
    if (args.flowState !== undefined) result.flowState = args.flowState;
    if (args.promptText !== undefined) result.promptText = args.promptText;
    return result;
  }

  /** Handle an active confirming flow — resolve user input via keyword resolver. */
  private async handleConfirmingFlow(args: {
    traceId: string;
    channel: InboundMessageCommand["channel"];
    identity: ResolvedInboundActor;
    warnings: string[];
    errors: string[];
    conversationId: string;
    flow: MediationFlowState;
    resolution: ReturnType<typeof resolveConfirmationInput>;
    personId: string;
    userText: string;
  }): Promise<ChannelInboundResult> {
    const { flow, resolution, userText } = args;

    if (resolution.action === "confirm") {
      // Confirm the mediation
      const updatedDraft = flow.draft !== null ? { ...flow.draft, status: "confirmed" as const } : null;
      const resolvedFlow: MediationFlowState = {
        ...flow,
        status: "resolved",
        draft: updatedDraft,
        pendingAction: null,
        missingFields: [],
        updatedAt: new Date(),
      };
      await this.mediationFlowStore!.updateFlow(resolvedFlow);

      return this.buildFlowResult({
        ...args,
        flowState: {
          status: "resolved",
          pendingAction: null,
          missingFields: [],
          draftRecipientHint: flow.draft?.recipientHint ?? null,
          draftMessageDraft: flow.draft?.messageDraft ?? null,
          version: flow.draft?.version ?? 0,
        },
        promptText: "Perfecto, dejo este mensaje confirmado para envío futuro. Todavía no se envía por ningún canal real.",
      });
    }

    if (resolution.action === "cancel") {
      // Cancel the mediation
      const updatedDraft = flow.draft !== null ? { ...flow.draft, status: "cancelled" as const } : null;
      const cancelledFlow: MediationFlowState = {
        ...flow,
        status: "resolved",
        draft: updatedDraft,
        pendingAction: null,
        missingFields: [],
        updatedAt: new Date(),
      };
      await this.mediationFlowStore!.updateFlow(cancelledFlow);

      return this.buildFlowResult({
        ...args,
        flowState: {
          status: "resolved",
          pendingAction: null,
          missingFields: [],
          draftRecipientHint: flow.draft?.recipientHint ?? null,
          draftMessageDraft: flow.draft?.messageDraft ?? null,
          version: flow.draft?.version ?? 0,
        },
        promptText: "Ok, no se enviará ningún mensaje.",
      });
    }

    if (resolution.action === "edit") {
      // Edit the draft — update message and re-request confirmation only when
      // the user actually provided replacement content. Otherwise ask for it;
      // do NOT pretend the draft changed.
      const newMessage = extractEditMessage(
        resolution.matchedKeyword ?? "",
        userText,
        flow.draft?.messageDraft ?? null,
      );
      if (newMessage === null || newMessage === flow.draft?.messageDraft) {
        return this.buildFlowResult({
          ...args,
          flowState: {
            status: "confirming",
            pendingAction: "confirm_mediation",
            missingFields: ["confirmation"],
            draftRecipientHint: flow.draft?.recipientHint ?? null,
            draftMessageDraft: flow.draft?.messageDraft ?? null,
            version: flow.draft?.version ?? 0,
          },
          promptText: "¿Qué cambio querés hacer en el mensaje? Decime el texto nuevo y lo dejo preparado para confirmar.",
        });
      }

      const newVersion = (flow.draft?.version ?? 0) + 1;
      const updatedDraft = flow.draft !== null
        ? { ...flow.draft, messageDraft: newMessage, version: newVersion }
        : null;
      const editFlow: MediationFlowState = {
        ...flow,
        draft: updatedDraft,
        pendingAction: "confirm_mediation",
        missingFields: ["confirmation"],
        updatedAt: new Date(),
      };
      const recipient = updatedDraft?.recipientHint ?? "tu contacto";
      const message = newMessage ?? updatedDraft?.messageDraft ?? "el mensaje";
      const promptText = `Mensaje actualizado: "${message}". ¿Confirmás dejarlo preparado para ${recipient}?`;

      await this.mediationFlowStore!.updateFlow(editFlow);

      return this.buildFlowResult({
        ...args,
        flowState: {
          status: "confirming",
          pendingAction: "confirm_mediation",
          missingFields: ["confirmation"],
          draftRecipientHint: updatedDraft?.recipientHint ?? null,
          draftMessageDraft: updatedDraft?.messageDraft ?? null,
          version: newVersion,
        },
        promptText,
      });
    }

    // Unknown — re-prompt for confirmation
    return this.buildFlowResult({
      ...args,
      flowState: {
        status: "confirming",
        pendingAction: flow.pendingAction,
        missingFields: flow.missingFields,
        draftRecipientHint: flow.draft?.recipientHint ?? null,
        draftMessageDraft: flow.draft?.messageDraft ?? null,
        version: flow.draft?.version ?? 0,
      },
      promptText: "No estoy segura. ¿Confirmás dejar este mensaje preparado, querés cancelarlo, o preferís cambiar algo?",
    });
  }

  /** Handle an active clarifying flow — route to AI guide with flow context. */
  private async handleClarifyingFlow(args: {
    traceId: string;
    channel: InboundMessageCommand["channel"];
    identity: ResolvedInboundActor;
    warnings: string[];
    errors: string[];
    conversationId: string;
    flow: MediationFlowState;
    cmd: InboundMessageCommand;
    gateDecision: InboundDecision;
    personId: string;
  }): Promise<ChannelInboundResult> {
    const { flow, cmd } = args;

    // Execute AI guide with clarification context
    let guideResult: GuideResult | undefined;
    let guideError: { message: string; code?: string } | undefined;

    try {
      guideResult = await this.aiGuideService.execute("serena.mediation.clarify", {
        input: cmd.text,
        actorRole: args.identity.role ?? "unknown",
        resolvedIdentity: args.identity.displayName ?? args.identity.personId ?? cmd.externalSenderId,
        channel: cmd.channel,
        tenantId: cmd.tenantId ?? "demo",
        personId: args.personId,
        flowContext: JSON.stringify({
          pendingAction: flow.pendingAction,
          missingFields: flow.missingFields,
          draftRecipientHint: flow.draft?.recipientHint,
          draftMessageDraft: flow.draft?.messageDraft,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      guideError = { message, code: "clarification_failed" };
      args.errors.push(`Clarification AI guide failed: ${message}`);
    }

    // Apply user input to draft based on pending action, then re-check fields.
    // Priority: AI guide output (when it has mediation fields) > direct extraction from user input.
    {
      const aiOutput = guideResult !== undefined ? parseMediationGuideOutput(guideResult) : undefined;

      const updatedDraft = flow.draft !== null
        ? { ...flow.draft, version: (flow.draft.version ?? 0) + 1 }
        : null;

      if (updatedDraft !== null) {
        if (aiOutput !== undefined) {
          // AI guide provided mediation fields — use those (backward compatible with canned tests)
          if (aiOutput.recipientHint !== null) updatedDraft.recipientHint = aiOutput.recipientHint;
          if (aiOutput.messageDraft !== null) updatedDraft.messageDraft = aiOutput.messageDraft;
        } else if (flow.pendingAction !== null) {
          // No AI mediation fields — extract directly from user input
          const userText = cmd.text.trim();
          let didExtractRecipient = false;

          if (flow.pendingAction === "clarify_recipient" || flow.pendingAction === "clarify_both") {
            const extracted = extractRecipientFromClarification(userText);
            if (extracted !== null) {
              updatedDraft.recipientHint = extracted;
              didExtractRecipient = true;
            }
          }

          if (flow.pendingAction === "clarify_message" || (flow.pendingAction === "clarify_both" && !didExtractRecipient)) {
            const extracted = extractMessageFromClarification(userText);
            if (extracted !== null) {
              updatedDraft.messageDraft = extracted;
            }
          }
        }

        // Re-check missing fields after applying updates
        const remainingFields: MissingMediationField[] = [];
        if (flow.missingFields.includes("recipient") && updatedDraft.recipientHint === null) {
          remainingFields.push("recipient");
        }
        if (flow.missingFields.includes("message") && updatedDraft.messageDraft === null) {
          remainingFields.push("message");
        }
        if (flow.missingFields.includes("confirmation")) {
          remainingFields.push("confirmation");
        }

        const newStatus: MediationFlowState["status"] = remainingFields.length === 0 || (remainingFields.length === 1 && remainingFields[0] === "confirmation") ? "confirming" : "clarifying";
        const rawAction = derivePendingAction(remainingFields);
        const newPendingAction = newStatus === "confirming" ? "confirm_mediation" : rawAction;

        const updatedFlow: MediationFlowState = {
          ...flow,
          draft: updatedDraft,
          status: newStatus,
          pendingAction: newPendingAction,
          missingFields: remainingFields,
          updatedAt: new Date(),
        };
        await this.mediationFlowStore!.updateFlow(updatedFlow);

        const promptText = buildPromptText(updatedFlow);
        return this.buildFlowResult({
          ...args,
          profileId: "clarification",
          useCaseId: "serena.mediation.clarify",
          guideResult,
          ...(guideError !== undefined ? { guideError } : {}),
          flowState: {
            status: updatedFlow.status,
            pendingAction: updatedFlow.pendingAction,
            missingFields: updatedFlow.missingFields,
            draftRecipientHint: updatedDraft?.recipientHint ?? null,
            draftMessageDraft: updatedDraft?.messageDraft ?? null,
            version: updatedDraft?.version ?? 0,
          },
          promptText,
        });
      }
    }

    // Fallback — keep flow as-is (should not normally reach here)
    return this.buildFlowResult({
      ...args,
      profileId: "mediation_understanding",
      useCaseId: "serena.mediation.clarify",
      guideResult,
      ...(guideError !== undefined ? { guideError } : {}),
      flowState: {
        status: flow.status,
        pendingAction: flow.pendingAction,
        missingFields: flow.missingFields,
        draftRecipientHint: flow.draft?.recipientHint ?? null,
        draftMessageDraft: flow.draft?.messageDraft ?? null,
        version: flow.draft?.version ?? 0,
      },
      promptText: buildPromptText(flow),
    });
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

// -----------------------------------------------------------------------
// T32 — Pure helper functions for mediation flow
// -----------------------------------------------------------------------

/** Parsed mediation output from AI guide result. */
type MediationOutput = {
  missingFields: MissingMediationField[];
  recipientHint: string | null;
  messageDraft: string | null;
};

type InitialMediationInference = {
  isMediationLike: boolean;
  recipientHint: string | null;
  messageDraft: string | null;
};

/**
 * Parses the AI guide result output for mediation fields.
 * Returns undefined if the output is not a mediation result.
 */
function parseMediationGuideOutput(guideResult: GuideResult): MediationOutput | undefined {
  if (guideResult.status !== "success") return undefined;
  if (typeof guideResult.output !== "string") return undefined;

  try {
    const parsed = JSON.parse(guideResult.output);
    // Check for mediation-specific fields
    if (parsed.missingFields === undefined && parsed.recipientHint === undefined && parsed.messageDraft === undefined) {
      return undefined;
    }

    const missingFields: MissingMediationField[] = Array.isArray(parsed.missingFields)
      ? parsed.missingFields.filter((f: string) => ["recipient", "message", "confirmation"].includes(f))
      : [];

    return {
      missingFields,
      recipientHint: typeof parsed.recipientHint === "string" ? parsed.recipientHint : null,
      messageDraft: typeof parsed.messageDraft === "string" ? parsed.messageDraft : null,
    };
  } catch {
    return undefined;
  }
}

/**
 * Normalizes initial mediation fields against the actual user text.
 *
 * The AI/mock may provide a complete canned draft even when the user only said
 * "avisale a Carlos". That would be dangerous: Serena would ask for confirmation
 * for a message the user never dictated. For initial requests that are clearly
 * mediation-like but incomplete, the source text is authoritative for missing
 * recipient/message fields.
 */
function normalizeInitialMediationOutput(output: MediationOutput, sourceText: string): MediationOutput {
  const inferred = inferInitialMediationFields(sourceText);

  if (!inferred.isMediationLike) return output;

  const recipientHint = inferred.recipientHint ?? output.recipientHint;
  const messageDraft = inferred.messageDraft ?? output.messageDraft;

  // If the source text is missing a field, never let AI/mock invent it.
  const sourceMissingRecipient = inferred.recipientHint === null;
  const sourceMissingMessage = inferred.messageDraft === null;
  const safeRecipientHint = sourceMissingRecipient ? null : recipientHint;
  const safeMessageDraft = sourceMissingMessage ? null : messageDraft;

  const missingFields: MissingMediationField[] = [];
  if (safeRecipientHint === null || !isSubstantiveField(safeRecipientHint)) missingFields.push("recipient");
  if (safeMessageDraft === null || !isSubstantiveField(safeMessageDraft)) missingFields.push("message");
  if (missingFields.length === 0) missingFields.push("confirmation");

  return {
    recipientHint: safeRecipientHint,
    messageDraft: safeMessageDraft,
    missingFields,
  };
}

function inferInitialMediationFields(text: string): InitialMediationInference {
  const trimmed = text.trim();
  const lower = trimmed.toLocaleLowerCase();
  const isMediationLike = /\b(?:avis(?:a|ale|ále)|av[íi]sale|dec[íi]le|d[íi]le|escribile|llamale|ll[áa]male|contact[áa]|pedile)\b/i.test(lower);

  if (!isMediationLike) {
    return { isMediationLike: false, recipientHint: null, messageDraft: null };
  }

  const messageDraft = extractInitialMessage(trimmed);
  const recipientHint = extractInitialRecipient(trimmed);

  return {
    isMediationLike: true,
    recipientHint,
    messageDraft,
  };
}

function extractInitialRecipient(text: string): string | null {
  // "avisale a Carlos que llego tarde" / "escribile a Pedro" / "llamale a Laura"
  const explicitMatch = text.match(/\b(?:a|al|para)\s+([^,.;!?]+?)(?=\s+que\b|$|[,.;!?])/i);
  if (explicitMatch?.[1]) {
    const recipient = cleanupRecipient(explicitMatch[1]);
    if (isSubstantiveField(recipient)) return recipient;
  }

  return null;
}

function extractInitialMessage(text: string): string | null {
  const queMatch = text.match(/\bque\s+(.+)/i);
  if (queMatch?.[1]) {
    const message = cleanupMessage(queMatch[1]);
    if (isSubstantiveField(message)) return message;
  }

  return null;
}

function cleanupRecipient(value: string): string {
  return value.trim().replace(/^(mi\s+|el\s+|la\s+)/i, "").trim();
}

function cleanupMessage(value: string): string {
  return value.trim().replace(/^[,.;:!?\s]+/, "").trim();
}

function isSubstantiveField(value: string | null): value is string {
  if (value === null) return false;
  const trimmed = value.trim();
  return trimmed.length > 2 && !/^[,.;:!?]+$/.test(trimmed);
}

/**
 * Derives the pending action from the list of missing fields.
 */
function derivePendingAction(missingFields: readonly MissingMediationField[]): PendingAction | null {
  if (missingFields.length === 0) return null;
  if (missingFields.length === 1) {
    if (missingFields[0] === "recipient") return "clarify_recipient";
    if (missingFields[0] === "message") return "clarify_message";
    if (missingFields[0] === "confirmation") return "confirm_mediation";
  }
  if (missingFields.includes("recipient") && missingFields.includes("message")) return "clarify_both";
  if (missingFields.includes("recipient")) return "clarify_recipient";
  if (missingFields.includes("message")) return "clarify_message";
  return "clarify_both";
}

/**
 * Builds a prompt text for the user based on the current flow state.
 */
function buildPromptText(flow: MediationFlowState): string {
  if (flow.status === "confirming") {
    const recipient = flow.draft?.recipientHint ?? "tu contacto";
    const message = flow.draft?.messageDraft ?? "el mensaje";
    return `¿Confirmás dejar preparado "${message}" para ${recipient}? Respondé "sí" para confirmar, "no" para cancelar, o pedí un cambio. No se envía por ningún canal real todavía.`;
  }
  if (flow.status === "clarifying") {
    if (flow.pendingAction === "clarify_recipient") return "¿A quién querés que le avise?";
    if (flow.pendingAction === "clarify_message") return "¿Qué querés que le diga?";
    if (flow.pendingAction === "clarify_both") return "¿A quién querés avisarle y qué querés decirle?";
  }
  return "¿En qué puedo ayudarte?";
}

/**
 * Extracts the new message content from an edit request.
 *
 * Parses common Spanish patterns to find the new message text:
 *   - "decile que X" / "dile que X" → X
 *   - "poné que X" / "pone que X" → X
 *   - "el mensaje X" / "el texto X" → X
 *   - "cambiá X" / "editá X" → X (when X is not just "el mensaje" / "el texto")
 *
 * Returns null if no new content can be extracted.
 */
function extractEditMessage(_matchedKeyword: string, userText: string, _existingDraft: string | null): string | null {
  const normalized = userText.trim().toLowerCase();

  // Try to extract message after "decile que" / "dile que"
  const decileQueMatch = normalized.match(/(?:dec[íi]le|d[íi]le)\s+que\s+(.+)/i);
  if (decileQueMatch && decileQueMatch[1] && decileQueMatch[1].trim().length > 0) {
    return decileQueMatch[1].trim();
  }

  // Try "decile X" / "dile X" (without "que")
  const decileMatch = normalized.match(/(?:dec[íi]le|d[íi]le)\s+(.+)/i);
  if (decileMatch && decileMatch[1] && decileMatch[1].trim().length > 0) {
    const extracted = decileMatch[1].trim();
    // Avoid returning just "que" or very short fragments
    if (extracted.length > 2) return extracted;
  }

  // Try "poné que X" / "pone que X"
  const poneQueMatch = normalized.match(/pon[ée]\s+que\s+(.+)/i);
  if (poneQueMatch && poneQueMatch[1] && poneQueMatch[1].trim().length > 0) {
    return poneQueMatch[1].trim();
  }

  // Try "el mensaje X" / "el texto X" (when X is not empty)
  const mensajeMatch = normalized.match(/(?:el\s+mensaj|el\s+text)[eo]?\s+(.+)/i);
  if (mensajeMatch && mensajeMatch[1] && mensajeMatch[1].trim().length > 0) {
    const extracted = mensajeMatch[1].trim();
    // Avoid returning just punctuation or very short fragments
    if (extracted.length > 2 && !/^[,.;:!?]+$/.test(extracted)) return extracted;
  }

  // Try "cambiá a X" / "editá a X" / "cambia por X"
  const cambioMatch = normalized.match(/(?:cambi[áa]|edit[áa])\s+(?:a|por)\s+(.+)/i);
  if (cambioMatch && cambioMatch[1] && cambioMatch[1].trim().length > 0) {
    return cambioMatch[1].trim();
  }

  // Try "editá: X" / "cambiá: X" / "corregí: X"
  const colonMatch = normalized.match(/(?:cambi[áa]|edit[áa]|correg[íi])\s*:\s*(.+)/i);
  if (colonMatch && colonMatch[1] && colonMatch[1].trim().length > 0) {
    const extracted = colonMatch[1].trim();
    if (extracted.length > 2 && !/^[,.;:!?]+$/.test(extracted)) return extracted;
  }

  // No new content found — do not pretend the draft changed.
  return null;
}

/**
 * Extracts a message from user input during clarification.
 * Looks for patterns like "que X", "decile que X", or just takes the whole text.
 */
function extractMessageFromClarification(text: string): string | null {
  const trimmed = text.trim();

  // "que voy a llegar tarde" → "voy a llegar tarde"
  const queMatch = trimmed.match(/^que\s+(.+)/i);
  if (queMatch && queMatch[1] && queMatch[1].trim().length > 0) {
    return queMatch[1].trim();
  }

  // "decile que X" / "dile que X"
  const decileMatch = trimmed.match(/(?:dec[íi]le|d[íi]le)\s+que\s+(.+)/i);
  if (decileMatch && decileMatch[1] && decileMatch[1].trim().length > 0) {
    return decileMatch[1].trim();
  }

  // Take the whole text as the message if it's substantial
  if (trimmed.length > 2) return trimmed;

  return null;
}

/**
 * Extracts a recipient from user input during clarification.
 * Looks for patterns like "a Carlos", "para Carlos", "a mi hijo Juan".
 * Stops extraction at common message-start markers like "que".
 */
function extractRecipientFromClarification(text: string): string | null {
  const trimmed = text.trim();

  // "a Carlos" / "para Carlos" / "al doctor"
  const aMatch = trimmed.match(/^(?:a|para|al)\s+(.+)/i);
  if (aMatch && aMatch[1] && aMatch[1].trim().length > 0) {
    const raw = aMatch[1].trim();
    // Stop at common message markers to avoid capturing the message part
    const cutAt = raw.search(/\s+que\b/i);
    const recipient = cutAt >= 0 ? raw.slice(0, cutAt).trim() : raw;
    if (recipient.length > 0) return recipient;
  }

  // Just "Carlos" alone
  if (trimmed.length > 1 && !trimmed.includes(" ") && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function isStandaloneFlowControlInput(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase();
  return [
    "sí",
    "si",
    "ok",
    "dale",
    "confirmo",
    "mandalo",
    "mandalo ya",
    "envialo",
    "envialo ya",
    "mandale",
    "no",
    "mejor no",
    "esperá",
    "espera",
    "no lo mandes",
  ].includes(normalized);
}
