import { access } from "node:fs/promises";
import path from "node:path";

const requiredPaths = [
  "README.md",
  "AGENTS.md",
  ".gitignore",
  ".env.example",
  "package.json",
  "tsconfig.base.json",
  ".github/workflows/ci.yml",
  "apps/core/README.md",
  "apps/core/src/bootstrap/server.ts",
  "apps/core/src/bootstrap/internal-pipeline-handler.ts",
  "apps/core/src/bootstrap/create-in-memory-pipeline.ts",
  "apps/core/src/modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts",
  "apps/gateway-wa/README.md",
  "apps/gateway-wa/package.json",
  "apps/gateway-wa/src/application/run-dry-gateway-event.ts",
  "apps/gateway-wa/src/application/call-serena-core.ts",
  "apps/panel/README.md",
  "packages/shared/README.md",
  "infra/README.md",
  "docs/project-status.md",
  "docs/open-questions.md",
  "docs/architecture/t10-mvp-architecture.md",
  "docs/architecture/t16-internal-pipeline-http.md",
  "docs/architecture/t17a-whatsapp-gateway-contract.md",
  "docs/architecture/t17b-internal-hardening.md",
  "docs/architecture/t18-mock-whatsapp-gateway.md",
  "docs/ops/deployment-t04.md",
  "tests/README.md"
];

const missing = [];

for (const requiredPath of requiredPaths) {
  try {
    await access(path.resolve(requiredPath));
  } catch {
    missing.push(requiredPath);
  }
}

if (missing.length > 0) {
  console.error("Missing required bootstrap paths:");
  for (const missingPath of missing) {
    console.error(`- ${missingPath}`);
  }
  process.exit(1);
}

console.log("Serena bootstrap structure is present.");
