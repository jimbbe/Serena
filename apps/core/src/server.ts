import { createHttpServer } from "./bootstrap/server.ts";
import { loadAppEnv } from "./config/env.ts";
import { createInMemoryPipeline } from "./bootstrap/create-in-memory-pipeline.ts";
import { createLlmProvider } from "./modules/ai-guide/infrastructure/create-llm-provider.ts";
import { createPipelineHandler } from "./bootstrap/internal-pipeline-handler.ts";
import { createWhatsAppWebhookHandler } from "./bootstrap/whatsapp-webhook-handler.ts";
import { createSimulationHandler, createOutboundDeliveryHandler } from "./bootstrap/simulation-handler.ts";
import { createScenarioHandler } from "./bootstrap/scenario-handler.ts";
import { SimulationScenarioRunner } from "./bootstrap/scenario-runner.ts";
import { ProcessChannelInboundMessage } from "./modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts";
import { InMemoryMediationFlowStore } from "./modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts";
import { InMemoryOutboundDraftStore } from "./modules/outbound-draft/adapter/in-memory-outbound-draft-store.ts";
import { RequestOutboundDelivery } from "./modules/outbound-delivery/application/use-cases/request-outbound-delivery.ts";
import { FakeDeliveryPort, createDeliveryPort } from "./modules/outbound-delivery/index.ts";
import { resolveOutboundRecipient, CreateOutboundDraftFromMediation } from "./modules/outbound-draft/index.ts";

const env = loadAppEnv();

// Create the LLM provider based on environment config.
const llmProvider = createLlmProvider(env);
const runtimeDeliveryPort = createDeliveryPort(env);

// Create orchestrator with shared in-memory dependencies.
// Sessions survive across HTTP requests within the same process.
const {
  orchestrator,
  processedMessageStore,
  aiGuideService,
  processInboundMessage,
  identityResolver,
  conversationStore,
  contactDirectory,
  processChannelInboundMessage,
} = await createInMemoryPipeline({
  llmProvider,
  providerName: env.aiProvider,
  configuredModel: env.aiModel ?? "mock-model-v1",
  deliveryPort: runtimeDeliveryPort,
});
const pipelineHandler = createPipelineHandler(orchestrator, processedMessageStore);
const whatsappWebhookHandler = createWhatsAppWebhookHandler(processChannelInboundMessage);

// Conditionally wire simulation and scenario handlers (dev-only, disabled by default)
let simulationHandler: ReturnType<typeof createSimulationHandler> | undefined;
let outboundDeliveryHandler: ReturnType<typeof createOutboundDeliveryHandler> | undefined;
let scenarioHandler: ReturnType<typeof createScenarioHandler> | undefined;
if (env.enableSimulationEndpoints) {
    // T32 — In-memory mediation flow store shared across simulation requests
    const mediationFlowStore = new InMemoryMediationFlowStore();
    // T34 — Shared outbound draft store for simulation
    const outboundDraftStore = new InMemoryOutboundDraftStore();
    // T35 — Delivery port and use case for simulation
    const deliveryPort = new FakeDeliveryPort();
    const createOutboundDraft = new CreateOutboundDraftFromMediation();
    const requestOutboundDelivery = new RequestOutboundDelivery({
      outboundDraftStore,
      deliveryPort,
    });
    const processChannelInboundMessage = new ProcessChannelInboundMessage({
      processInboundMessage,
      aiGuideService,
      identityResolver,
      conversationStore,
      contactDirectory,
      mediationFlowStore,
      resolveOutboundRecipient,
      outboundDraftStore,
      createOutboundDraft,
    });
  simulationHandler = createSimulationHandler(processChannelInboundMessage);
  outboundDeliveryHandler = createOutboundDeliveryHandler(requestOutboundDelivery);

  const scenarioRunner = new SimulationScenarioRunner({
    processChannelInboundMessage,
  });
  scenarioHandler = createScenarioHandler(scenarioRunner);
}

const server = createHttpServer(
  env.environment,
  pipelineHandler,
  env.internalToken,
  simulationHandler,
  scenarioHandler,
  outboundDeliveryHandler,
  whatsappWebhookHandler,
);

server.listen(env.port, env.host, () => {
  console.log(`serena-core listening on http://${env.host}:${env.port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /internal/pipeline/process${env.internalToken ? "" : " (token NOT configured)"}`);
  console.log(`  POST /internal/webhook/whatsapp${env.internalToken ? "" : " (token NOT configured)"}`);
  if (env.enableSimulationEndpoints) {
    console.log(`  POST /dev/simulate/inbound-message (simulation enabled)`);
    console.log(`  POST /dev/simulate/outbound-delivery (delivery simulation enabled)`);
    console.log(`  POST /dev/simulate/scenario (scenario runner enabled)`);
  }
});
