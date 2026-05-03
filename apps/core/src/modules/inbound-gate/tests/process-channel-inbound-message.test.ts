/**
 * T20 — Unit tests for ProcessChannelInboundMessage use case.
 *
 * Uses mocked ProcessInboundMessage and AiGuideService to test
 * all execution paths in isolation.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ProcessChannelInboundMessage } from "../application/use-cases/process-channel-inbound-message.ts";
import type { InboundMessageCommand, InboundChannel } from "../domain/inbound-message-command.ts";
import type { ProcessInboundMessageInput } from "../application/use-cases/process-inbound-message.ts";
import type { InboundDecision } from "../domain/inbound-decision.ts";
import type { InboundProcessingRoute } from "../domain/inbound-processing-route.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../ai-guide/domain/guide-result.ts";

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
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
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
  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "unknown_sender");
  assert.deepEqual(result.errors, []);
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
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "   ",
    text: "hello",
  });

  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "invalid_sender");
  assert.equal(result.profileId, undefined);
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
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "   ",
  });

  assert.equal(result.inboundDecision.status, "blocked");
  assert.equal(result.inboundDecision.reason, "invalid_text");
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
});

test("clarification not implemented returns structured error", async () => {
  const mockAiService = {
    execute: async (useCaseId: GuideUseCaseId, _input: Record<string, string>): Promise<GuideResult> => {
      throw new Error(`Not implemented: ${useCaseId}. The clarification use case is not yet implemented.`);
    },
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
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "clarify this",
  });

  // Must NOT throw — structured error returned in result
  assert.equal(result.guideResult, undefined);
  assert.ok(result.guideError !== undefined);
  assert.equal(result.guideError!.code, "not_implemented");
  assert.equal(result.guideError!.message, "Clarification use case not yet implemented");
  assert.equal(result.profileId, "clarification");
  assert.equal(result.useCaseId, "serena.mediation.clarify");
  assert.ok(
    result.warnings.includes("clarification profile maps to a not-yet-implemented use case"),
  );
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
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
    // No tenantId, personId, conversationId
  });

  assert.ok(result.warnings.includes("Missing optional field: tenantId"));
  assert.ok(result.warnings.includes("Missing optional field: personId"));
  assert.ok(result.warnings.includes("Missing optional field: conversationId"));
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
  });

  const result = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: "maria",
    text: "hello",
  });

  assert.equal(result.guideResult, undefined);
  assert.ok(result.guideError !== undefined);
  assert.equal(result.guideError!.code, "pipeline_execution_failed");
});
