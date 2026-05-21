import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("../../", import.meta.url);

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, ROOT), "utf8");
}

test("t47 evidence doc includes canonical no-go gates and ledger", () => {
  const content = readRepoFile("docs/ops/t47-controlled-pairing-execution-evidence.md");

  const requiredSections = [
    "## Readiness Checklist",
    "## GO/NO-GO Ledger",
    "## Private Runtime Verification Evidence (sanitized)",
    "## Pairing Attempt Ledger (single-attempt policy)",
    "## Explicit Non-Actions",
  ];

  for (const section of requiredSections) {
    assert.match(content, new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }

  assert.match(content, /Any unchecked gate means\s+\*\*NO-GO\*\*\./i);
  assert.match(content, /\*\*Decision\*\*:\s*`NO-GO`/);
  assert.match(content, /\*\*attempt_executed\*\*:\s*`no`/);
  assert.match(content, /\*\*qr_requested\*\*:\s*`no`/);
  assert.match(content, /\*\*sent\*\*:\s*`not_sent`/);
  assert.match(content, /OUTBOUND_DELIVERY_ADAPTER=fake/);
  assert.match(content, /\*\*sanitized_evidence_marker\*\*:\s*`sanitized-only`/);
});

test("t47 evidence doc preserves required private smoke statuses", () => {
  const content = readRepoFile("docs/ops/t47-controlled-pairing-execution-evidence.md");

  assert.match(content, /private health status:\s*`200`/i);
  assert.match(content, /private send without key status:\s*`401`/i);
  assert.match(content, /private unknown path status:\s*`404`/i);
});

test("t47 docs fail closed against prohibited data leakage patterns", () => {
  const evidence = readRepoFile("docs/ops/t47-controlled-pairing-execution-evidence.md");

  const forbidden = [
    /data:image\/(png|jpeg);base64,/i,
    /BEGIN\s+RSA\s+PRIVATE\s+KEY/i,
    /BEGIN\s+OPENSSH\s+PRIVATE\s+KEY/i,
    /x-api-key\s*:\s*[A-Za-z0-9_\-]{8,}/i,
    /serena_internal_token\s*=\s*[^\s`]+/i,
    /\+?\d{9,}/,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(evidence, pattern);
  }
});

test("t47 no-go closeout includes concrete blocker completeness fields", () => {
  const content = readRepoFile("docs/ops/t47-controlled-pairing-execution-evidence.md");

  assert.match(content, /\*\*Decision\*\*:\s*`NO-GO`/);
  assert.match(content, /\*\*Failed check\(s\)\*\*:/);
  assert.match(content, /command:\s*`git log --oneline origin\/main -20`\s*->\s*result:/i);
  assert.match(content, /private authenticated malformed `\/send` smoke/i);
  assert.match(content, /\*\*Missing precondition\(s\)\*\*:/);
  assert.match(content, /PR #76 merged into `main`/);
  assert.match(content, /operator\+reviewer live confirmation/i);
  assert.match(content, /approved redacted runtime `instanceId` label/i);
  assert.match(content, /\*\*Required operator action to unblock\*\*:/);
  assert.match(content, /Re-run malformed authenticated `\/send` check privately and record only status code\./i);
  assert.match(content, /\*\*next_operator_action\*\*:\s*`complete unblock steps under private operator session, then retry once`/i);
});

test("t47 is wired in check pipeline", () => {
  const packageJson = readRepoFile("package.json");
  assert.match(packageJson, /"validate:t47"\s*:/);
  assert.match(packageJson, /"check"\s*:\s*"[^"]*validate:t45[^"]*validate:t47[^"]*typecheck[^"]*"/);
});
