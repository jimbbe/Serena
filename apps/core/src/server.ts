import { createHttpServer } from "./bootstrap/server.ts";
import { loadAppEnv } from "./config/env.ts";
import { createInMemoryPipeline } from "./bootstrap/create-in-memory-pipeline.ts";
import { createLlmProvider } from "./modules/ai-guide/infrastructure/create-llm-provider.ts";
import { createPipelineHandler } from "./bootstrap/internal-pipeline-handler.ts";
import { createSimulationHandler } from "./bootstrap/simulation-handler.ts";
import { createScenarioHandler } from "./bootstrap/scenario-handler.ts";
import { SimulationScenarioRunner } from "./bootstrap/scenario-runner.ts";
import { ProcessChannelInboundMessage } from "./modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts";

const env = loadAppEnv();

// Create the LLM provider based on environment config.
const llmProvider = createLlmProvider(env);

// Create orchestrator with shared in-memory dependencies.
// Sessions survive across HTTP requests within the same process.
const { orchestrator, processedMessageStore, aiGuideService, processInboundMessage, identityResolver, conversationStore, contactDirectory } = await createInMemoryPipeline({
  llmProvider,
  providerName: env.aiProvider,
  configuredModel: env.aiModel ?? "mock-model-v1",
});
const pipelineHandler = createPipelineHandler(orchestrator, processedMessageStore);

// Conditionally wire simulation and scenario handlers (dev-only, disabled by default)
let simulationHandler: ReturnType<typeof createSimulationHandler> | undefined;
let scenarioHandler: ReturnType<typeof createScenarioHandler> | undefined;
if (env.enableSimulationEndpoints) {
    const processChannelInboundMessage = new ProcessChannelInboundMessage({
      processInboundMessage,
      aiGuideService,
      identityResolver,
      conversationStore,
      contactDirectory,
    });
  simulationHandler = createSimulationHandler(processChannelInboundMessage);

  const scenarioRunner = new SimulationScenarioRunner({
    processChannelInboundMessage,
  });
  scenarioHandler = createScenarioHandler(scenarioRunner);
}

const server = createHttpServer(env.environment, pipelineHandler, env.internalToken, simulationHandler, scenarioHandler);

server.listen(env.port, env.host, () => {
  console.log(`serena-core listening on http://${env.host}:${env.port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /internal/pipeline/process${env.internalToken ? "" : " (token NOT configured)"}`);
  if (env.enableSimulationEndpoints) {
    console.log(`  POST /dev/simulate/inbound-message (simulation enabled)`);
    console.log(`  POST /dev/simulate/scenario (scenario runner enabled)`);
  }
});
