import { createHttpServer } from "./bootstrap/server.ts";
import { loadAppEnv } from "./config/env.ts";
import { createInMemoryPipeline } from "./bootstrap/create-in-memory-pipeline.ts";
import { createPipelineHandler } from "./bootstrap/internal-pipeline-handler.ts";
import { createSimulationHandler } from "./bootstrap/simulation-handler.ts";
import { ProcessChannelInboundMessage } from "./modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts";

const env = loadAppEnv();

// Create orchestrator with shared in-memory dependencies.
// Sessions survive across HTTP requests within the same process.
const { orchestrator, processedMessageStore, aiGuideService, processInboundMessage } = await createInMemoryPipeline();
const pipelineHandler = createPipelineHandler(orchestrator, processedMessageStore);

// Conditionally wire simulation handler (dev-only, disabled by default)
let simulationHandler: ReturnType<typeof createSimulationHandler> | undefined;
if (env.enableSimulationEndpoints) {
  const processChannelInboundMessage = new ProcessChannelInboundMessage({
    processInboundMessage,
    aiGuideService,
  });
  simulationHandler = createSimulationHandler(processChannelInboundMessage);
}

const server = createHttpServer(env.environment, pipelineHandler, env.internalToken, simulationHandler);

server.listen(env.port, env.host, () => {
  console.log(`serena-core listening on http://${env.host}:${env.port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /internal/pipeline/process${env.internalToken ? "" : " (token NOT configured)"}`);
  if (env.enableSimulationEndpoints) {
    console.log(`  POST /dev/simulate/inbound-message (simulation enabled)`);
  }
});
