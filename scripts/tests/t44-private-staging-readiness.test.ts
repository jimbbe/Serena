import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("../../", import.meta.url);

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, ROOT), "utf8");
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateReadinessDocument(content: string): string[] {
  const errors: string[] = [];

  const requiredSections = [
    "## Readiness Checklist",
    "## Evidence Inputs",
    "## Go/No-Go Ledger",
    "## Operator Handoff",
    "## Rollback Ownership",
    "## Explicit Non-Actions",
    "## Blocked Follow-ups",
  ];

  for (const section of requiredSections) {
    if (!new RegExp(`^${escapeForRegex(section)}$`, "m").test(content)) {
      errors.push(`Missing section: ${section}`);
    }
  }

  const requiredEvidenceLinks = [
    "docs/ops/t42-gateway-wa-private-staging-evidence.md",
    "docs/ops/t37-gateway-wa-staging-runbook.md",
    "openspec/changes/t44-private-staging-operational-readiness/specs/gateway-private-staging-readiness/spec.md",
    "openspec/changes/t44-private-staging-operational-readiness/specs/gateway-private-staging-ops/spec.md",
  ];

  for (const link of requiredEvidenceLinks) {
    if (!content.includes(link)) {
      errors.push(`Missing evidence link: ${link}`);
    }
  }

  if (!/Any unchecked gate means\s+\*\*NO-GO\*\*\./i.test(content)) {
    errors.push("Missing fail-closed checklist statement");
  }

  if (!/\*\*Unmet gate\(s\)\*\* \(if NO-GO\):\s*`[^`]*`/.test(content)) {
    errors.push("Missing unmet gate field for NO-GO");
  }

  if (!/\*\*Required remediation\*\* \(if NO-GO\):\s*`[^`]*`/.test(content)) {
    errors.push("Missing required remediation field for NO-GO");
  }

  return errors;
}

test("t44 readiness doc contains canonical sections and evidence inputs", () => {
  const readiness = readRepoFile("docs/ops/t44-private-staging-readiness.md");
  assert.deepEqual(validateReadinessDocument(readiness), []);
});

test("t44 readiness keeps private-only scope and fail-closed wording", () => {
  const readiness = readRepoFile("docs/ops/t44-private-staging-readiness.md");

  assert.match(readiness, /NO-GO/i);
  assert.match(readiness, /private operator-only staging/i);
  assert.match(readiness, /repo-only/i);
  assert.match(readiness, /no runtime mutation is authorized/i);
  assert.match(readiness, /blocked follow-up/i);
});

test("t44 readiness fails closed when evidence or checklist fields are missing", () => {
  const readiness = readRepoFile("docs/ops/t44-private-staging-readiness.md");

  const malformed = readiness
    .replace("## Evidence Inputs", "## Evidence Inputs (removed)")
    .replace(/- \*\*Required remediation\*\* \(if NO-GO\):[^\n]*\n/, "");

  const errors = validateReadinessDocument(malformed);
  assert.ok(errors.length >= 2);
  assert.ok(errors.some((error) => error.includes("Missing section: ## Evidence Inputs")));
  assert.ok(errors.some((error) => error.includes("Missing required remediation field for NO-GO")));
});

test("t44 no-go ledger records remediation fields explicitly", () => {
  const readiness = readRepoFile("docs/ops/t44-private-staging-readiness.md");

  assert.match(readiness, /\*\*Decision\*\*: `GO \| NO-GO`/);
  assert.match(readiness, /\*\*Unmet gate\(s\)\*\* \(if NO-GO\):\s*`[^`]*`/);
  assert.match(readiness, /\*\*Required remediation\*\* \(if NO-GO\):\s*`[^`]*`/);
});

test("t44 docs do not approve forbidden scope expansion", () => {
  const readiness = readRepoFile("docs/ops/t44-private-staging-readiness.md");
  const runbook = readRepoFile("docs/ops/t37-gateway-wa-staging-runbook.md");
  const evidence = readRepoFile("docs/ops/t42-gateway-wa-private-staging-evidence.md");
  const projectStatus = readRepoFile("docs/project-status.md");

  const allDocs = [readiness, runbook, evidence, projectStatus].join("\n\n");

  const forbiddenApprovals = [
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}pairing/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}public admin/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}real send/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}host port/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}caddy/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}dns/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}(vps|docker)[^\n]{0,120}mutation/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}secret/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}hmac/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}durable state/i,
  ];

  for (const pattern of forbiddenApprovals) {
    assert.doesNotMatch(allDocs, pattern);
  }
});

test("t44 is wired into check pipeline", () => {
  const packageJson = readRepoFile("package.json");

  assert.match(packageJson, /"validate:t44"\s*:/);
  assert.match(packageJson, /"check"\s*:\s*"[^"]*validate:t44[^"]*"/);
});
