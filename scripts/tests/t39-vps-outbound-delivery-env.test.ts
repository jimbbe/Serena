import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("T39: VPS compose exposes outbound delivery env for serena-core", () => {
  const compose = read("infra/vps/docker-compose.yml");

  assert.match(compose, /serena-core:[\s\S]*environment:[\s\S]*OUTBOUND_DELIVERY_ADAPTER:\s*\$\{OUTBOUND_DELIVERY_ADAPTER:-fake\}/);
  assert.match(compose, /GATEWAY_WA_BASE_URL:\s*\$\{GATEWAY_WA_BASE_URL:-\}/);
  assert.match(compose, /GATEWAY_WA_APP_KEY:\s*\$\{GATEWAY_WA_APP_KEY:-\}/);
  assert.match(compose, /GATEWAY_WA_INSTANCE_ID:\s*\$\{GATEWAY_WA_INSTANCE_ID:-\}/);
  assert.match(compose, /GATEWAY_WA_TIMEOUT_MS:\s*\$\{GATEWAY_WA_TIMEOUT_MS:-30000\}/);
});

test("T39: VPS compose does not hardcode gateway secrets", () => {
  const compose = read("infra/vps/docker-compose.yml");

  const lines = compose
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line.startsWith("GATEWAY_WA_BASE_URL:")
      || line.startsWith("GATEWAY_WA_APP_KEY:")
      || line.startsWith("GATEWAY_WA_INSTANCE_ID:"),
    );

  assert.deepEqual(lines, [
    "GATEWAY_WA_BASE_URL: ${GATEWAY_WA_BASE_URL:-}",
    "GATEWAY_WA_APP_KEY: ${GATEWAY_WA_APP_KEY:-}",
    "GATEWAY_WA_INSTANCE_ID: ${GATEWAY_WA_INSTANCE_ID:-}",
  ]);
});
