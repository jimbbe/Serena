/**
 * T32 — Integration scenario tests for the mediation clarification + confirmation flow.
 *
 * Uses real pipeline components (MockLlmProvider, InMemoryMediationFlowStore,
 * ProcessChannelInboundMessage) to verify multi-step flows where state
 * persists between steps.
 *
 * IMPORTANT: conversationId must be propagated between steps because
 * InMemoryConversationStore creates a new conversation each time when
 * no conversationId is provided.
 *
 * NOTE: The rule-based mediation understanding extracts fields from text
 * BEFORE the AI guide is called. For standard patterns like "avisale a X que Y",
 * the rules extract both recipient and message, so the flow goes directly to
 * "confirming". Canned MockLlmProvider responses only affect the flow when
 * the rule-based extraction is incomplete or absent.
 *
 * Scenarios:
 *   S1: Complete mediation — understand → confirm → resolved
 *   S2: Mediation with cancellation
 *   S3: Mediation with clarification then confirmation (canned override)
 *   S4: Mediation with edit then confirmation
 *   S5: Risk signal during confirming flow → paused
 *   S6: Ambiguous input during confirmation → re-prompt
 *   S7: Normal conversation (no mediation) — unchanged behavior
 *   S8: Clarification loop with canned override
 *   S9: Multiple consecutive mediations in same conversation
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPipeline } from "../../../bootstrap/create-in-memory-pipeline.ts";
import { MockLlmProvider } from "../../ai-guide/infrastructure/memory/mock-llm-provider.ts";
import type { PromptId } from "../../ai-guide/domain/prompt-id.ts";

// ---------------------------------------------------------------------------
// Seed contacts (mirrors contacts.seed.json)
// ---------------------------------------------------------------------------

const MARIA_WHATSAPP = "5491111111111";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh pipeline with optional canned responses. */
async function freshPipeline(canned?: Map<PromptId, { content: string; tokensUsed?: number }>) {
  const llmProvider = new MockLlmProvider(canned);
  return createInMemoryPipeline({ llmProvider, providerName: "mock", configuredModel: "mock-v1" });
}

/** Execute a pipeline step, propagating conversationId from previous step. */
async function doStep(
  pipeline: Awaited<ReturnType<typeof freshPipeline>>,
  text: string,
  conversationId?: string,
) {
  return pipeline.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: MARIA_WHATSAPP,
    text,
    tenantId: "demo",
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

async function doStepFromSender(
  pipeline: Awaited<ReturnType<typeof freshPipeline>>,
  senderId: string,
  channel: "whatsapp" | "voice" | "web_chat",
  text: string,
  conversationId?: string,
) {
  return pipeline.processChannelInboundMessage.execute({
    channel,
    externalSenderId: senderId,
    text,
    tenantId: "demo",
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

// ---------------------------------------------------------------------------
// S1: Complete mediation — understand → confirm → resolved
// ---------------------------------------------------------------------------

test("S1: Complete mediation flow — understand → confirm → resolved", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.ok(step1.flowState !== undefined, "Step 1 should have flow state");
  assert.equal(step1.flowState.status, "confirming");
  assert.equal(step1.flowState.pendingAction, "confirm_mediation");
  assert.ok(step1.promptText?.includes("Confirmás"));

  const step2 = await doStep(pipeline, "sí", step1.conversation?.id);
  assert.ok(step2.flowState !== undefined, "Step 2 should have flow state");
  assert.equal(step2.flowState.status, "resolved");
  assert.equal(step2.flowState.pendingAction, null);
  assert.ok(step2.promptText?.includes("No se envió") || step2.promptText?.includes("Todavía no se envía"));
});

// ---------------------------------------------------------------------------
// S2: Mediation with cancellation
// ---------------------------------------------------------------------------

test("S2: Mediation flow — understand → cancel", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(step1.flowState?.status, "confirming");

  const step2 = await doStep(pipeline, "mejor no", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "resolved");
  assert.ok(step2.promptText?.includes("no se enviará"));
});

// ---------------------------------------------------------------------------
// S3: Mediation with clarification then confirmation (canned override)
// ---------------------------------------------------------------------------

test("S3: Mediation flow — canned override → clarify → confirm", async () => {
  // Canned response overrides rule extraction to simulate missing fields
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true,
      riskSignal: false,
    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién y qué?", reason: "Faltan datos",
      recipientHint: "Carlos", messageDraft: "Llego tarde",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);

  const step1 = await doStep(pipeline, "avisale");
  assert.ok(step1.flowState !== undefined);
  assert.equal(step1.flowState.status, "clarifying");

  const step2 = await doStep(pipeline, "a Carlos que llego tarde", step1.conversation?.id);
  assert.ok(step2.flowState !== undefined);
  assert.equal(step2.flowState.status, "confirming");
  assert.equal(step2.flowState.pendingAction, "confirm_mediation");
});

// ---------------------------------------------------------------------------
// S4: Mediation with edit then confirmation
// ---------------------------------------------------------------------------

test("S4: Mediation flow — understand → edit → confirm", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(step1.flowState?.status, "confirming");

  const step2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "confirming");
  assert.equal(step2.flowState?.pendingAction, "confirm_mediation");
  assert.equal(step2.flowState?.draftMessageDraft, "voy mañana");
  assert.ok(step2.promptText?.includes("Mensaje actualizado"));

  const step3 = await doStep(pipeline, "dale", step1.conversation?.id);
  assert.equal(step3.flowState?.status, "resolved");
});

// ---------------------------------------------------------------------------
// S5: Risk signal during confirming flow → paused
// ---------------------------------------------------------------------------

test("S5: Risk signal during confirming flow → paused", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(step1.flowState?.status, "confirming");

  const step2 = await doStep(pipeline, "me caí y no puedo levantarme", step1.conversation?.id);
  assert.ok(step2.flowState !== undefined);
  assert.equal(step2.flowState.status, "paused");
  assert.equal(step2.flowState.pendingAction, null);
  assert.ok(step2.warnings.some((w) => w.includes("paused") || w.includes("riesgo")));
});

test("S5b: Risk signal during clarifying flow → paused", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos");
  assert.equal(step1.flowState?.status, "clarifying");
  assert.equal(step1.flowState?.pendingAction, "clarify_message");

  const step2 = await doStep(pipeline, "me caí y no puedo levantarme", step1.conversation?.id);
  assert.ok(step2.flowState !== undefined);
  assert.equal(step2.flowState.status, "paused");
  assert.equal(step2.flowState.pendingAction, null);
  assert.ok(step2.warnings.some((w) => w.includes("paused") || w.includes("riesgo")));
});

test("S5c: Incomplete mediation with recipient only asks for message", async () => {
  const pipeline = await freshPipeline();

  const result = await doStep(pipeline, "avisale a Carlos");
  assert.equal(result.flowState?.status, "clarifying");
  assert.equal(result.flowState?.pendingAction, "clarify_message");
  assert.ok(result.flowState?.missingFields.includes("message"));
  assert.equal(result.flowState?.draftRecipientHint, "Carlos");
  assert.equal(result.flowState?.draftMessageDraft, null);
});

// ---------------------------------------------------------------------------
// S6: Ambiguous input during confirmation → re-prompt
// ---------------------------------------------------------------------------

test("S6: Ambiguous input during confirmation → re-prompt", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(step1.flowState?.status, "confirming");

  const step2 = await doStep(pipeline, "bueno", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "confirming");
  assert.ok(step2.promptText?.includes("Confirmás"));
});

// ---------------------------------------------------------------------------
// S7: Normal conversation (no mediation) — unchanged behavior
// ---------------------------------------------------------------------------

test("S7: Normal conversation — no flow state, normal AI response", async () => {
  const pipeline = await freshPipeline();

  const result = await doStep(pipeline, "hola como estas");
  assert.equal(result.flowState, undefined);
  assert.ok(result.guideResult !== undefined);
  assert.equal(result.guideResult.status, "success");
});

// ---------------------------------------------------------------------------
// S8: Clarification loop with canned override
// ---------------------------------------------------------------------------

test("S8: Clarification loop — canned override for both fields missing", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true,
      riskSignal: false,
    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿Qué querés decirle?", reason: "Falta el mensaje.",
      recipientHint: "Carlos", messageDraft: null,
      missingFields: ["message"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);

  const step1 = await doStep(pipeline, "avisale");
  assert.ok(step1.flowState !== undefined);
  assert.equal(step1.flowState.status, "clarifying");
  assert.ok(step1.flowState.missingFields.includes("recipient"));
  assert.ok(step1.flowState.missingFields.includes("message"));

  const step2 = await doStep(pipeline, "a Carlos", step1.conversation?.id);
  assert.ok(step2.flowState !== undefined);
  assert.ok(step2.flowState.status === "clarifying" || step2.flowState.status === "confirming");
});

// ---------------------------------------------------------------------------
// S9: Multiple consecutive mediations in same conversation
// ---------------------------------------------------------------------------

test("S9: Multiple consecutive mediations in same conversation", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(step1.flowState?.status, "confirming");

  const step2 = await doStep(pipeline, "sí", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "resolved");

  const step3 = await doStep(pipeline, "avisale a Carlos que no voy", step1.conversation?.id);
  assert.ok(step3.flowState !== undefined);
  assert.equal(step3.flowState.status, "confirming");
  assert.equal(step3.flowState.version, 1);
});

test("T33: unknown WhatsApp sender cannot create mediation flow", async () => {
  const pipeline = await freshPipeline();
  const result = await doStepFromSender(
    pipeline,
    "5498888888888",
    "whatsapp",
    "avisale a Carlos que llego tarde",
  );

  assert.ok(result.identity !== undefined);
  assert.equal(result.identity.status, "unknown");
  assert.equal(result.flowState, undefined);
});

test("T33: unknown voice sender cannot create mediation flow", async () => {
  const pipeline = await freshPipeline();
  const result = await doStepFromSender(
    pipeline,
    "unknown_device_001",
    "voice",
    "avisale a Carlos que llego tarde",
  );

  assert.ok(result.identity !== undefined);
  assert.equal(result.identity.status, "unknown");
  assert.equal(result.flowState, undefined);
});

test("T33: authorized elder voice device starts mediation flow", async () => {
  const pipeline = await freshPipeline();
  const result = await doStepFromSender(
    pipeline,
    "serena_device_001",
    "voice",
    "avisale a Carlos que llego tarde",
  );

  assert.ok(result.identity !== undefined);
  assert.equal(result.identity.status, "resolved");
  assert.equal(result.identity.personId, "marta");
  assert.equal(result.flowState?.status, "confirming");
});

test("T33: authorized elder voice device with risk message routes to risk_review", async () => {
  const pipeline = await freshPipeline();
  const result = await doStepFromSender(
    pipeline,
    "serena_device_001",
    "voice",
    "me caí y no puedo levantarme",
  );

  assert.ok(result.identity !== undefined);
  assert.equal(result.identity.status, "resolved");
  assert.equal(result.identity.role, "elder");
  assert.equal(result.profileId, "risk_review");
  assert.equal(result.useCaseId, "serena.risk.review");
  assert.equal(result.flowState, undefined);
});

test("T33: unknown web_chat sender cannot create mediation flow", async () => {
  const pipeline = await freshPipeline();
  const result = await doStepFromSender(
    pipeline,
    "unknown_device_001",
    "web_chat",
    "avisale a Carlos que llego tarde",
  );

  assert.ok(result.identity !== undefined);
  assert.equal(result.identity.status, "unknown");
  assert.equal(result.flowState, undefined);
});
