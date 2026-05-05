/**
 * T16 — In-memory pipeline factory.
 *
 * Creates an orchestrator with bridge-backed in-memory dependencies
 * shared across the server process lifetime so sessions survive
 * between HTTP requests (María starts → Carlos replies → session found).
 *
 * No WhatsApp, no PostgreSQL, no Evolution API, no LLM.
 */

import { randomUUID } from "node:crypto";

import { ProcessIncomingWhatsAppMessage } from "../modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts";
import type { ProcessIncomingWhatsAppMessageDependencies } from "../modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts";

import { ProcessInboundMessage } from "../modules/inbound-gate/application/use-cases/process-inbound-message.ts";
import { EvaluateInboundMessage } from "../modules/inbound-gate/application/use-cases/evaluate-inbound-message.ts";
import { InMemoryContactDirectory as InboundGateContactDirectory } from "../modules/inbound-gate/infrastructure/memory/in-memory-contact-directory.ts";
import { InMemoryDecisionAudit } from "../modules/inbound-gate/infrastructure/memory/in-memory-decision-audit.ts";
import { InMemoryExternalIdentityResolver } from "../modules/inbound-gate/infrastructure/memory/in-memory-external-identity-resolver.ts";
import type { ResolvedInboundActor } from "../modules/inbound-gate/application/results/resolved-inbound-actor.ts";

import { ExtractMediationRequest } from "../modules/mediation-understanding/application/use-cases/extract-mediation-request.ts";
import { RuleBasedMediationUnderstanding } from "../modules/mediation-understanding/infrastructure/rules/rule-based-mediation-understanding.ts";

import { InMemoryContactDirectory, loadContactsFromSeed } from "../modules/contact-directory/infrastructure/memory/in-memory-contact-directory.ts";
import { ResolveContact } from "../modules/contact-directory/application/use-cases/resolve-contact.ts";

import { createResolveSession } from "../modules/session-manager/application/use-cases/resolve-session.ts";
import { MediationBridgeActiveSessionQuery } from "../modules/session-manager/infrastructure/memory/mediation-bridge-active-session-query.ts";

import { StartMediationBridgeSession } from "../modules/mediation-bridge/application/use-cases/start-mediation-bridge-session.ts";
import { RecordMediationBridgeReply } from "../modules/mediation-bridge/application/use-cases/record-mediation-bridge-reply.ts";
import { InMemoryMediationBridgeSessionStore } from "../modules/mediation-bridge/infrastructure/memory/in-memory-mediation-bridge-session-store.ts";

import { IndirectRewording } from "../modules/prudent-rewording/infrastructure/templates/indirect-rewording.ts";
import { RewordMessage } from "../modules/prudent-rewording/application/use-cases/reword-message.ts";

import { InMemoryProcessedMessageStore } from "../modules/internal-pipeline/infrastructure/memory/in-memory-processed-message-store.ts";
import type { ProcessedMessageStore } from "../modules/internal-pipeline/domain/processed-message-store.ts";

import { InMemoryConversationStore } from "../modules/conversation-store/adapter/in-memory-conversation-store.ts";

import { AiGuideService } from "../modules/ai-guide/application/use-cases/ai-guide-service.ts";
import { UseCaseRegistry } from "../modules/ai-guide/application/use-cases/use-case-registry.ts";
import type { LlmProvider } from "../modules/ai-guide/application/ports/llm-provider.ts";
import { ExecutionPipeline } from "../modules/ai-guide/application/use-cases/execution-pipeline.ts";
import { defaultContracts } from "../modules/ai-guide/application/use-cases/contracts.ts";
import { MockLlmProvider } from "../modules/ai-guide/infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts";
import { InMemoryPromptRegistry } from "../modules/ai-guide/application/prompts/in-memory-prompt-registry.ts";
import { ContextBuilder } from "../modules/ai-guide/application/prompts/context-builder.ts";
import { defaultPrompts } from "../modules/ai-guide/application/prompts/default-prompts.ts";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createInMemoryPipeline(options?: {
  llmProvider?: LlmProvider;
  providerName?: string;
  configuredModel?: string;
}): Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService;
  processInboundMessage: ProcessInboundMessage;
  identityResolver: InMemoryExternalIdentityResolver;
  conversationStore: InMemoryConversationStore;
  contactDirectory: InMemoryContactDirectory;
}> {
  const contacts = await loadContactsFromSeed();

  // Contact directory (full module with seed data)
  const contactDirectory = new InMemoryContactDirectory(contacts);
  const resolveContact = new ResolveContact({ contactDirectory });

  // Inbound gate
  const inboundGateAllowedIds = contacts.map((c) => c.whatsappId);
  // Allow resolved identity person IDs (elder and contacts from seed)
  inboundGateAllowedIds.push("elder_001");
  for (const contact of contacts) {
    inboundGateAllowedIds.push(contact.id);
  }
  const inboundGateContactDir = new InboundGateContactDirectory(inboundGateAllowedIds);
  const decisionAudit = new InMemoryDecisionAudit();
  const evaluator = new EvaluateInboundMessage({
    contactDirectory: inboundGateContactDir,
    decisionAudit,
  });
  const processInboundMessage = new ProcessInboundMessage({ evaluator });

  // External identity resolver — prime with contacts from seed as "contact" role
  const extraIdentities: Record<string, ResolvedInboundActor> = {};
  for (const contact of contacts) {
    const key = `demo:whatsapp:${contact.whatsappId}`;
    extraIdentities[key] = {
      status: "resolved",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: contact.whatsappId,
      personId: contact.id,
      actorId: contact.id,
      role: "contact",
      displayName: contact.displayName,
      authorized: true,
    };
  }
  const identityResolver = new InMemoryExternalIdentityResolver(extraIdentities);

  // Mediation understanding
  const mediationUnderstanding = new RuleBasedMediationUnderstanding();
  const extractMediationRequest = new ExtractMediationRequest({ mediationUnderstanding });

  // Bridge store — single source of truth for sessions
  const bridgeStore = new InMemoryMediationBridgeSessionStore();

  // Adapter that reads sessions from the bridge store (no manual .add())
  const bridgeQuery = new MediationBridgeActiveSessionQuery(bridgeStore);
  const resolveSession = createResolveSession({ activeSessionQuery: bridgeQuery });

  const startMediationBridgeSession = new StartMediationBridgeSession({
    sessionStore: bridgeStore,
    generateId: () => randomUUID(),
  });
  const recordMediationBridgeReply = new RecordMediationBridgeReply({
    sessionStore: bridgeStore,
    generateId: () => randomUUID(),
  });

  // Prudent rewording
  const prudentRewording = new IndirectRewording();
  const rewordMessage = new RewordMessage({ prudentRewording });

  const deps: ProcessIncomingWhatsAppMessageDependencies = {
    processInboundMessage,
    extractMediationRequest,
    contactDirectory,
    resolveContact,
    activeSessionQuery: bridgeQuery,
    resolveSession,
    startMediationBridgeSession,
    recordMediationBridgeReply,
    mediationBridgeSessionStore: bridgeStore,
    rewordMessage,
  };

  const orchestrator = new ProcessIncomingWhatsAppMessage(deps);

  // Idempotency store — shared across requests within the same process
  const processedMessageStore = new InMemoryProcessedMessageStore();

  // AI Guide — in-memory wiring with configurable LLM provider
  const aiRegistry = new UseCaseRegistry();
  for (const contract of defaultContracts) {
    aiRegistry.register(contract);
  }
  const llmProvider = options?.llmProvider ?? new MockLlmProvider();
  const providerName = options?.providerName ?? "mock";
  const configuredModel = options?.configuredModel ?? "mock-model-v1";
  const aiAudit = new InMemoryAiInvocationAudit();
  const promptRegistry = new InMemoryPromptRegistry(defaultPrompts);
  const contextBuilder = new ContextBuilder();
  const executionPipeline = new ExecutionPipeline({
    provider: llmProvider,
    audit: aiAudit,
    registry: promptRegistry,
    contextBuilder,
    providerName,
    configuredModel,
  });
  const aiGuideService = new AiGuideService({ registry: aiRegistry, pipeline: executionPipeline });

  // Conversation store — shared in-memory store for conversation tracking
  const conversationStore = new InMemoryConversationStore();

  return { orchestrator, bridgeStore, processedMessageStore, aiGuideService, processInboundMessage, identityResolver, conversationStore, contactDirectory };
}
