import { createHttpServer } from "./bootstrap/server.ts";
import { loadAppEnv } from "./config/env.ts";
import { createInMemoryPipeline } from "./bootstrap/create-in-memory-pipeline.ts";
import { createPipelineHandler } from "./bootstrap/internal-pipeline-handler.ts";

const env = loadAppEnv();

// Create orchestrator with shared in-memory dependencies.
// Sessions survive across HTTP requests within the same process.
const { orchestrator } = await createInMemoryPipeline();
const pipelineHandler = createPipelineHandler(orchestrator);

const server = createHttpServer(env.environment, pipelineHandler);

server.listen(env.port, env.host, () => {
  console.log(`serena-core listening on http://${env.host}:${env.port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /internal/pipeline/process`);
});
