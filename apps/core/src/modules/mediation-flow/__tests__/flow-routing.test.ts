/**
 * T32 — Unit tests for flow routing in ProcessChannelInboundMessage.
 *
 * Tests all routing paths with mocked store:
 * - Active confirming flow → keyword resolver short-circuit
 * - Active clarifying flow → AI guide with flow context
 * - No active flow → normal path unchanged
 * - Risk signal → pauses flow
 * - Undefined store → fallback behavior
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ProcessChannelInboundMessage } from "../../channel-inbound/application/use-cases/process-channel-inbound-message.ts";
import type { InboundMessageCommand } from "../../inbound-gate/domain/inbound-message-command.ts";
import type { ProcessInboundMessageInput } from "../../inbound-gate/application/use-cases/process-inbound-message.ts";
import type { InboundDecision } from "../../inbound-gate/domain/inbound-decision.ts";
import type { InboundProcessingRoute } from "../../inbound-gate/domain/inbound-processing-route.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../ai-guide/domain/guide-result.ts";
import type { ExternalIdentityResolver } from "../../inbound-gate/application/ports/external-identity-resolver.ts";
import type { ResolvedInboundActor } from "../../channel-inbound/application/results/resolved-inbound-actor.ts";
import type { ConversationStore } from "../../conversation-store/port/conversation-store.ts";
import type { Conversation } from "../../conversation-store/domain/conversation.ts";
import type { ConversationMessage } from "../../conversation-store/domain/conversation-message.ts";
import type { MediationFlowStore } from "../../mediation-flow/port/mediation-flow-store.ts";
import type { MediationFlowState } from "../../mediation-flow/domain/mediation-flow-state.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allowedDecision(): InboundDecision {
  return {
    status: "allowed",
    reason: "known_sender_conversational",
    metadata: {
      normalizedSenderId: "maria",
      senderKnown: true,
      receivedAt: new Date().toISOString(),
      audited: false,
      policyVersion: "test-v1",
      matchedSignals: [],
      precedence: "conversation_default",
    },
  };
}

function riskDecision(): InboundDecision {
  return {
    status: "needs_mediation",
    reason: "urgent_or_risk_content",
    metadata: {
      normalizedSenderId: "maria",
      senderKnown: true,
      receivedAt: new Date().toISOString(),
      audited: false,
      policyVersion: "test-v1",
      matchedSignals: ["me caí"],
      precedence: "urgent_or_risk_over_mediation",
    },
  };
}

function profileRoute(profileId: "conversation" | "mediation_understanding" | "risk_review"): InboundProcessingRoute {
  return {
    nextStep: "llm_profile_required",
    profileId,
    reason: "known_sender_conversational",
    context: {
      senderId: "maria",
      normalizedSenderId: "maria",
      originalText: "hello",
      receivedAt: new Date().toISOString(),
      decisionStatus: "allowed",
      decisionReason: "known_sender_conversational",
      policyVersion: "test-v1",
      matchedSignals: [],
      precedence: "conversation_default",
    },
  };
}

function successGuideResult(useCaseId: GuideUseCaseId): GuideResult {
  return {
    status: "success",
    useCaseId,
    output: `Mock response for ${useCaseId}`,
    metadata: {
      provider: "mock",
      model: "mock-model-v1",
      attempts: 1,
      auditRecorded: false,
      promptId: "serena.conversation.reply.v1",
      promptVersion: 1,
    },
  };
}

function resolvedIdentity(): ResolvedInboundActor {
  return {
    status: "resolved",
    tenantId: "demo",
    channel: "whatsapp",
    externalSenderId: "maria",
    personId: "maria",
    actorId: "maria",
    role: "contact",
    displayName: "Maria",
    authorized: true,
  };
}

function mockResolver(): ExternalIdentityResolver {
  return {
    resolve: async () => ({ ...resolvedIdentity() }),
  };
}

function mockConversationStore(): ConversationStore {
  return {
    findOrCreateConversation: async (input) => ({
      id: "conv-test-1",
      tenantId: input.tenantId,
      personId: input.personId,
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getConversation: async () => undefined,
    appendMessage: async (msg) => msg,
    listMessages: async () => [],
  };
}

function makeFlowState(overrides?: Partial<MediationFlowState>): MediationFlowState {
  const now = new Date();
  return {
    conversationId: "conv-test-1",
    personId: "maria",
    status: "confirming",
    draft: {
      id: "draft-1",
      conversationId: "conv-test-1",
      requesterPersonId: "maria",
      recipientHint: "Carlos",
      messageDraft: "que llego tarde",
      sourceMessageId: "msg-1",
      sourceText: "avisale a Carlos que llego tarde",
      version: 1,
      status: "draft",
    },
    pendingAction: "confirm_mediation",
    missingFields: ["confirmation"],
    lastQuestion: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("T32: undefined mediationFlowStore → normal path (backward compat)", async () => {
  let aiCalled = false;
  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    // NO mediationFlowStore — should fall back to normal path
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "sí mandalo",
    tenantId: "demo",
  });

  assert.ok(aiCalled, "AI should be called when no flow store");
  assert.equal(result.flowState, undefined, "No flow state without store");
});

test("T32: active confirming flow + 'sí' → resolved via keyword resolver", async () => {
  let classifierCalled = false;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        classifierCalled = true;
      }
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const flowStore: MediationFlowStore = {
    findActiveByConversation: async (convId) => {
      if (convId === "conv-test-1") return makeFlowState();
      return undefined;
    },
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "sí",
    tenantId: "demo",
  });

  // Confirming flow: gate is called for risk detection, but classifier is skipped
  assert.equal(classifierCalled, false, "Classifier should NOT be called for confirming flow");
  assert.ok(result.flowState !== undefined);
  assert.equal(result.flowState.status, "resolved");
  assert.ok(result.promptText !== undefined);
});

test("T32: active confirming flow + 'mejor no' → cancelled", async () => {
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "mejor no",
    tenantId: "demo",
  });

  assert.ok(result.flowState !== undefined);
  assert.equal(result.flowState.status, "resolved");
  assert.ok(result.promptText?.includes("no se enviará"));
});

test("T32: active confirming flow + 'cambiá' → edit, stays confirming", async () => {
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "cambiá el mensaje",
    tenantId: "demo",
  });

  assert.ok(result.flowState !== undefined);
  assert.equal(result.flowState.status, "confirming");
  assert.equal(result.flowState.pendingAction, "confirm_mediation");
});

test("T32: active confirming flow + edit content → updates draft message", async () => {
  let updatedFlow: MediationFlowState | undefined;
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => {
      updatedFlow = state;
      return state;
    },
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "cambiá el mensaje, decile que voy mañana",
    tenantId: "demo",
  });

  assert.equal(updatedFlow?.draft?.messageDraft, "voy mañana");
  assert.equal(result.flowState?.draftMessageDraft, "voy mañana");
  assert.equal(result.flowState?.version, 2);
});

test("T32: active confirming flow + edit without content does not update draft", async () => {
  let updateCalled = false;
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => {
      updateCalled = true;
      return state;
    },
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "cambiá el mensaje",
    tenantId: "demo",
  });

  assert.equal(updateCalled, false);
  assert.equal(result.flowState?.draftMessageDraft, "que llego tarde");
  assert.equal(result.flowState?.version, 1);
  assert.ok(result.promptText?.includes("Qué cambio"));
});

test("T32: active confirming flow + ambiguous text → re-prompt", async () => {
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "bueno",
    tenantId: "demo",
  });

  assert.ok(result.flowState !== undefined);
  assert.equal(result.flowState.status, "confirming");
  assert.ok(result.promptText?.includes("Confirmás"));
});

test("T32: active clarifying flow → routes to AI guide with flow context", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;
  let capturedInput: Record<string, unknown> | undefined;

  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState({
      status: "clarifying",
      pendingAction: "clarify_message",
      missingFields: ["message"],
    }),
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedUseCaseId = useCaseId;
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "que voy a llegar tarde",
    tenantId: "demo",
  });

  assert.equal(capturedUseCaseId, "serena.mediation.clarify");
  assert.ok(capturedInput !== undefined);
  assert.ok(capturedInput!.flowContext !== undefined, "Should include flow context");
  assert.ok(result.flowState !== undefined);
});

test("T32: risk signal during active flow → pauses flow", async () => {
  let pausedFlow: MediationFlowState | undefined;

  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState(),
    startFlow: async (state) => state,
    updateFlow: async (state) => {
      pausedFlow = state;
      return state;
    },
    clearFlow: async () => {},
    pauseFlow: async (convId) => {
      const flow = makeFlowState();
      pausedFlow = { ...flow, status: "paused", pendingAction: null };
      return pausedFlow;
    },
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: riskDecision(),
      route: profileRoute("risk_review"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "me caí y no puedo levantarme",
    tenantId: "demo",
  });

  assert.ok(result.flowState !== undefined);
  assert.equal(result.flowState.status, "paused");
  assert.equal(result.flowState.pendingAction, null);
  assert.ok(result.warnings.some((w) => w.includes("paused")));
});

test("T32: risk signal during clarifying flow → pauses flow", async () => {
  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => makeFlowState({
      status: "clarifying",
      pendingAction: "clarify_message",
      missingFields: ["message"],
    }),
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => makeFlowState({
      status: "paused",
      pendingAction: null,
      missingFields: ["message"],
    }),
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (): Promise<GuideResult> => successGuideResult("serena.conversation.reply"),
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: riskDecision(),
      route: profileRoute("risk_review"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "me caí y no puedo levantarme",
    tenantId: "demo",
  });

  assert.equal(result.flowState?.status, "paused");
  assert.equal(result.flowState?.pendingAction, null);
});

test("T32: no active flow → normal classification path", async () => {
  let classifierCalled = false;

  const flowStore: MediationFlowStore = {
    findActiveByConversation: async () => undefined,
    startFlow: async (state) => state,
    updateFlow: async (state) => state,
    clearFlow: async () => {},
    pauseFlow: async () => undefined,
    resumeFlow: async () => undefined,
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        classifierCalled = true;
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({ intent: "conversation", confidence: 0.9 }),
          metadata: {
            provider: "mock", model: "mock-model-v1", attempts: 1,
            auditRecorded: false, promptId: "serena.inbound.classify_intent.v1", promptVersion: 1,
          },
        };
      }
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async () => ({
      decision: allowedDecision(),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as never,
    aiGuideService: mockAiService as never,
    identityResolver: mockResolver(),
    conversationStore: mockConversationStore(),
    mediationFlowStore: flowStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola como estas",
    tenantId: "demo",
  });

  assert.ok(classifierCalled, "Classifier should be called for normal path");
  assert.equal(result.flowState, undefined, "No flow state for non-mediation");
});
