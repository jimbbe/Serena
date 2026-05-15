/**
 * T32 — Simulation acceptance tests for the mediation flow state machine.
 *
 * 100 tests across 10 categories (10 tests each), verifying the complete
 * mediation clarification + confirmation flow under diverse inputs.
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
 * Categories:
 *   C1:  Mediation Detection — patterns recognized by rule-based system
 *   C2:  Clarification Loop — canned overrides for missing fields
 *   C3:  Confirmation Handling — yes/no variants, embedded keywords
 *   C4:  Cancellation — cancel variants, behavior after cancel
 *   C5:  Edit Flow — edit variants, version tracking
 *   C6:  Risk Interruption — risk signals during different flow states
 *   C7:  State Persistence — flow state across steps, conversation isolation
 *   C8:  Edge Cases — empty input, special chars, long text
 *   C9:  Normal Conversation — non-mediation paths unchanged
 *   C10: Multi-Step Scenarios — complex flows, recovery paths
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
const JUAN_WHATSAPP = "5493333333333";

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
  sender?: string,
) {
  return pipeline.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: sender ?? MARIA_WHATSAPP,
    text,
    tenantId: "demo",
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

/** Override canned response on existing pipeline's LLM provider. */
function overrideCanned(
  pipeline: Awaited<ReturnType<typeof freshPipeline>>,
  promptId: PromptId,
  content: Record<string, unknown>,
): void {
  const provider = (pipeline as any).aiGuideService?.pipeline?.provider;
  if (provider?.["cannedResponses"]) {
    provider["cannedResponses"].set(promptId, {
      content: JSON.stringify(content),
      tokensUsed: 15,
    });
  }
}

// ---------------------------------------------------------------------------
// C1: Mediation Detection (10 tests)
// ---------------------------------------------------------------------------
// Tests patterns recognized by RuleBasedMediationUnderstanding (spanish-mediation-patterns.ts)

test("C1.1: 'avisale a X que Y' → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos que llego tarde");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.2: 'decile a X que Y' → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "decile a Juan que no voy");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.3: 'escribile a X' → asks what message to send", async () => {
  const result = await doStep(await freshPipeline(), "escribile a Pedro");
  assert.equal(result.flowState?.status, "clarifying");
  assert.equal(result.flowState?.pendingAction, "clarify_message");
  assert.ok(result.flowState?.missingFields.includes("message"));
  assert.equal(result.flowState?.draftRecipientHint, "Pedro");
  assert.equal(result.flowState?.draftMessageDraft, null);
});

test("C1.4: 'llamale a X' → asks what message to send", async () => {
  const result = await doStep(await freshPipeline(), "llamale a Laura");
  assert.equal(result.flowState?.status, "clarifying");
  assert.equal(result.flowState?.pendingAction, "clarify_message");
  assert.ok(result.flowState?.missingFields.includes("message"));
  assert.equal(result.flowState?.draftRecipientHint, "Laura");
  assert.equal(result.flowState?.draftMessageDraft, null);
});

test("C1.5: 'avisa a X que Y' (short form) → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "avisa a Carlos que llego");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.6: Polite form 'por favor avisale' → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "por favor avisale a Carlos que llego tarde");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.7: Accent variant 'avísale' → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "avísale a Carlos que llego");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.8: Accent variant 'decíle' → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "decíle a María que viene");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.9: Extra whitespace → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "  avisale  a  Carlos  que  llego tarde  ");
  assert.equal(result.flowState?.status, "confirming");
});

test("C1.10: Emoji in message → starts confirming flow", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos que llega 🎉");
  assert.equal(result.flowState?.status, "confirming");
});

// ---------------------------------------------------------------------------
// C2: Clarification Loop (10 tests)
// ---------------------------------------------------------------------------
// Uses canned MockLlmProvider responses where useful, but source text remains
// authoritative for incomplete recipient/message fields.

test("C2.1: Standard mediation → goes to confirming (rules extract all fields)", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos que llego tarde");
  assert.equal(result.flowState?.status, "confirming");
});

test("C2.2: Mediation with only recipient (no 'que') → asks for message", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos");
  assert.equal(result.flowState?.status, "clarifying");
  assert.equal(result.flowState?.pendingAction, "clarify_message");
  assert.ok(result.flowState?.missingFields.includes("message"));
  assert.equal(result.flowState?.draftRecipientHint, "Carlos");
  assert.equal(result.flowState?.draftMessageDraft, null);
  assert.ok(result.promptText?.includes("Qué querés"));
});

test("C2.3: Canned override → clarifying state (both fields missing)", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true, riskSignal: false    }) }],
  ]);
  const result = await doStep(await freshPipeline(canned), "avisale");
  assert.equal(result.flowState?.status, "clarifying");
  assert.equal(result.flowState?.pendingAction, "clarify_both");
  assert.ok(result.flowState?.missingFields.includes("recipient"));
  assert.ok(result.flowState?.missingFields.includes("message"));
});

test("C2.4: Canned override → clarifying state (recipient missing)", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: "Llego tarde",
      missingFields: ["recipient"], requiresConfirmation: true, riskSignal: false    }) }],
  ]);
  const result = await doStep(await freshPipeline(canned), "decile que llego tarde");
  assert.equal(result.flowState?.status, "clarifying");
  assert.ok(result.flowState?.missingFields.includes("recipient"));
});

test("C2.5: Canned override → clarifying state (message missing)", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: "Carlos", messageDraft: null,
      missingFields: ["message"], requiresConfirmation: true, riskSignal: false    }) }],
  ]);
  const result = await doStep(await freshPipeline(canned), "avisale a Carlos");
  assert.equal(result.flowState?.status, "clarifying");
  assert.ok(result.flowState?.missingFields.includes("message"));
});

test("C2.6: Clarification → user provides info → transitions to confirming", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién y qué?", reason: "Faltan datos",
      recipientHint: "Carlos", messageDraft: "Llego tarde",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const step1 = await doStep(pipeline, "avisale");
  assert.equal(step1.flowState?.status, "clarifying");

  const step2 = await doStep(pipeline, "a Carlos que llego tarde", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "confirming");
});

test("C2.7: Clarification with missing recipient → user provides → confirming", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: "Llego tarde",
      missingFields: ["recipient"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién?", reason: "Falta destinatario",
      recipientHint: "Carlos", messageDraft: "Llego tarde",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const step1 = await doStep(pipeline, "decile que llego tarde");
  assert.equal(step1.flowState?.status, "clarifying");

  const step2 = await doStep(pipeline, "a Carlos", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "confirming");
});

test("C2.8: Clarification with missing message → user provides → confirming", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: "Carlos", messageDraft: null,
      missingFields: ["message"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿Qué decimos?", reason: "Falta mensaje",
      recipientHint: "Carlos", messageDraft: "Llego tarde",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const step1 = await doStep(pipeline, "avisale a Carlos");
  assert.equal(step1.flowState?.status, "clarifying");

  const step2 = await doStep(pipeline, "que llego tarde", step1.conversation?.id);
  assert.equal(step2.flowState?.status, "confirming");
});

test("C2.9: Clarification version increments", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: "Hola",
      missingFields: ["recipient"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién?", reason: "Falta destinatario",
      recipientHint: "Carlos", messageDraft: "Hola",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const step1 = await doStep(pipeline, "decile que hola");
  assert.equal(step1.flowState?.version, 1);

  const step2 = await doStep(pipeline, "a Carlos", step1.conversation?.id);
  assert.ok(step2.flowState!.version > step1.flowState!.version);
});

test("C2.10: Clarification prompt text is present", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true, riskSignal: false    }) }],
  ]);
  const result = await doStep(await freshPipeline(canned), "avisale");
  assert.equal(result.flowState?.status, "clarifying");
  assert.ok(result.promptText !== undefined);
});

// ---------------------------------------------------------------------------
// C3: Confirmation Handling (10 tests)
// ---------------------------------------------------------------------------

test("C3.1: 'sí' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "sí", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.2: 'si' (without accent) confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "si", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.3: 'dale' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "dale", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.4: 'ok' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "ok", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.5: 'mandalo' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "mandalo", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.6: 'envialo' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "envialo", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.7: 'confirmo' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "confirmo", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.8: Uppercase 'DALE' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "DALE", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.9: Embedded 'sí, mandalo' confirms mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "sí, mandalo", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C3.10: Confirmation prompt text includes 'Confirmás'", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos que llego tarde");
  assert.ok(result.promptText?.includes("Confirmás"));
});

// ---------------------------------------------------------------------------
// C4: Cancellation (10 tests)
// ---------------------------------------------------------------------------

test("C4.1: 'no' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
  assert.ok(result.promptText?.includes("no se enviará"));
});

test("C4.2: 'mejor no' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "mejor no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.3: 'cancelar' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "cancelar", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.4: 'cancela' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "cancela", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.5: 'espera' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "espera", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.6: Uppercase 'NO' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "NO", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.7: 'No quiero' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "No quiero", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.8: 'mejor no mandes' cancels mediation", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "mejor no mandes", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C4.9: Cancelled flow has null pendingAction", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
  assert.equal(result.flowState?.pendingAction, null);
});

test("C4.10: After cancellation, new mediation starts fresh flow", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "no", s1.conversation?.id);
  const result = await doStep(pipeline, "avisale a Carlos que no voy", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
  assert.equal(result.flowState?.version, 1);
});

// ---------------------------------------------------------------------------
// C5: Edit Flow (10 tests)
// ---------------------------------------------------------------------------

test("C5.1: 'cambiá' triggers edit", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "cambiá", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
  assert.equal(result.flowState?.pendingAction, "confirm_mediation");
});

test("C5.2: 'edita' triggers edit", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "edita", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C5.3: 'corregi' triggers edit", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "corregi", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C5.4: 'cambi' (stem) triggers edit", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "cambi", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C5.5: 'Cambiá el mensaje' triggers edit", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "Cambiá el mensaje", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C5.6: Edit with replacement content increments draft version", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const v1 = s1.flowState?.version ?? 0;
  const s2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", s1.conversation?.id);
  assert.ok(s2.flowState!.version > v1);
});

test("C5.7: Edit without replacement asks for new content", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "cambiá", s1.conversation?.id);
  assert.equal(result.flowState?.draftMessageDraft, s1.flowState?.draftMessageDraft);
  assert.equal(result.flowState?.version, s1.flowState?.version);
  assert.ok(result.promptText?.includes("Qué cambio"));
});

test("C5.7b: 'cambiá el mensaje, decile que voy mañana' updates draftMessageDraft", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(s1.flowState?.draftMessageDraft, "llego tarde");
  const s2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", s1.conversation?.id);
  assert.equal(s2.flowState?.draftMessageDraft, "voy mañana");
  assert.equal(s2.flowState?.version, 2);
});

test("C5.7c: 'mejor decile que no voy' updates draftMessageDraft", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(s1.flowState?.draftMessageDraft, "llego tarde");
  const s2 = await doStep(pipeline, "mejor decile que no voy", s1.conversation?.id);
  assert.equal(s2.flowState?.draftMessageDraft, "no voy");
});

test("C5.7d: 'editá: voy a llegar tarde' updates draftMessageDraft", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const s2 = await doStep(pipeline, "editá: voy a llegar tarde", s1.conversation?.id);
  assert.equal(s2.flowState?.draftMessageDraft, "voy a llegar tarde");
});

test("C5.8: After edit, flow stays in confirming state", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "editá el texto", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
  assert.equal(result.flowState?.pendingAction, "confirm_mediation");
});

test("C5.9: After edit, user can confirm", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "cambiá", s1.conversation?.id);
  const result = await doStep(pipeline, "dale", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C5.10: After edit, user can cancel", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "cambiá", s1.conversation?.id);
  const result = await doStep(pipeline, "mejor no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

// ---------------------------------------------------------------------------
// C6: Risk Interruption (10 tests)
// ---------------------------------------------------------------------------

test("C6.1: Risk signal during confirming flow → pauses flow", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí y no puedo levantarme", s1.conversation?.id);
  assert.equal(result.flowState?.status, "paused");
});

test("C6.1b: Risk signal during clarifying flow → pauses flow", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos");
  assert.equal(s1.flowState?.status, "clarifying");
  const result = await doStep(pipeline, "me caí y no puedo levantarme", s1.conversation?.id);
  assert.equal(result.flowState?.status, "paused");
  assert.equal(result.flowState?.pendingAction, null);
  assert.ok(result.warnings.some(w => w.toLowerCase().includes("riesgo") || w.toLowerCase().includes("paused")));
});

test("C6.2: Paused flow has null pendingAction", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.equal(result.flowState?.pendingAction, null);
});

test("C6.3: Paused flow includes warning about risk", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.ok(result.warnings.some(w => w.toLowerCase().includes("paused") || w.toLowerCase().includes("paus") || w.toLowerCase().includes("riesgo")));
});

test("C6.4: Risk signal 'me caí' triggers pause", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.equal(result.flowState?.status, "paused");
});

test("C6.5: Risk signal 'urgente' with context → flow state present", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "urgente necesito ayuda", s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C6.6: Risk signal 'ayuda' → flow state present", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "necesito ayuda urgente", s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C6.7: Paused flow preserves draft data", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.ok(result.flowState?.draftRecipientHint !== undefined || result.flowState?.draftMessageDraft !== undefined);
});

test("C6.8: Risk signal with 'dolor' → flow state present", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "tengo mucho dolor", s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C6.9: Risk signal with 'emergencia' → flow state present", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "es una emergencia", s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C6.10: Non-risk message during confirming flow → normal confirmation handling", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "hola", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

// ---------------------------------------------------------------------------
// C7: State Persistence (10 tests)
// ---------------------------------------------------------------------------

test("C7.1: Flow state persists between steps in same pipeline", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.ok(s1.flowState !== undefined);
  const s2 = await doStep(pipeline, "sí", s1.conversation?.id);
  assert.ok(s2.flowState !== undefined);
  assert.equal(s2.flowState.status, "resolved");
});

test("C7.2: Draft recipient persists across steps", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const r1 = s1.flowState?.draftRecipientHint;
  const s2 = await doStep(pipeline, "cambiá", s1.conversation?.id);
  assert.equal(s2.flowState?.draftRecipientHint, r1);
});

test("C7.3: Draft message persists across steps", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const m1 = s1.flowState?.draftMessageDraft;
  const s2 = await doStep(pipeline, "cambiá", s1.conversation?.id);
  assert.equal(s2.flowState?.draftMessageDraft, m1);
});

test("C7.4: Flow state cleared after resolution", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "sí", s1.conversation?.id);
  const result = await doStep(pipeline, "avisale a Carlos que no voy", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
  assert.equal(result.flowState?.version, 1);
});

test("C7.5: Different senders have isolated flow states", async () => {
  const pipeline = await freshPipeline();
  await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "hola", undefined, JUAN_WHATSAPP);
  assert.equal(result.flowState, undefined);
});

test("C7.6: Flow version increments on content update", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const v1 = s1.flowState?.version ?? 0;
  const s2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", s1.conversation?.id);
  assert.ok(s2.flowState!.version > v1);
});

test("C7.7: Flow status transitions: clarifying → confirming (canned override)", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: "Hola",
      missingFields: ["recipient"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién?", reason: "Falta destinatario",
      recipientHint: "Carlos", messageDraft: "Hola",
      missingFields: ["confirmation"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const s1 = await doStep(pipeline, "decile que hola");
  assert.equal(s1.flowState?.status, "clarifying");
  const s2 = await doStep(pipeline, "a Carlos", s1.conversation?.id);
  assert.equal(s2.flowState?.status, "confirming");
});

test("C7.8: Flow status transitions: confirming → resolved (confirm)", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "sí", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C7.9: Flow status transitions: confirming → resolved (cancel)", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C7.10: Flow status transitions: confirming → paused (risk)", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.equal(result.flowState?.status, "paused");
});

// ---------------------------------------------------------------------------
// C8: Edge Cases (10 tests)
// ---------------------------------------------------------------------------

test("C8.1: Empty input during confirming → re-prompt", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C8.2: Whitespace-only input during confirming → re-prompt", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "   ", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C8.3: Very long input during confirming → handled gracefully", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "a".repeat(500), s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C8.4: Special characters in input → handled gracefully", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "sí! 🎉", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C8.5: Numbers-only input during confirming → re-prompt", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "123", s1.conversation?.id);
  assert.equal(result.flowState?.status, "confirming");
});

test("C8.6: Mixed language input during confirming → handled gracefully", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "yes ok", s1.conversation?.id);
  assert.ok(result.flowState !== undefined);
});

test("C8.7: Input with newlines during confirming → handled gracefully", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "sí\npor favor", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C8.8: Input with tabs during confirming → handled gracefully", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const result = await doStep(pipeline, "\tsí\t", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C8.9: Unicode characters in mediation request → handled gracefully", async () => {
  const result = await doStep(await freshPipeline(), "avisale a Carlos que llego tarde 🚗");
  assert.equal(result.flowState?.status, "confirming");
});

test("C8.10: Repeated same input during confirming → consistent behavior", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const r1 = await doStep(pipeline, "bueno", s1.conversation?.id);
  const r2 = await doStep(pipeline, "bueno", s1.conversation?.id);
  assert.equal(r1.flowState?.status, r2.flowState?.status);
});

// ---------------------------------------------------------------------------
// C9: Normal Conversation (10 tests)
// ---------------------------------------------------------------------------

test("C9.1: Greeting → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "hola");
  assert.equal(result.flowState, undefined);
});

test("C9.2: Question → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "qué hora es?");
  assert.equal(result.flowState, undefined);
});

test("C9.3: Statement → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "hoy hace frío");
  assert.equal(result.flowState, undefined);
});

test("C9.4: Thank you → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "gracias");
  assert.equal(result.flowState, undefined);
});

test("C9.5: Goodbye → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "chau");
  assert.equal(result.flowState, undefined);
});

test("C9.6: Emoji only → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "👋");
  assert.equal(result.flowState, undefined);
});

test("C9.7: Long conversation text → no flow state", async () => {
  const result = await doStep(await freshPipeline(), "hoy fui al supermercado y compré muchas cosas, después fui a la farmacia y luego volví a casa");
  assert.equal(result.flowState, undefined);
});

test("C9.8: Conversation after resolved flow → no flow state", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "sí", s1.conversation?.id);
  const result = await doStep(pipeline, "gracias por todo", s1.conversation?.id);
  assert.equal(result.flowState, undefined);
});

test("C9.9: Conversation after cancelled flow → no flow state", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "no", s1.conversation?.id);
  const result = await doStep(pipeline, "buen día", s1.conversation?.id);
  assert.equal(result.flowState, undefined);
});

test("C9.10: Normal conversation returns AI guide result", async () => {
  const result = await doStep(await freshPipeline(), "hola como estas");
  assert.ok(result.guideResult !== undefined);
  assert.equal(result.guideResult.status, "success");
});

test("C9.11: First-person self-action 'yo voy a llamar a Carlos' → conversation", async () => {
  const result = await doStep(await freshPipeline(), "yo voy a llamar a Carlos");
  assert.equal(result.flowState, undefined);
  assert.equal(result.profileId, "conversation");
});

test("C9.12: First-person self-action 'después voy a llamar a Carlos yo' → conversation", async () => {
  const result = await doStep(await freshPipeline(), "después voy a llamar a Carlos yo");
  assert.equal(result.flowState, undefined);
  assert.equal(result.profileId, "conversation");
});

// ---------------------------------------------------------------------------
// C10: Multi-Step Scenarios (10 tests)
// ---------------------------------------------------------------------------

test("C10.1: Full happy path — understand → confirm → resolved", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  assert.equal(s1.flowState?.status, "confirming");
  const s2 = await doStep(pipeline, "sí", s1.conversation?.id);
  assert.equal(s2.flowState?.status, "resolved");
  assert.ok(s2.promptText?.includes("ya fue entregado"));
});

test("C10.2: Understand → edit → confirm → resolved", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "cambiá", s1.conversation?.id);
  const result = await doStep(pipeline, "dale", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C10.3: Understand → edit → cancel → resolved", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "cambiá", s1.conversation?.id);
  const result = await doStep(pipeline, "mejor no", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C10.4: Understand → ambiguous → confirm → resolved", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const r1 = await doStep(pipeline, "bueno", s1.conversation?.id);
  assert.equal(r1.flowState?.status, "confirming");
  const r2 = await doStep(pipeline, "sí", s1.conversation?.id);
  assert.equal(r2.flowState?.status, "resolved");
});

test("C10.5: Understand → risk → paused → new mediation → confirming", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const riskResult = await doStep(pipeline, "me caí", s1.conversation?.id);
  assert.equal(riskResult.flowState?.status, "paused");
  const newMediation = await doStep(pipeline, "avisale a Carlos que no voy", s1.conversation?.id);
  assert.equal(newMediation.flowState?.status, "confirming");
});

test("C10.6: Multiple edits in sequence → version keeps incrementing", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const v1 = s1.flowState?.version ?? 0;
  const s2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", s1.conversation?.id);
  const v2 = s2.flowState?.version ?? 0;
  assert.ok(v2 > v1);
  const s3 = await doStep(pipeline, "editá: no voy", s1.conversation?.id);
  const v3 = s3.flowState?.version ?? 0;
  assert.ok(v3 > v2);
});

test("C10.7: Clarification → partial info → more info → confirm", async () => {
  const canned = new Map<PromptId, { content: string }>([
    ["serena.mediation.understand_request.v1", { content: JSON.stringify({
      isMediationRequest: true, recipientHint: null, messageDraft: null,
      missingFields: ["recipient", "message"], requiresConfirmation: true, riskSignal: false    }) }],
    ["serena.mediation.clarify.v1", { content: JSON.stringify({
      question: "¿A quién y qué?", reason: "Faltan datos",
      recipientHint: "Carlos", messageDraft: null,
      missingFields: ["message"],
    }) }],
  ]);
  const pipeline = await freshPipeline(canned);
  const s1 = await doStep(pipeline, "avisale");
  assert.equal(s1.flowState?.status, "clarifying");
  const s2 = await doStep(pipeline, "a Carlos", s1.conversation?.id);
  assert.ok(s2.flowState !== undefined);
  overrideCanned(pipeline, "serena.mediation.clarify.v1", {
    question: "¿Qué decimos?", reason: "Falta mensaje",
    recipientHint: "Carlos", messageDraft: "Llego tarde",
    missingFields: ["confirmation"],
  });
  const s3 = await doStep(pipeline, "que llego tarde", s1.conversation?.id);
  assert.equal(s3.flowState?.status, "confirming");
});

test("C10.8: Confirm → new mediation → confirm → resolved (two full cycles)", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "sí", s1.conversation?.id);
  await doStep(pipeline, "avisale a Carlos que no voy", s1.conversation?.id);
  const result = await doStep(pipeline, "dale", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C10.9: Understand → cancel → new mediation → confirm", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "no", s1.conversation?.id);
  await doStep(pipeline, "avisale a Carlos que no voy", s1.conversation?.id);
  const result = await doStep(pipeline, "confirmo", s1.conversation?.id);
  assert.equal(result.flowState?.status, "resolved");
});

test("C10.10: Understand → edit → ambiguous → confirm", async () => {
  const pipeline = await freshPipeline();
  const s1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  await doStep(pipeline, "cambiá", s1.conversation?.id);
  const r1 = await doStep(pipeline, "bueno", s1.conversation?.id);
  assert.equal(r1.flowState?.status, "confirming");
  const r2 = await doStep(pipeline, "ok", s1.conversation?.id);
  assert.equal(r2.flowState?.status, "resolved");
});
