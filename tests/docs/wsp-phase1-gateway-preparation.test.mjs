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

test("Task 3: Evolution API compose uses private network (not internal), no published ports", () => {
  const composePath = join(root, "infra/vps/evolution-api/docker-compose.yml");
  assert.ok(existsSync(composePath), "Compose file should exist");
  const compose = readFileSync(composePath, "utf8");

  // Correct image
  assert.ok(compose.includes("evolutionapi/evolution-api:latest"), "Should use correct image");

  // Services exist
  assert.ok(compose.includes("evo-postgres"), "Should include PostgreSQL service");
  assert.ok(compose.includes("redis"), "Should include Redis service");

  // Network is private (bridge), NOT internal
  assert.ok(compose.includes("evolution-private"), "Should use evolution-private network");
  assert.ok(
    !compose.includes("internal: true"),
    "Evolution API network must NOT be internal: true (needs outbound internet for WhatsApp)"
  );

  // No published ports
  assert.ok(
    !compose.includes('"8080:"') && !compose.includes("'8080:'") && !compose.includes("- 8080:"),
    "Evolution API should not publish port 8080 to host"
  );
  assert.ok(
    !compose.includes('"5432:"') && !compose.includes("'5432:'") && !compose.includes("- 5432:"),
    "PostgreSQL should not publish port 5432 to host"
  );
  assert.ok(
    !compose.includes('"6379:"') && !compose.includes("'6379:'") && !compose.includes("- 6379:"),
    "Redis should not publish port 6379 to host"
  );

  // Uses expose for internal DNS
  assert.ok(compose.includes("expose"), "Should use expose for internal Docker DNS");

  // Healthchecks
  assert.ok(compose.includes("healthcheck"), "Should include healthchecks");

  // Correct env vars
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
  assert.ok(env.includes("EVOLUTION_SERVER_URL"), "Should document Evolution server URL");
  assert.ok(!env.includes("password123") && !env.includes("secret"), "Should not contain placeholder secrets");
});

test("Task 5: network plan documents private network, outbound internet, no public exposure", () => {
  const plan = readFileSync(
    join(root, "docs/ops/wsp-network-plan.md"),
    "utf8"
  );

  // Network name consistency
  assert.ok(plan.includes("evolution-private"), "Should document evolution-private network");

  // Outbound internet access
  assert.ok(
    plan.includes("outbound") || plan.includes("outbound internet") || plan.includes("needs OUTBOUND"),
    "Should document that Evolution API needs outbound internet access"
  );

  // No public exposure
  assert.ok(
    plan.includes("No Caddy route") || plan.includes("no Caddy") || plan.includes("no public"),
    "Should document that Evolution API has no public Caddy route"
  );
  assert.ok(
    plan.includes("No `ports:`") || plan.includes("no ports") || plan.includes("not publish"),
    "Should document that Evolution API does not publish ports"
  );

  // Private vs internal distinction
  assert.ok(
    plan.includes("internal: true") || plan.includes("NOT internal") || plan.includes("not internal"),
    "Should explain the distinction between private and internal networks"
  );

  // Security rationale
  assert.ok(plan.includes("Security Rationale") || plan.includes("security"), "Should document security rationale");
  assert.ok(plan.includes("expose"), "Should document expose vs ports distinction");
});

test("Task 6: docs and compose use the same network name", () => {
  const compose = readFileSync(
    join(root, "infra/vps/evolution-api/docker-compose.yml"),
    "utf8"
  );
  const networkPlan = readFileSync(
    join(root, "docs/ops/wsp-network-plan.md"),
    "utf8"
  );
  const implPlan = readFileSync(
    join(root, "docs/architecture/whatsapp-gateway-implementation-plan.md"),
    "utf8"
  );

  // All files reference evolution-private
  assert.ok(compose.includes("evolution-private"), "Compose should use evolution-private");
  assert.ok(networkPlan.includes("evolution-private"), "Network plan should use evolution-private");
  assert.ok(implPlan.includes("evolution-private"), "Implementation plan should use evolution-private");

  // No file should reference the old internal network name
  assert.ok(
    !compose.includes("evolution-internal"),
    "Compose should NOT reference evolution-internal"
  );
});

test("Task 7: documentation explains Evolution API needs outbound internet", () => {
  const networkPlan = readFileSync(
    join(root, "docs/ops/wsp-network-plan.md"),
    "utf8"
  );
  const implPlan = readFileSync(
    join(root, "docs/architecture/whatsapp-gateway-implementation-plan.md"),
    "utf8"
  );

  assert.ok(
    networkPlan.includes("outbound internet") || networkPlan.includes("needs OUTBOUND"),
    "Network plan should explicitly state Evolution API needs outbound internet"
  );
  assert.ok(
    implPlan.includes("outbound") || implPlan.includes("necesita salida") || implPlan.includes("outbound internet"),
    "Implementation plan should mention Evolution API needs outbound internet"
  );
});
