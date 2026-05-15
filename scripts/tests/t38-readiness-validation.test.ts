import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("T38: core compose requires SERENA_INTERNAL_TOKEN from runtime env", () => {
  const compose = read("infra/vps/docker-compose.yml");
  assert.match(
    compose,
    /SERENA_INTERNAL_TOKEN:\s*\$\{SERENA_INTERNAL_TOKEN:\?SERENA_INTERNAL_TOKEN is required\}/,
  );
});

test("T38: gateway staging joins serena-internal privately without host port exposure", () => {
  const compose = read("infra/vps/gateway-wa-staging/docker-compose.yml");
  assert.match(compose, /gateway-wa:[\s\S]*?networks:[\s\S]*?-\s+serena-internal/);
  assert.match(compose, /serena-internal:\s*\n\s*external:\s*true/);
  assert.doesNotMatch(compose, /gateway-wa:[\s\S]*?ports\s*:/);
});

test("T38: runbook contains authenticated and unauthenticated webhook checks", () => {
  const runbook = read("docs/ops/t38-vps-core-update-runbook.md");
  assert.match(runbook, /x-serena-internal-token/i);
  assert.match(runbook, /Negative check \(must NOT be treated as success\):/);
  assert.match(runbook, /process\.exit\(r\.status === 200 \? 1 : 0\)/);
});

test("T38: runbook keeps operational isolation and rollback preservation", () => {
  const runbook = read("docs/ops/t38-vps-core-update-runbook.md");
  assert.match(runbook, /Do not deploy `gateway-wa`\./);
  assert.match(runbook, /Do not modify Caddy\./);
  assert.match(runbook, /Do not open ports\./);
  assert.match(runbook, /Keep `\.env` and PostgreSQL volumes intact\./);
  assert.match(runbook, /Do not run `down -v`\./);
});

test("T38: runbook validates SERENA_INTERNAL_TOKEN before first core docker compose command", () => {
  const runbook = read("docs/ops/t38-vps-core-update-runbook.md");

  const firstCoreComposeIndex = runbook.indexOf(
    "docker compose -f infra/vps/docker-compose.yml",
  );
  assert.notEqual(
    firstCoreComposeIndex,
    -1,
    "expected at least one core docker compose command in runbook",
  );

  const tokenValidationIndex = runbook.indexOf(
    "TOKEN_LINE=\"$(grep '^SERENA_INTERNAL_TOKEN=' .env || true)\"",
  );
  assert.notEqual(
    tokenValidationIndex,
    -1,
    "expected SERENA_INTERNAL_TOKEN fail-fast block in preflight",
  );

  assert.ok(
    tokenValidationIndex < firstCoreComposeIndex,
    "SERENA_INTERNAL_TOKEN fail-fast validation must appear before any core docker compose command",
  );
});

test("T38: staged gateway runbook is gated by core refresh precondition", () => {
  const runbook = read("docs/ops/t37-gateway-wa-staging-runbook.md");
  assert.match(runbook, /Do not deploy `gateway-wa` until `serena-core` has been updated from `main`/);
  assert.match(runbook, /`POST \/internal\/webhook\/whatsapp` has been verified\./);
});

test("T38: tracked templates/docs contain no hardcoded SERENA_INTERNAL_TOKEN secret", () => {
  const envExample = read("infra/vps/gateway-wa-staging/.env.example");
  assert.match(envExample, /SERENA_INTERNAL_TOKEN=REPLACE_SERENA_INTERNAL_TOKEN/);

  const t38Runbook = read("docs/ops/t38-vps-core-update-runbook.md");
  const t37Runbook = read("docs/ops/t37-gateway-wa-staging-runbook.md");
  assert.doesNotMatch(t38Runbook, /SERENA_INTERNAL_TOKEN=[A-Za-z0-9_\-]{12,}/);
  assert.doesNotMatch(t37Runbook, /SERENA_INTERNAL_TOKEN=[A-Za-z0-9_\-]{12,}/);
});
