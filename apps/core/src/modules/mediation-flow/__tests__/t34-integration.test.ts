import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryPipeline } from "../../../bootstrap/create-in-memory-pipeline.ts";
import { MockLlmProvider } from "../../ai-guide/infrastructure/memory/mock-llm-provider.ts";
import type { PromptId } from "../../ai-guide/domain/prompt-id.ts";
import { InMemoryContactDirectory } from "../../contact-directory/infrastructure/memory/in-memory-contact-directory.ts";
import { ProcessChannelInboundMessage } from "../../channel-inbound/application/use-cases/process-channel-inbound-message.ts";
import { CreateOutboundDraftFromMediation, InMemoryOutboundDraftStore, resolveOutboundRecipient } from "../../outbound-draft/index.ts";
import type { OutboundDraft } from "../../outbound-draft/domain/outbound-draft.ts";
import type { OutboundDraftStore } from "../../outbound-draft/port/outbound-draft-store.ts";

const ELDER_WHATSAPP = "+5492600000000";

async function freshPipeline(canned?: Map<PromptId, { content: string; tokensUsed?: number }>) {
  const llmProvider = new MockLlmProvider(canned);
  return createInMemoryPipeline({ llmProvider, providerName: "mock", configuredModel: "mock-v1" });
}

async function doStep(
  pipeline: Awaited<ReturnType<typeof freshPipeline>>,
  text: string,
  conversationId?: string,
) {
  return pipeline.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text,
    tenantId: "demo",
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

async function doVoiceStep(
  pipeline: Awaited<ReturnType<typeof freshPipeline>>,
  text: string,
  conversationId?: string,
) {
  return pipeline.processChannelInboundMessage.execute({
    channel: "voice",
    externalSenderId: "serena_device_001",
    text,
    tenantId: "demo",
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

test("S1: confirm with known recipient creates prepared outbound ready for delivery", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const step2 = await doStep(pipeline, "sí", step1.conversation?.id);

  assert.equal(step2.flowState?.status, "resolved");
  assert.equal(step2.preparedOutbound?.status, "delivered");
  assert.equal(step2.preparedOutbound?.deliveryReady, false);
  assert.equal(step2.preparedOutbound?.recipientDisplayName, "Carlos");

  const stored = await pipeline.outboundDraftStore.findByConversationId(step1.conversation!.id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.status, "delivered");
});

test("S2: confirm with unknown recipient creates unresolved prepared outbound", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Persona Fantasma que llego tarde");
  const step2 = await doStep(pipeline, "sí", step1.conversation?.id);

  assert.equal(step2.preparedOutbound?.status, "needs_recipient_resolution");
  assert.equal(step2.preparedOutbound?.deliveryReady, false);
  assert.equal(step2.preparedOutbound?.recipientPersonId, null);
});

test("S3: confirm with ambiguous recipient creates disambiguation draft", async () => {
  const base = await freshPipeline();
  const ambiguousDirectory = new InMemoryContactDirectory([
    { id: "c1", displayName: "Carlos", whatsappId: "111" },
    { id: "c2", displayName: "Carlos", whatsappId: "222" },
  ]);
  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: base.processInboundMessage,
    aiGuideService: base.aiGuideService,
    identityResolver: base.identityResolver,
    conversationStore: base.conversationStore,
    contactDirectory: ambiguousDirectory,
    mediationFlowStore: base.mediationFlowStore,
    resolveOutboundRecipient,
    outboundDraftStore: new InMemoryOutboundDraftStore(),
    createOutboundDraft: new CreateOutboundDraftFromMediation(),
  });

  const step1 = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "avisale a Carlos que llego tarde",
    tenantId: "demo",
  });
  const step2 = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "sí",
    tenantId: "demo",
    ...(step1.conversation?.id !== undefined ? { conversationId: step1.conversation.id } : {}),
  });

  assert.equal(step2.preparedOutbound?.status, "needs_recipient_disambiguation");
  assert.equal(step2.preparedOutbound?.deliveryReady, false);
});

test("S4: cancel does not create outbound draft", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const step2 = await doStep(pipeline, "mejor no", step1.conversation?.id);

  assert.equal(step2.preparedOutbound, undefined);
  assert.equal((await pipeline.outboundDraftStore.findByConversationId(step1.conversation!.id)).length, 0);
});

test("S5: edit then confirm uses updated message", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const step2 = await doStep(pipeline, "cambiá el mensaje, decile que voy mañana", step1.conversation?.id);
  const step3 = await doStep(pipeline, "sí, confirmo", step1.conversation?.id);

  assert.equal(step2.preparedOutbound, undefined);
  assert.equal(step3.preparedOutbound?.messageText, "voy mañana");
});

test("S6: risk interrupt does not create outbound draft", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doStep(pipeline, "avisale a Carlos que llego tarde");
  const step2 = await doStep(pipeline, "me caí y no puedo levantarme", step1.conversation?.id);

  assert.equal(step2.flowState?.status, "paused");
  assert.equal(step2.preparedOutbound, undefined);
});

test("S7: unknown sender never creates confirming flow or outbound draft", async () => {
  const pipeline = await freshPipeline();
  const result = await pipeline.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: "5498888888888",
    text: "avisale a Carlos que llego tarde",
    tenantId: "demo",
  });

  assert.equal(result.identity?.status, "unknown");
  assert.equal(result.flowState, undefined);
  assert.equal(result.preparedOutbound, undefined);
});

test("S8: empty messageText adds warning and skips outbound draft", async () => {
  const base = await freshPipeline();
  const conversation = await base.conversationStore.findOrCreateConversation({
    tenantId: "demo",
    personId: "marta",
  });
  const flowState = {
    conversationId: conversation.id,
    personId: "marta",
    status: "confirming",
    draft: {
      id: "draft-empty-message",
      conversationId: conversation.id,
      requesterPersonId: "marta",
      recipientHint: "Carlos",
      messageDraft: "   ",
      sourceMessageId: "msg-1",
      sourceText: "avisale a Carlos",
      version: 1,
      status: "draft",
    },
    pendingAction: "confirm_mediation",
    missingFields: ["confirmation"],
    lastQuestion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  await base.mediationFlowStore.startFlow(flowState);
  const result = await base.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "sí",
    tenantId: "demo",
    conversationId: conversation.id,
  });

  assert.equal(result.preparedOutbound, undefined);
  assert.ok(result.warnings.some((warning) => warning.includes("messageDraft is empty")));
});

test("S9: empty recipientHint adds warning and skips outbound draft", async () => {
  const base = await freshPipeline();
  const conversation = await base.conversationStore.findOrCreateConversation({
    tenantId: "demo",
    personId: "marta",
  });
  const flowState = {
    conversationId: conversation.id,
    personId: "marta",
    status: "confirming",
    draft: {
      id: "draft-empty-recipient",
      conversationId: conversation.id,
      requesterPersonId: "marta",
      recipientHint: "   ",
      messageDraft: "que llego tarde",
      sourceMessageId: "msg-1",
      sourceText: "avisale",
      version: 1,
      status: "draft",
    },
    pendingAction: "confirm_mediation",
    missingFields: ["confirmation"],
    lastQuestion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  await base.mediationFlowStore.startFlow(flowState);
  const result = await base.processChannelInboundMessage.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "sí",
    tenantId: "demo",
    conversationId: conversation.id,
  });

  assert.equal(result.preparedOutbound, undefined);
  assert.ok(result.warnings.some((warning) => warning.includes("recipientHint is empty")));
});

test("S10: voice confirmation creates outbound draft with voice requester channel", async () => {
  const pipeline = await freshPipeline();

  const step1 = await doVoiceStep(pipeline, "avisale a Carlos que llego tarde");
  const step2 = await doVoiceStep(pipeline, "sí", step1.conversation?.id);

  assert.equal(step2.channel, "voice");
  assert.equal(step2.preparedOutbound?.status, "delivered");

  const stored = await pipeline.outboundDraftStore.findByConversationId(step1.conversation!.id);
  assert.equal(stored[0]?.requesterChannel, "voice");
});

class FailingOutboundDraftStore implements OutboundDraftStore {
  async create(_draft: OutboundDraft): Promise<OutboundDraft> {
    throw new Error("store unavailable");
  }
  async findById(_id: string): Promise<OutboundDraft | undefined> {
    return undefined;
  }
  async findByConversationId(_conversationId: string): Promise<OutboundDraft[]> {
    return [];
  }
  async findPendingDelivery(): Promise<OutboundDraft[]> {
    return [];
  }
  async markDeliveryRequested(_id: string, _at: Date): Promise<OutboundDraft> {
    throw new Error("store unavailable");
  }
  async markDelivered(_id: string, _at: Date): Promise<OutboundDraft> {
    throw new Error("store unavailable");
  }
  async markFailed(_id: string, _reason: string, _at: Date): Promise<OutboundDraft> {
    throw new Error("store unavailable");
  }
  async cancel(_id: string, _at: Date): Promise<OutboundDraft> {
    throw new Error("store unavailable");
  }
}

test("E4: OutboundDraftStore.create failure does not crash pipeline and adds warning", async () => {
  const base = await freshPipeline();
  const failingStore = new FailingOutboundDraftStore();
  const useCase = new ProcessChannelInboundMessage({
    processInboundMessage: base.processInboundMessage,
    aiGuideService: base.aiGuideService,
    identityResolver: base.identityResolver,
    conversationStore: base.conversationStore,
    contactDirectory: base.contactDirectory,
    mediationFlowStore: base.mediationFlowStore,
    resolveOutboundRecipient,
    outboundDraftStore: failingStore,
    createOutboundDraft: new CreateOutboundDraftFromMediation(),
  });

  const step1 = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "avisale a Carlos que llego tarde",
    tenantId: "demo",
  });
  const step2 = await useCase.execute({
    channel: "whatsapp",
    externalSenderId: ELDER_WHATSAPP,
    text: "sí",
    tenantId: "demo",
    ...(step1.conversation?.id !== undefined ? { conversationId: step1.conversation.id } : {}),
  });

  assert.equal(step2.flowState?.status, "resolved");
  assert.equal(step2.preparedOutbound, undefined);
  assert.ok(
    step2.warnings.some((w) => w.toLowerCase().includes("outbound") || w.toLowerCase().includes("draft")),
    `Expected warning about outbound draft failure, got: ${JSON.stringify(step2.warnings)}`,
  );
  assert.ok(step2.promptText?.includes("no se envió") || step2.promptText?.includes("preparado") || step2.promptText?.includes("confirmado"),
    `Expected prompt to clarify no real send, got: ${step2.promptText}`,
  );
});
