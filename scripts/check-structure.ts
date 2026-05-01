import { access } from "node:fs/promises";
import path from "node:path";

const requiredPaths = [
  "README.md",
  "AGENTS.md",
  ".gitignore",
  ".env.example",
  "package.json",
  "tsconfig.base.json",
  "apps/core/README.md",
  "apps/gateway-wa/README.md",
  "apps/panel/README.md",
  "packages/shared/README.md",
  "infra/README.md",
  "docs/project-status.md",
  "docs/open-questions.md",
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
