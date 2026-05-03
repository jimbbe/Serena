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

import { AiGuideService } from "../modules/ai-guide/application/use-cases/ai-guide-service.ts";
import { UseCaseRegistry } from "../modules/ai-guide/application/use-cases/use-case-registry.ts";
import { ExecutionPipeline } from "../modules/ai-guide/application/use-cases/execution-pipeline.ts";
import { defaultContracts } from "../modules/ai-guide/application/use-cases/contracts.ts";
import { MockLlmProvider } from "../modules/ai-guide/infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../modules/ai-guide/infrastructure/memory/in-memory-ai-invocation-audit.ts";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createInMemoryPipeline(): Promise<{
  orchestrator: ProcessIncomingWhatsAppMessage;
  bridgeStore: InMemoryMediationBridgeSessionStore;
  processedMessageStore: ProcessedMessageStore;
  aiGuideService: AiGuideService;
  processInboundMessage: ProcessInboundMessage;
}> {
  const contacts = await loadContactsFromSeed();

  // Contact directory (full module with seed data)
  const contactDirectory = new InMemoryContactDirectory(contacts);
  const resolveContact = new ResolveContact({ contactDirectory });

  // Inbound gate
  const inboundGateContactDir = new InboundGateContactDirectory(
    contacts.map((c) => c.whatsappId),
  );
  const decisionAudit = new InMemoryDecisionAudit();
  const evaluator = new EvaluateInboundMessage({
    contactDirectory: inboundGateContactDir,
    decisionAudit,
  });
  const processInboundMessage = new ProcessInboundMessage({ evaluator });

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

  // AI Guide — in-memory wiring with deterministic mock provider
  const aiRegistry = new UseCaseRegistry();
  for (const contract of defaultContracts) {
    aiRegistry.register(contract);
  }
  const llmProvider = new MockLlmProvider();
  const aiAudit = new InMemoryAiInvocationAudit();
  const executionPipeline = new ExecutionPipeline({ provider: llmProvider, audit: aiAudit });
  const aiGuideService = new AiGuideService({ registry: aiRegistry, pipeline: executionPipeline });

  return { orchestrator, bridgeStore, processedMessageStore, aiGuideService, processInboundMessage };
}
