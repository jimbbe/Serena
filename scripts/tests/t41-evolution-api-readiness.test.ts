import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("../../", import.meta.url);

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, ROOT), "utf8");
}

function listCoreSourceFiles(): string[] {
  const repoRootPath = fileURLToPath(new URL("../../", import.meta.url));
  const rootPath = fileURLToPath(new URL("../../apps/core/src/", import.meta.url));
  const filePaths: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !fullPath.endsWith(".ts") || fullPath.endsWith(".test.ts")) {
        continue;
      }

      filePaths.push(relative(repoRootPath, fullPath));
    }
  }

  if (statSync(rootPath).isDirectory()) {
    walk(rootPath);
  }

  return filePaths;
}

test("t41 compose keeps private topology and no host port exposure", () => {
  const compose = readRepoFile("infra/vps/gateway-wa-staging/docker-compose.yml");

  assert.match(compose, /gateway-wa:[\s\S]*serena-internal[\s\S]*evolution-private/);
  assert.match(compose, /evolution-api:[\s\S]*networks:[\s\S]*- evolution-private/);
  assert.doesNotMatch(compose, /^\s+ports:/m);
});

test("t41 env template remains placeholder-only with private evolution endpoint", () => {
  const envExample = readRepoFile("infra/vps/gateway-wa-staging/.env.example");

  assert.match(envExample, /^EVOLUTION_API_URL=http:\/\/evolution-api:8080$/m);
  assert.match(envExample, /^GATEWAY_ADMIN_KEY=REPLACE_/m);
  assert.match(envExample, /^GATEWAY_APP_KEY=REPLACE_/m);
  assert.match(envExample, /^GATEWAY_EVO_KEY=REPLACE_/m);
  assert.match(envExample, /^SERENA_INTERNAL_TOKEN=REPLACE_/m);
  assert.match(envExample, /^POSTGRES_PASSWORD=REPLACE_/m);
});

test("t41 smoke helper stays non-destructive", () => {
  const smoke = readRepoFile("scripts/smoke/gateway-wa-staging-smoke.ts");

  assert.match(smoke, /T41 smoke helper/);
  assert.match(smoke, /unknown route/i);
  assert.match(smoke, /malformed payload/i);
  assert.match(smoke, /no real pairing, no real send/i);
  assert.doesNotMatch(smoke, /\/instances\/.+qr/i);
});

test("t41 docs state operator-only path and resolved hosting decision", () => {
  const runbook = readRepoFile("docs/ops/t37-gateway-wa-staging-runbook.md");
  const projectStatus = readRepoFile("docs/project-status.md");
  const openQuestions = readRepoFile("docs/open-questions.md");

  assert.match(runbook, /operator-only/i);
  assert.match(runbook, /no public admin/i);
  assert.match(projectStatus, /Evolution API runs in its own private VPS Docker container/i);
  assert.doesNotMatch(openQuestions, /\*\*Evolution API hosting\*\* —/i);
});

test("t41 core boundary remains adapter-only with no direct Evolution endpoint usage", () => {
  const suspiciousPatterns = [
    /EVOLUTION_API_URL/,
    /evolution-api:8080/i,
    /\/message\/sendText/i,
    /\/instance\/connect/i,
  ];

  const offenders: Array<{ file: string; pattern: string }> = [];

  for (const relativePath of listCoreSourceFiles()) {
    const content = readRepoFile(relativePath.replace(/\\/g, "/"));

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        offenders.push({ file: relativePath, pattern: pattern.source });
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Core source must not embed Evolution endpoint/config usage. Offenders: ${JSON.stringify(offenders)}`,
  );
});

test("t41 restart limitation is explicit in canonical status doc", () => {
  const projectStatus = readRepoFile("docs/project-status.md");

  assert.match(projectStatus, /\*\*Instance state persistence\*\* — InstanceManager is in-memory;/i);
  assert.match(projectStatus, /gateway restart loses local tracking/i);
  assert.match(projectStatus, /Rehydration from Evolution API on startup planned for a future phase/i);
});
