/**
 * T30 — Unit tests for ProcessChannelInboundMessage use case
 * (with external identity resolution).
 *
 * Uses mocked ProcessInboundMessage, AiGuideService, and
 * ExternalIdentityResolver to test all execution paths in isolation.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ProcessChannelInboundMessage } from "../../channel-inbound/application/use-cases/process-channel-inbound-message.ts";
import type { InboundMessageCommand, InboundChannel } from "../domain/inbound-message-command.ts";
import type { ProcessInboundMessageInput } from "../application/use-cases/process-inbound-message.ts";
import type { InboundDecision } from "../domain/inbound-decision.ts";
import type { InboundProcessingRoute } from "../domain/inbound-processing-route.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../ai-guide/domain/guide-result.ts";
import type { ExternalIdentityResolver } from "../application/ports/external-identity-resolver.ts";
import type { ResolvedInboundActor } from "../../channel-inbound/application/results/resolved-inbound-actor.ts";
import type { InboundMessageCommand as InboundCmd } from "../domain/inbound-message-command.ts";
import type { ConversationStore } from "../../conversation-store/port/conversation-store.ts";
import type { Conversation } from "../../conversation-store/domain/conversation.ts";
import type { ConversationMessage } from "../../conversation-store/domain/conversation-message.ts";
import type { ContactDirectory } from "../../contact-directory/application/ports/contact-directory.ts";

import { AiGuideService } from "../../ai-guide/application/use-cases/ai-guide-service.ts";
import { UseCaseRegistry } from "../../ai-guide/application/use-cases/use-case-registry.ts";
import { ExecutionPipeline } from "../../ai-guide/application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../../ai-guide/infrastructure/memory/mock-llm-provider.ts";
import { InMemoryPromptRegistry } from "../../ai-guide/application/prompts/in-memory-prompt-registry.ts";
import { ContextBuilder } from "../../ai-guide/application/prompts/context-builder.ts";
import { defaultPrompts } from "../../ai-guide/application/prompts/default-prompts.ts";
import { defaultContracts } from "../../ai-guide/application/use-cases/contracts.ts";

/**
 * Creates a real AiGuideService wired to MockLlmProvider and PromptRegistry
 * so clarification can execute end-to-end with default canned responses.
 */
function createRealAiGuideService(): { aiGuideService: AiGuideService } {
  const registry = new UseCaseRegistry();
  for (const contract of defaultContracts) {
    registry.register(contract);
  }
  const provider = new MockLlmProvider();
  const promptRegistry = new InMemoryPromptRegistry(defaultPrompts);
  const contextBuilder = new ContextBuilder();
  const pipeline = new ExecutionPipeline({ provider, registry: promptRegistry, contextBuilder, providerName: "mock", configuredModel: "mock-model-v1" });
  const aiGuideService = new AiGuideService({ registry, pipeline });
  return { aiGuideService };
}

// ---------------------------------------------------------------------------
// Helpers — mock factories
// ---------------------------------------------------------------------------

function blockedDecision(): InboundDecision {
  return {
    status: "blocked",
    reason: "unknown_sender",
    metadata: {
      normalizedSenderId: "unknown",
      senderKnown: false,
      receivedAt: new Date().toISOString(),
      audited: false,
      policyVersion: "test-v1",
      matchedSignals: [],
      precedence: "unknown_sender",
    },
  };
}

function blockedInvalidSender(): InboundDecision {
  return {
    status: "blocked",
    reason: "invalid_sender",
    metadata: {
      normalizedSenderId: "",
      senderKnown: false,
      receivedAt: new Date().toISOString(),
      audited: false,
      policyVersion: "test-v1",
      matchedSignals: [],
      precedence: "invalid_sender",
    },
  };
}

function blockedInvalidText(): InboundDecision {
  return {
    status: "blocked",
    reason: "invalid_text",
    metadata: {
      normalizedSenderId: "sender",
      senderKnown: false,
      receivedAt: new Date().toISOString(),
      audited: false,
      policyVersion: "test-v1",
      matchedSignals: [],
      precedence: "invalid_text",
    },
  };
}

function allowedDecision(profile: "conversation" | "mediation_understanding" | "risk_review" | "clarification"): InboundDecision {
  if (profile === "risk_review") {
    return {
      status: "needs_mediation",
      reason: "urgent_or_risk_content",
      metadata: {
        normalizedSenderId: "maria",
        senderKnown: true,
        receivedAt: new Date().toISOString(),
        audited: false,
        policyVersion: "test-v1",
        matchedSignals: ["urgente"],
        precedence: "urgent_or_risk_over_mediation",
      },
    };
  }

  if (profile === "mediation_understanding") {
    return {
      status: "needs_mediation",
      reason: "third_party_mediation_request",
      metadata: {
        normalizedSenderId: "maria",
        senderKnown: true,
        receivedAt: new Date().toISOString(),
        audited: false,
        policyVersion: "test-v1",
        matchedSignals: ["avisale"],
        precedence: "mediation_over_conversation",
      },
    };
  }

  // conversation or clarification
  return {
    status: profile === "clarification" ? "allowed" : "allowed",
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

function discardRoute(reason: "unknown_sender" | "invalid_sender" | "invalid_text"): InboundProcessingRoute {
  return { nextStep: "discard", reason };
}

function profileRoute(profileId: "conversation" | "mediation_understanding" | "risk_review" | "clarification"): InboundProcessingRoute {
  return {
    nextStep: "llm_profile_required",
    profileId,
    reason: profileId === "risk_review"
      ? "urgent_or_risk_content"
      : profileId === "mediation_understanding"
        ? "third_party_mediation_request"
        : "known_sender_conversational",
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
    output: `Mock response for use case ${useCaseId}`,
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

/**
 * Default resolved identity used by existing tests.
 * Maps externalSenderId "maria" → personId "maria" so the gate
 * treats it as a known sender (matching existing behavior).
 */
function resolvedIdentity(overrides?: Partial<ResolvedInboundActor>): ResolvedInboundActor {
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
    ...overrides,
  };
}

/**
 * Creates a mock ExternalIdentityResolver that returns the provided
 * actor for ANY command (for simplicity in tests).
 */
function mockResolver(actor?: ResolvedInboundActor): ExternalIdentityResolver {
  const defaultActor = actor ?? resolvedIdentity();
  return {
    resolve: async (_cmd: InboundCmd) => structuredClone ?
      (structuredClone(defaultActor) as ResolvedInboundActor) :
      ({ ...defaultActor }),
  };
}

/**
 * Creates a mock resolver that returns a specific actor per command.
 * Accepts a Map keyed by externalSenderId for per-sender responses.
 */
function mockResolverBySender(
  defaultActor: ResolvedInboundActor,
  overrides?: Map<string, ResolvedInboundActor>,
): ExternalIdentityResolver {
  return {
    resolve: async (cmd: InboundCmd) => {
      const override = overrides?.get(cmd.externalSenderId);
      const actor = override ?? defaultActor;
      return structuredClone ?
        (structuredClone(actor) as ResolvedInboundActor) :
        ({ ...actor });
    },
  };
}

/**
 * Creates a mock ConversationStore that records calls and returns
 * deterministic values for testing.
 */
function mockConversationStore(opts?: {
  findOrCreateResult?: Conversation;
  messages?: ConversationMessage[];
}): ConversationStore & { findOrCreateCalls: unknown[][]; appendCalls: ConversationMessage[] } {
  const findOrCreateCalls: unknown[][] = [];
  const appendCalls: ConversationMessage[] = [];
  return {
    findOrCreateCalls,
    appendCalls,
    findOrCreateConversation: async (input) => {
      findOrCreateCalls.push([input]);
      return opts?.findOrCreateResult ?? {
        id: "conv-test-1",
        tenantId: input.tenantId,
        personId: input.personId,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg) => {
      appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => opts?.messages ?? appendCalls,
  };
}

// ---------------------------------------------------------------------------
// Tests — existing scenarios (updated with conversationStore mock)
// ---------------------------------------------------------------------------

test("blocked sender (unknown_sender) returns without AI execution", async () => {
  let aiCalled = false;
  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(_useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedDecision(),
      route: discardRoute("unknown_sender"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const command: InboundMessageCommand = {
    channel: "whatsapp",
    externalSenderId: "unknown",
    text: "hello",
  };

  const result = await useCase.execute(command);

  assert.equal(aiCalled, false);
  assert.equal(result.profileId, undefined);
  assert.equal(result.useCaseId, undefined);
  assert.equal(result.guideResult, undefined);
});

// ---------------------------------------------------------------------------
// T31 — Semantic inbound intent classifier tests
// ---------------------------------------------------------------------------

import { applyFusionPolicy } from "../../channel-inbound/application/use-cases/process-channel-inbound-message.ts";

test("T31: AI classifier returns conversation → useCaseId is serena.conversation.reply", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({
            intent: "conversation",
            confidence: 0.95,
            reason: "Mensaje casual sin señales de mediación ni riesgo.",
          }),
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "Después voy a llamar a una amiga",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.conversation.reply");
  assert.equal(capturedUseCaseId, "serena.conversation.reply");
});

test("T31: AI classifier returns mediation_understanding → useCaseId is serena.mediation.understand_request", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({
            intent: "mediation_understanding",
            confidence: 0.9,
            reason: "El actor pide que Serena avise a otra persona.",
          }),
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "Avisale a Carlos que llego tarde",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  assert.equal(capturedUseCaseId, "serena.mediation.understand_request");
});

test("T31: AI classifier returns risk_review → useCaseId is serena.risk.review", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({
            intent: "risk_review",
            confidence: 0.85,
            reason: "El mensaje indica una posible emergencia.",
          }),
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "Me siento mareada",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.risk.review");
  assert.equal(capturedUseCaseId, "serena.risk.review");
});

test("T31: AI classifier returns clarification → useCaseId is serena.mediation.clarify", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({
            intent: "clarification",
            confidence: 0.6,
            reason: "No está claro si es pedido de mediación o charla.",
          }),
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "Bueno, después vemos",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.mediation.clarify");
  assert.equal(capturedUseCaseId, "serena.mediation.clarify");
});

test("T31: AI classifier fails → fallback to deterministic route", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        throw new Error("Classifier unavailable");
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
    tenantId: "demo",
  });

  // Should fallback to deterministic route (conversation)
  assert.equal(result.useCaseId, "serena.conversation.reply");
  assert.equal(capturedUseCaseId, "serena.conversation.reply");
});

test("T31: AI classifier returns invalid JSON → fallback to deterministic route", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: "not valid json {{{",
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("mediation_understanding"),
      route: profileRoute("mediation_understanding"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "avisale a Carlos",
    tenantId: "demo",
  });

  // Should fallback to deterministic route (mediation)
  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  assert.equal(capturedUseCaseId, "serena.mediation.understand_request");
});

test("T31: Deterministic risk_review wins over any AI classification", async () => {
  let capturedUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      if (useCaseId === "serena.inbound.classify_intent") {
        return {
          status: "success",
          useCaseId,
          output: JSON.stringify({
            intent: "conversation",
            confidence: 0.99,
            reason: "No parece riesgo.",
          }),
          metadata: {
            provider: "mock",
            model: "mock-model-v1",
            attempts: 1,
            auditRecorded: false,
            promptId: "serena.inbound.classify_intent.v1",
            promptVersion: 1,
          },
        };
      }
      capturedUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("risk_review"),
      route: profileRoute("risk_review"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "Me caí y no puedo levantarme",
    tenantId: "demo",
  });

  // Deterministic risk always wins
  assert.equal(result.useCaseId, "serena.risk.review");
  assert.equal(capturedUseCaseId, "serena.risk.review");
});

// ---------------------------------------------------------------------------
// T31 — applyFusionPolicy unit tests
// ---------------------------------------------------------------------------

test("applyFusionPolicy: deterministic risk wins over AI conversation", () => {
  const result = applyFusionPolicy("risk_review", "conversation", 0.9);
  assert.equal(result, "risk_review");
});

test("applyFusionPolicy: deterministic risk wins over AI mediation", () => {
  const result = applyFusionPolicy("risk_review", "mediation_understanding", 0.9);
  assert.equal(result, "risk_review");
});

test("applyFusionPolicy: deterministic risk wins over AI clarification", () => {
  const result = applyFusionPolicy("risk_review", "clarification", 0.9);
  assert.equal(result, "risk_review");
});

test("applyFusionPolicy: AI risk overrides deterministic conversation", () => {
  const result = applyFusionPolicy("conversation", "risk_review", 0.8);
  assert.equal(result, "risk_review");
});

test("applyFusionPolicy: AI risk overrides deterministic mediation", () => {
  const result = applyFusionPolicy("mediation_understanding", "risk_review", 0.8);
  assert.equal(result, "risk_review");
});

test("applyFusionPolicy: AI mediation overrides deterministic conversation", () => {
  const result = applyFusionPolicy("conversation", "mediation_understanding", 0.85);
  assert.equal(result, "mediation_understanding");
});

test("applyFusionPolicy: AI clarification overrides deterministic conversation", () => {
  const result = applyFusionPolicy("conversation", "clarification", 0.5);
  assert.equal(result, "clarification");
});

test("applyFusionPolicy: AI conversation overrides deterministic mediation", () => {
  const result = applyFusionPolicy("mediation_understanding", "conversation", 0.9);
  assert.equal(result, "conversation");
});

test("applyFusionPolicy: AI conversation overrides deterministic clarification", () => {
  const result = applyFusionPolicy("clarification", "conversation", 0.9);
  assert.equal(result, "conversation");
});

test("applyFusionPolicy: unknown AI intent falls back to deterministic", () => {
  const result = applyFusionPolicy("conversation", "unknown_intent", 0.5);
  assert.equal(result, "conversation");
});

test("applyFusionPolicy: unknown AI intent falls back to deterministic mediation", () => {
  const result = applyFusionPolicy("mediation_understanding", "weird_intent", 0.3);
  assert.equal(result, "mediation_understanding");
});

test("applyFusionPolicy: confidence parameter is ignored (uses intent only)", () => {
  const r1 = applyFusionPolicy("conversation", "risk_review", 0.01);
  const r2 = applyFusionPolicy("conversation", "risk_review", 0.99);
  assert.equal(r1, r2, "confidence should not affect the result");
});

test("invalid sender (blank) is blocked", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedInvalidSender(),
      route: discardRoute("invalid_sender"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: { execute: async () => successGuideResult("serena.conversation.reply") } as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "   ",
    text: "hello",
  });

  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "invalid_sender");
  assert.equal(result.profileId, undefined);
  assert.ok(result.identity !== undefined);
});

test("invalid text (blank) is blocked", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedInvalidText(),
      route: discardRoute("invalid_text"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: { execute: async () => successGuideResult("serena.conversation.reply") } as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "   ",
  });

  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "invalid_text");
  assert.ok(result.identity !== undefined);
});

test("conversation flow calls AI guide with correct use case", async () => {
  let calledUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      calledUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
  });

  assert.equal(calledUseCaseId, "serena.conversation.reply");
  assert.equal(result.profileId, "conversation");
  assert.equal(result.useCaseId, "serena.conversation.reply");
  assert.ok(result.guideResult !== undefined);
  assert.equal(result.guideResult!.status, "success");
  assert.ok(result.identity !== undefined);
  assert.equal(result.identity!.status, "resolved");
});

test("risk review flow calls AI guide with correct use case", async () => {
  let calledUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      calledUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("risk_review"),
      route: profileRoute("risk_review"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "es urgente",
  });

  assert.equal(calledUseCaseId, "serena.risk.review");
  assert.equal(result.profileId, "risk_review");
  assert.equal(result.useCaseId, "serena.risk.review");
  assert.ok(result.guideResult !== undefined);
  assert.ok(result.identity !== undefined);
});

test("mediation understanding flow calls AI guide with correct use case", async () => {
  let calledUseCaseId: GuideUseCaseId | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      calledUseCaseId = useCaseId;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("mediation_understanding"),
      route: profileRoute("mediation_understanding"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "avisale a Carlos",
  });

  assert.equal(calledUseCaseId, "serena.mediation.understand_request");
  assert.equal(result.profileId, "mediation_understanding");
  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  assert.ok(result.guideResult !== undefined);
  assert.ok(result.identity !== undefined);
});

test("clarification executes successfully (no longer blocked)", async () => {
  // AiGuideService now executes clarification normally via MockLlmProvider
  // NOTE: The semantic classifier returns "conversation" by default, which
  // overrides the deterministic "clarification" route via fusion policy.
  // This test verifies the pipeline executes without errors.
  const { aiGuideService } = createRealAiGuideService();

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("clarification"),
      route: profileRoute("clarification"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService,
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "clarify this",
  });

  // Clarification executes successfully — guideResult present, no guideError
  // Note: profileId is fused result (classifier says "conversation" → conversation)
  assert.ok(result.guideResult !== undefined);
  assert.equal(result.guideResult!.status, "success");
  assert.equal(result.guideError, undefined);
  assert.equal(result.profileId, "conversation"); // Fused: classifier overrides deterministic
  assert.equal(result.useCaseId, "serena.conversation.reply");
  assert.ok(result.identity !== undefined);
});

test("unexpected AI guide failure returns guideError with code", async () => {
  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      throw new Error("Something went terribly wrong");
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
  });

  assert.equal(result.guideResult, undefined);
  assert.ok(result.guideError !== undefined);
  assert.equal(result.guideError!.code, "pipeline_execution_failed");
  assert.ok(result.errors.some((e) => e.includes("Something went terribly wrong")));
  assert.ok(result.identity !== undefined);
});

test("trace ID is a non-empty string", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "simulation",
    externalSenderId: "maria",
    text: "hello",
  });

  assert.ok(typeof result.traceId === "string");
  assert.ok(result.traceId.length > 0);
});

test("custom trace ID generator is used when provided", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    generateTraceId: () => "custom-trace-123",
  });

  const result = await useCase.execute({
    channel: "simulation",
    externalSenderId: "maria",
    text: "hello",
  });

  assert.equal(result.traceId, "custom-trace-123");
});

test("trace IDs are unique across executions", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result1 = await useCase.execute({ channel: "simulation", externalSenderId: "maria", text: "a" });
  const result2 = await useCase.execute({ channel: "simulation", externalSenderId: "maria", text: "b" });

  assert.notEqual(result1.traceId, result2.traceId);
});

test("occurredAt is parsed correctly from ISO string", async () => {
  let receivedAt: Date | undefined;
  const mockProcessInbound = {
    execute: async (input: ProcessInboundMessageInput) => {
      receivedAt = input.receivedAt;
      return {
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
    occurredAt: "2025-01-15T10:30:00.000Z",
  });

  assert.ok(receivedAt !== undefined);
  assert.equal(receivedAt!.toISOString(), "2025-01-15T10:30:00.000Z");
});

test("missing occurredAt defaults to current time", async () => {
  let receivedAt: Date | undefined;
  const before = new Date();

  const mockProcessInbound = {
    execute: async (input: ProcessInboundMessageInput) => {
      receivedAt = input.receivedAt;
      return {
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
  });

  const after = new Date();
  assert.ok(receivedAt !== undefined);
  assert.ok(receivedAt!.getTime() >= before.getTime());
  assert.ok(receivedAt!.getTime() <= after.getTime());
});

test("result echoes the input channel", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const channels: InboundChannel[] = ["whatsapp", "voice", "web_chat", "telegram", "system", "simulation"];
  for (const channel of channels) {
    const result = await useCase.execute({ channel, externalSenderId: "maria", text: "hello" });
    assert.equal(result.channel, channel);
  }
});

test("warnings for missing optional fields", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
    // No tenantId, personId, conversationId
  });

  assert.ok(result.warnings.includes("Missing optional field: tenantId"));
  assert.ok(result.warnings.includes("Missing optional field: personId"));
});

test("invalid occurredAt defaults to current time", async () => {
  let receivedAt: Date | undefined;
  const mockProcessInbound = {
    execute: async (input: ProcessInboundMessageInput) => {
      receivedAt = input.receivedAt;
      return {
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
    occurredAt: "not-a-date",
  });

  // Should default to current time, not NaN
  assert.ok(receivedAt !== undefined);
  assert.ok(!Number.isNaN(receivedAt!.getTime()));
});

test("non-Error thrown by AiGuideService is caught", async () => {
  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      // eslint-disable-next-line no-throw-literal
      throw "string error";
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
  });

  assert.equal(result.guideResult, undefined);
  assert.ok(result.guideError !== undefined);
  assert.equal(result.guideError!.code, "pipeline_execution_failed");
  assert.ok(result.identity !== undefined);
});

// ---------------------------------------------------------------------------
// NEW TESTS — identity resolution
// ---------------------------------------------------------------------------

test("blocked identity short-circuits without calling ProcessInboundMessage", async () => {
  let processCalled = false;
  let aiCalled = false;

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => {
      processCalled = true;
      return {
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      };
    },
  };

  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(_useCaseId);
    },
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "blocked",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "spammer",
      authorized: false,
      reason: "sender_blocked",
    }),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "spammer",
    text: "hello",
  });

  assert.equal(processCalled, false, "ProcessInboundMessage should NOT be called for blocked identity");
  assert.equal(aiCalled, false, "AiGuideService should NOT be called for blocked identity");
  assert.equal(result.identity!.status, "blocked");
  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "blocked_sender");
  assert.equal(result.inboundDecision.metadata.precedence, "identity_blocked");
  assert.ok(
    result.inboundDecision.metadata.matchedSignals.includes("identity_blocked"),
    "matchedSignals should include identity_blocked",
  );
  assert.equal(result.profileId, undefined);
  assert.equal(result.useCaseId, undefined);
  assert.equal(result.guideResult, undefined);
});

test("unknown identity continues to gate evaluation", async () => {
  let processCalled = false;
  let receivedSenderId: string | undefined;

  const mockProcessInbound = {
    execute: async (input: ProcessInboundMessageInput) => {
      processCalled = true;
      receivedSenderId = input.senderId;
      return {
        decision: blockedDecision(),
        route: discardRoute("unknown_sender"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "unknown",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "stranger",
      authorized: false,
      reason: "unknown_sender",
    }),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "stranger",
    text: "hello",
  });

  // Gate IS called — unknown identity doesn't short-circuit
  assert.equal(processCalled, true, "Gate should still be called for unknown identity");
  // externalSenderId passes through since no personId is set
  assert.equal(receivedSenderId, "stranger");
  assert.equal(result.identity!.status, "unknown");
  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "unknown_sender");
  assert.equal(result.profileId, undefined);
  assert.equal(result.useCaseId, undefined);
  assert.equal(result.guideResult, undefined);
});

test("resolved identity passes personId (not externalSenderId) to ProcessInboundMessage", async () => {
  let receivedSenderId: string | undefined;

  const mockProcessInbound = {
    execute: async (input: ProcessInboundMessageInput) => {
      receivedSenderId = input.senderId;
      return {
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "resolved",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5492600000000",
      personId: "elder_001",
      actorId: "elder_001",
      role: "elder",
      displayName: "Marta",
      authorized: true,
    }),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "+5492600000000",
    text: "hola",
  });

  // ProcessInboundMessage receives personId as senderId, NOT externalSenderId
  assert.equal(receivedSenderId, "elder_001");
  assert.notEqual(receivedSenderId, "+5492600000000");
  assert.equal(result.identity!.status, "resolved");
  assert.equal(result.identity!.personId, "elder_001");
  assert.equal(result.identity!.displayName, "Marta");
});

test("identity field is present in discard result path", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedDecision(),
      route: discardRoute("unknown_sender"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: { execute: async () => successGuideResult("serena.conversation.reply") } as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "unknown",
    text: "hello",
  });

  assert.ok(result.identity !== undefined, "identity must be present in discard result");
  assert.equal(result.identity!.status, "resolved");
});

test("resolver error caught, treated as unknown, no crash", async () => {
  let processCalled = false;

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => {
      processCalled = true;
      return {
        decision: blockedDecision(),
        route: discardRoute("unknown_sender"),
      };
    },
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  // Resolver that always throws
  const throwingResolver: ExternalIdentityResolver = {
    resolve: async (_cmd: InboundCmd) => {
      throw new Error("Network unreachable");
    },
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: throwingResolver,
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
  });

  // Must NOT crash — identity treated as unknown
  assert.equal(result.identity!.status, "unknown");
  assert.equal(result.identity!.authorized, false);
  assert.ok(
    result.warnings.some((w) => w.includes("Identity resolution failed")),
    "should have warning about resolution failure",
  );
  // Gate still called for unknown identity
  assert.equal(processCalled, true);
});

// ---------------------------------------------------------------------------
// NEW TESTS — conversation store integration
// ---------------------------------------------------------------------------

test("resolved identity creates conversation and includes it in result", async () => {
  let findOrCreateCalled = false;
  let appendCalled = false;
  let savedConversationId: string | undefined;

  const mockStore = {
    findOrCreateCalls: [] as unknown[][],
    appendCalls: [] as ConversationMessage[],
    findOrCreateConversation: async (input: unknown) => {
      findOrCreateCalled = true;
      const inp = input as { tenantId: string; personId: string };
      savedConversationId = "conv-test-1";
      return {
        id: savedConversationId,
        tenantId: inp.tenantId,
        personId: inp.personId,
        status: "open" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg: ConversationMessage) => {
      appendCalled = true;
      mockStore.appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => mockStore.appendCalls,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(findOrCreateCalled, true, "findOrCreateConversation should be called for resolved identity");
  assert.equal(appendCalled, true, "appendMessage should be called for resolved identity");
  assert.ok(result.conversation !== undefined, "conversation should be in result");
  assert.equal(result.conversation!.id, savedConversationId);
  assert.equal(result.conversation!.status, "open");
  assert.ok(result.conversation!.messageCount >= 1);
});

test("resolved identity with existing conversationId passes it through", async () => {
  let receivedConversationId: string | undefined;

  const mockStore = {
    findOrCreateCalls: [] as unknown[][],
    appendCalls: [] as ConversationMessage[],
    findOrCreateConversation: async (input: unknown) => {
      const inp = input as { tenantId: string; personId: string; conversationId?: string };
      receivedConversationId = inp.conversationId;
      return {
        id: inp.conversationId ?? "conv-new",
        tenantId: inp.tenantId,
        personId: inp.personId,
        status: "open" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg: ConversationMessage) => {
      mockStore.appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => mockStore.appendCalls,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
    tenantId: "demo",
    conversationId: "existing-conv-123",
  });

  assert.equal(receivedConversationId, "existing-conv-123", "provided conversationId should be passed to store");
});

test("unknown identity does not create conversation", async () => {
  let findOrCreateCalled = false;

  const mockStore = {
    findOrCreateCalls: [] as unknown[][],
    appendCalls: [] as ConversationMessage[],
    findOrCreateConversation: async (input: unknown) => {
      const inp = input as { tenantId: string; personId: string };
      return { id: "conv-discard", tenantId: inp.tenantId, personId: inp.personId, status: "open" as const, createdAt: new Date(), updatedAt: new Date() };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg: ConversationMessage) => {
      mockStore.appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => mockStore.appendCalls,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedDecision(),
      route: discardRoute("unknown_sender"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "unknown",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "stranger",
      authorized: false,
      reason: "unknown_sender",
    }),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "stranger",
    text: "hello",
  });

  assert.equal(findOrCreateCalled, false, "findOrCreateConversation should NOT be called for unknown identity");
  assert.equal(result.conversation, undefined, "conversation should NOT be in result for unknown identity");
});

test("blocked identity does not create conversation", async () => {
  let findOrCreateCalled = false;

  const mockStore = {
    findOrCreateCalls: [] as unknown[][],
    appendCalls: [] as ConversationMessage[],
    findOrCreateConversation: async (_input: unknown) => {
      findOrCreateCalled = true;
      return { id: "no", tenantId: "x", personId: "x", status: "open" as const, createdAt: new Date(), updatedAt: new Date() };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg: ConversationMessage) => {
      mockStore.appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => mockStore.appendCalls,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const blockedIdentity = mockResolver({
    status: "blocked",
    tenantId: "demo",
    channel: "whatsapp",
    externalSenderId: "spammer",
    authorized: false,
    reason: "sender_blocked",
  });

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: blockedIdentity,
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "spammer",
    text: "hello",
  });

  assert.equal(findOrCreateCalled, false, "findOrCreateConversation should NOT be called for blocked identity");
  assert.equal(result.conversation, undefined, "conversation should NOT be in result for blocked identity");
  assert.equal(result.identity!.status, "blocked");
});

test("conversation info present in discard path for resolved identity", async () => {
  // Resolved identity but gate decides to discard (e.g., unknown_sender after resolution)
  const mockStore = {
    findOrCreateCalls: [] as unknown[][],
    appendCalls: [] as ConversationMessage[],
    findOrCreateConversation: async (input: unknown) => {
      const inp = input as { tenantId: string; personId: string };
      return { id: "conv-discard", tenantId: inp.tenantId, personId: inp.personId, status: "open" as const, createdAt: new Date(), updatedAt: new Date() };
    },
    getConversation: async (_id: string) => undefined,
    appendMessage: async (msg: ConversationMessage) => {
      mockStore.appendCalls.push(msg);
      return msg;
    },
    listMessages: async (_id: string) => mockStore.appendCalls,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedDecision(),
      route: discardRoute("unknown_sender"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  // Despite identity being resolved, the gate discards
  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
  });

  // Even on discard, resolved identity should have conversation info
  assert.ok(result.conversation !== undefined, "conversation should be present even on discard for resolved identity");
  assert.equal(result.conversation!.id, "conv-discard");
  assert.equal(result.conversation!.status, "open");
  assert.equal(result.conversation!.messageCount, 1);
});

test("no conversationId warning in warnings (old warning removed)", async () => {
  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
    // No conversationId provided — old code warned, new code should not
  });

  assert.ok(result.warnings.includes("Missing optional field: tenantId"));
  assert.ok(result.warnings.includes("Missing optional field: personId"));
  assert.ok(
    !result.warnings.includes("Missing optional field: conversationId"),
    "conversationId warning should no longer be present",
  );
});

// ---------------------------------------------------------------------------
// NEW TESTS — outbound message recording policy
// ---------------------------------------------------------------------------

test("risk_review does not record outbound message", async () => {
  const mockStore = mockConversationStore();

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("risk_review"),
      route: profileRoute("risk_review"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "es urgente",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.risk.review");
  // Only the inbound message should be recorded — no outbound for risk_review
  assert.equal(mockStore.appendCalls.length, 1, "Only one message should be recorded");
  assert.equal(mockStore.appendCalls[0]!.direction, "inbound");
  // messageCount should reflect the real accumulated count (1 inbound only)
  assert.ok(result.conversation !== undefined);
  assert.equal(result.conversation!.messageCount, 1);
});

test("mediation_understanding does not record outbound message", async () => {
  const mockStore = mockConversationStore();

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("mediation_understanding"),
      route: profileRoute("mediation_understanding"),
    }),
  };

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> =>
      successGuideResult(useCaseId),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "avisale a Carlos",
    tenantId: "demo",
  });

  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  // Only the inbound message should be recorded — no outbound for mediation_understanding
  assert.equal(mockStore.appendCalls.length, 1, "Only one message should be recorded");
  assert.equal(mockStore.appendCalls[0]!.direction, "inbound");
  // messageCount should reflect the real accumulated count (1 inbound only)
  assert.ok(result.conversation !== undefined);
  assert.equal(result.conversation!.messageCount, 1);
});

// ---------------------------------------------------------------------------
// T27 — Conversation history wiring tests
// ---------------------------------------------------------------------------

test("first message in conversation → AiGuide receives recentMessages: []", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const mockStore = mockConversationStore();

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "first message",
    tenantId: "demo",
  });

  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const recentMessages = capturedInput!.recentMessages as string[] | undefined;
  assert.ok(
    recentMessages === undefined || recentMessages.length === 0,
    "first message should have empty or undefined recentMessages"
  );
});

test("second message → AiGuide receives first message in recentMessages", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  // Pre-seed the store with one existing message
  const existingMsg: ConversationMessage = {
    id: "msg-prev-1",
    conversationId: "conv-test-1",
    tenantId: "demo",
    personId: "maria",
    channel: "whatsapp",
    direction: "inbound",
    text: "previous message",
    occurredAt: new Date(),
  };

  const mockStore = mockConversationStore({ messages: [existingMsg] });

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "second message",
    tenantId: "demo",
  });

  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const recentMessages = capturedInput!.recentMessages as string[];
  assert.ok(Array.isArray(recentMessages), "recentMessages should be an array");
  assert.equal(recentMessages.length, 1, "should have 1 recent message (the previous one)");
  assert.ok(
    recentMessages[0]!.includes("previous message"),
    "recentMessages should contain the previous message text"
  );
  assert.ok(
    recentMessages[0]!.includes("[inbound]"),
    "recentMessages should contain direction prefix"
  );
  assert.ok(
    recentMessages[0]!.includes("maria"),
    "recentMessages should contain personId"
  );
  assert.ok(
    recentMessages[0]!.includes("whatsapp"),
    "recentMessages should contain channel"
  );
});

test("current message not duplicated in recentMessages", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const existingMsg: ConversationMessage = {
    id: "msg-1",
    conversationId: "conv-test-1",
    tenantId: "demo",
    personId: "maria",
    channel: "whatsapp",
    direction: "inbound",
    text: "old message",
    occurredAt: new Date(),
  };

  const mockStore = mockConversationStore({ messages: [existingMsg] });

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "NEW MESSAGE TEXT",
    tenantId: "demo",
  });

  assert.ok(capturedInput !== undefined);
  const recentMessages = capturedInput!.recentMessages as string[];
  // The new message "NEW MESSAGE TEXT" should NOT appear in recentMessages
  const hasNewMessage = recentMessages.some((m) => m.includes("NEW MESSAGE TEXT"));
  assert.equal(hasNewMessage, false, "current message must NOT appear in recentMessages");
  // But the old message should be there
  const hasOldMessage = recentMessages.some((m) => m.includes("old message"));
  assert.equal(hasOldMessage, true, "old message should appear in recentMessages");
});

test("recentMessages preserves chronological order", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  // Pre-seed with 3 messages in chronological order
  const existingMessages: ConversationMessage[] = [
    {
      id: "msg-1",
      conversationId: "conv-test-1",
      tenantId: "demo",
      personId: "maria",
      channel: "whatsapp",
      direction: "inbound",
      text: "first",
      occurredAt: new Date("2025-01-01T10:00:00Z"),
    },
    {
      id: "msg-2",
      conversationId: "conv-test-1",
      tenantId: "demo",
      personId: "maria",
      channel: "whatsapp",
      direction: "inbound",
      text: "second",
      occurredAt: new Date("2025-01-01T10:01:00Z"),
    },
    {
      id: "msg-3",
      conversationId: "conv-test-1",
      tenantId: "demo",
      personId: "maria",
      channel: "whatsapp",
      direction: "inbound",
      text: "third",
      occurredAt: new Date("2025-01-01T10:02:00Z"),
    },
  ];

  const mockStore = mockConversationStore({ messages: existingMessages });

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockStore as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "fourth message",
    tenantId: "demo",
  });

  assert.ok(capturedInput !== undefined);
  const recentMessages = capturedInput!.recentMessages as string[];
  assert.equal(recentMessages.length, 3, "should have 3 recent messages");
  // Chronological order: first → second → third
  assert.ok(recentMessages[0]!.includes("first"), "first message should be at index 0");
  assert.ok(recentMessages[1]!.includes("second"), "second message should be at index 1");
  assert.ok(recentMessages[2]!.includes("third"), "third message should be at index 2");
});

test("actorRole, channel, resolvedIdentity passed to AiGuide when identity resolved", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity({ role: "contact", displayName: "Maria" })),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
    tenantId: "demo",
  });

  assert.ok(capturedInput !== undefined);
  assert.equal(capturedInput!.actorRole, "contact", "actorRole should be passed");
  assert.equal(capturedInput!.channel, "whatsapp", "channel should be passed");
  assert.equal(capturedInput!.resolvedIdentity, "Maria", "resolvedIdentity should be passed");
});

test("blocked identity → AiGuide not executed (existing behavior confirmed)", async () => {
  let aiCalled = false;

  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(_useCaseId);
    },
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: {
      execute: async () => ({
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      }),
    } as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "blocked",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "spammer",
      authorized: false,
      reason: "sender_blocked",
    }),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "spammer",
    text: "buy now!",
  });

  assert.equal(aiCalled, false, "AiGuide must NOT be called for blocked identity");
  assert.equal(result.identity!.status, "blocked");
  assert.equal(result.guideResult, undefined);
});

// ---------------------------------------------------------------------------
// T28 — Known contacts wiring tests
// ---------------------------------------------------------------------------

test("mediation_understanding route passes knownContacts to AiGuide", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  let findAllCalled = false;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [
        { id: "c1", displayName: "María", whatsappId: "+5492600111111" },
        { id: "c2", displayName: "Carlos", whatsappId: "+5492600222222" },
      ];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("mediation_understanding"),
      route: profileRoute("mediation_understanding"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "avisale a Carlos",
    tenantId: "demo",
  });

  assert.equal(findAllCalled, true, "contactDirectory.findAll() should be called for mediation_understanding");
  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const knownContacts = capturedInput!.knownContacts as string[] | undefined;
  assert.ok(Array.isArray(knownContacts), "knownContacts should be an array");
  assert.equal(knownContacts!.length, 2, "should have 2 contacts");
  assert.equal(knownContacts![0], "María (id: c1)");
  assert.equal(knownContacts![1], "Carlos (id: c2)");
  assert.equal(capturedInput!.input, "avisale a Carlos", "input text must be preserved");
});

test("clarification route passes knownContacts to AiGuide", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  let findAllCalled = false;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [
        { id: "c1", displayName: "María", whatsappId: "+5492600111111" },
        { id: "c2", displayName: "Carlos", whatsappId: "+5492600222222" },
      ];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("clarification"),
      route: profileRoute("clarification"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "clarify this",
    tenantId: "demo",
  });

  assert.equal(findAllCalled, true, "contactDirectory.findAll() should be called for clarification");
  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const knownContacts = capturedInput!.knownContacts as string[] | undefined;
  assert.ok(Array.isArray(knownContacts), "knownContacts should be an array");
  assert.equal(knownContacts!.length, 2, "should have 2 contacts");
  assert.equal(knownContacts![0], "María (id: c1)");
  assert.equal(capturedInput!.useCaseId, undefined, "capturedInput should not have useCaseId (only passed to execute)");
});

test("conversation route does NOT pass knownContacts to AiGuide", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  let findAllCalled = false;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [
        { id: "c1", displayName: "María", whatsappId: "+5492600111111" },
      ];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("conversation"),
      route: profileRoute("conversation"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(findAllCalled, false, "contactDirectory.findAll() should NOT be called for conversation");
  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const knownContacts = capturedInput!.knownContacts as string[] | undefined;
  assert.ok(
    knownContacts === undefined || knownContacts.length === 0,
    "knownContacts must be empty or undefined for conversation route"
  );
});

test("risk_review route does NOT pass knownContacts to AiGuide", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  let findAllCalled = false;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [
        { id: "c1", displayName: "María", whatsappId: "+5492600111111" },
      ];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("risk_review"),
      route: profileRoute("risk_review"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "es urgente",
    tenantId: "demo",
  });

  assert.equal(findAllCalled, false, "contactDirectory.findAll() should NOT be called for risk_review");
  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const knownContacts = capturedInput!.knownContacts as string[] | undefined;
  assert.ok(
    knownContacts === undefined || knownContacts.length === 0,
    "knownContacts must be empty or undefined for risk_review route"
  );
});

test("contactDirectory not provided — mediation route works gracefully without contacts", async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, input: Record<string, unknown>): Promise<GuideResult> => {
      capturedInput = input;
      return successGuideResult(useCaseId);
    },
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: allowedDecision("mediation_understanding"),
      route: profileRoute("mediation_understanding"),
    }),
  };

  // No contactDirectory provided
  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    // contactDirectory intentionally omitted
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "avisale a Carlos",
    tenantId: "demo",
  });

  assert.equal(result.profileId, "mediation_understanding");
  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  assert.ok(result.guideResult !== undefined, "mediation should succeed even without contactDirectory");
  assert.ok(capturedInput !== undefined, "AiGuide should have been called");
  const knownContacts = capturedInput!.knownContacts as string[] | undefined;
  assert.ok(
    knownContacts === undefined || knownContacts.length === 0,
    "knownContacts must be empty when contactDirectory not provided"
  );
});

test("blocked identity does NOT call contactDirectory.findAll() nor AiGuide", async () => {
  let findAllCalled = false;
  let aiCalled = false;

  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(_useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: {
      execute: async () => ({
        decision: allowedDecision("conversation"),
        route: profileRoute("conversation"),
      }),
    } as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver({
      status: "blocked",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "spammer",
      authorized: false,
      reason: "sender_blocked",
    }),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "spammer",
    text: "buy now!",
  });

  assert.equal(findAllCalled, false, "contactDirectory.findAll() must NOT be called for blocked identity");
  assert.equal(aiCalled, false, "AiGuide must NOT be called for blocked identity");
  assert.equal(result.identity!.status, "blocked");
  assert.equal(result.guideResult, undefined);
});

test("discard route does NOT call contactDirectory.findAll() nor AiGuide", async () => {
  let findAllCalled = false;
  let aiCalled = false;

  const mockAiService = {
    execute: async (_useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      aiCalled = true;
      return successGuideResult(_useCaseId);
    },
  };

  const contactDir: ContactDirectory = {
    findAll: async () => {
      findAllCalled = true;
      return [];
    },
    findByWhatsAppId: async () => undefined,
    findById: async () => undefined,
    hasAllowedSender: async () => true,
  };

  const mockProcessInbound = {
    execute: async (_input: ProcessInboundMessageInput) => ({
      decision: blockedDecision(),
      route: discardRoute("unknown_sender"),
    }),
  };

  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: mockProcessInbound as unknown as ProcessChannelInboundMessage["processInboundMessage"],
    aiGuideService: mockAiService as unknown as ProcessChannelInboundMessage["aiGuideService"],
    identityResolver: mockResolver(resolvedIdentity()),
    conversationStore: mockConversationStore() as unknown as ConversationStore,
    contactDirectory: contactDir,
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
  });

  assert.equal(findAllCalled, false, "contactDirectory.findAll() must NOT be called for discard route");
  assert.equal(aiCalled, false, "AiGuide must NOT be called for discard route");
  assert.equal(result.profileId, undefined);
  assert.equal(result.useCaseId, undefined);
  assert.equal(result.guideResult, undefined);
});
