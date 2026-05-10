import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

test("Task 1: implementation plan uses current Evolution API image and env vars", () => {
  const plan = readFileSync(
    join(root, "docs/architecture/whatsapp-gateway-implementation-plan.md"),
    "utf8"
  );
  assert.ok(
    plan.includes("evolutionapi/evolution-api:latest"),
    "Plan should reference correct Evolution API image"
  );
  assert.ok(
    plan.includes("CACHE_REDIS_ENABLED"),
    "Plan should use correct Redis env var name"
  );
  assert.ok(
    plan.includes("CACHE_REDIS_URI"),
    "Plan should use correct Redis URI env var name"
  );
  assert.ok(
    plan.includes("?schema=public"),
    "Plan should use Prisma-format DATABASE_CONNECTION_URI"
  );
});

test("Task 2: gateway contract documents 7 endpoints, auth tiers, webhook mapping, and errors", () => {
  const contract = readFileSync(
    join(root, "docs/architecture/wsp-gateway-api-contract.md"),
    "utf8"
  );
  assert.ok(contract.includes("GET /health"), "Should document health endpoint");
  assert.ok(contract.includes("POST /instances"), "Should document instance creation");
  assert.ok(contract.includes("GET /instances"), "Should document instance listing");
  assert.ok(contract.includes("GET /instances/:name/qr"), "Should document QR retrieval");
  assert.ok(contract.includes("DELETE /instances/:name"), "Should document instance deletion");
  assert.ok(contract.includes("POST /send"), "Should document message sending");
  assert.ok(contract.includes("POST /webhook/evolution"), "Should document webhook receiver");
  assert.ok(contract.includes("X-Gateway-Admin-Key"), "Should document admin auth tier");
  assert.ok(contract.includes("X-Gateway-App-Key"), "Should document app consumer auth tier");
  assert.ok(contract.includes("X-Gateway-Evo-Key"), "Should document Evolution API auth tier");
  assert.ok(contract.includes("fromMe"), "Should document self-message filtering");
  assert.ok(contract.includes("NormalizedInboundMessage"), "Should document normalized message type");
});

test("Task 3: Evolution API compose template exists with private services and no published ports", () => {
  const composePath = join(root, "infra/vps/evolution-api/docker-compose.yml");
  assert.ok(existsSync(composePath), "Compose file should exist");
  const compose = readFileSync(composePath, "utf8");
  assert.ok(compose.includes("evolutionapi/evolution-api:latest"), "Should use correct image");
  assert.ok(compose.includes("evo-postgres"), "Should include PostgreSQL service");
  assert.ok(compose.includes("redis"), "Should include Redis service");
  assert.ok(compose.includes("internal: true"), "Should use internal network");
  assert.ok(!compose.includes('"8080:"') && !compose.includes("'8080:'"), "Should not publish port 8080 to host");
  assert.ok(compose.includes("healthcheck"), "Should include healthchecks");
  assert.ok(compose.includes("CACHE_REDIS_ENABLED"), "Should use correct Redis env var");
  assert.ok(compose.includes("?schema=public"), "Should use Prisma-format DB URI");
});

test("Task 4: Evolution API env template documents required variables without secrets", () => {
  const envPath = join(root, "infra/vps/evolution-api/.env.example");
  assert.ok(existsSync(envPath), "Env example should exist");
  const env = readFileSync(envPath, "utf8");
  assert.ok(env.includes("AUTHENTICATION_API_KEY"), "Should document API key");
  assert.ok(env.includes("POSTGRES_DB"), "Should document database name");
  assert.ok(env.includes("POSTGRES_USER"), "Should document database user");
  assert.ok(env.includes("POSTGRES_PASSWORD"), "Should document database password");
  assert.ok(env.includes("WEBHOOK_GLOBAL_URL"), "Should document webhook URL");
  assert.ok(!env.includes("password123") && !env.includes("secret"), "Should not contain placeholder secrets");
});

test("Task 5: network plan documents topology, membership, flow, and security rationale", () => {
  const plan = readFileSync(
    join(root, "docs/ops/wsp-network-plan.md"),
    "utf8"
  );
  assert.ok(plan.includes("proxy"), "Should document proxy network");
  assert.ok(plan.includes("evolution-internal"), "Should document evolution-internal network");
  assert.ok(plan.includes("whatsapp-gateway"), "Should document gateway bridging networks");
  assert.ok(plan.includes("internal: true"), "Should document internal network isolation");
  assert.ok(plan.includes("Security Rationale") || plan.includes("security"), "Should document security rationale");
  assert.ok(plan.includes("expose"), "Should document expose vs ports distinction");
});
