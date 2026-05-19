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

function validateT45ReadinessDocument(content: string): string[] {
  const errors: string[] = [];

  const requiredSections = [
    "## Readiness Checklist",
    "## GO/NO-GO Ledger",
    "## T46 Pairing Activation Plan (deferred)",
    "## Runtime Allowlist And Config Ownership",
    "## Operational Evidence Fields (for future T46/T47 rehearsals)",
    "## Bounded Risk Acceptance",
    "## Abort And Revalidate Triggers",
    "## Explicit Non-Actions",
    "## <=4 Task Runway To First Controlled Real Tests",
    "## OpenSpec / Archive Notes",
  ];

  for (const section of requiredSections) {
    if (!new RegExp(`^${escapeForRegex(section)}$`, "m").test(content)) {
      errors.push(`Missing section: ${section}`);
    }
  }

  if (!/Any unchecked gate means\s+\*\*NO-GO\*\*\./i.test(content)) {
    errors.push("Missing fail-closed checklist statement");
  }

  if (!/\*\*Decision\*\*:\s*`GO` for T46 controlled pairing rehearsal planning only/.test(content)) {
    errors.push("Missing GO decision limited to T46 planning");
  }

  if (!/\*\*Unmet gate\(s\)\*\* \(if NO-GO\):\s*`[^`]*`/.test(content)) {
    errors.push("Missing unmet gate field for NO-GO");
  }

  if (!/\*\*Required remediation\*\* \(if NO-GO\):\s*`[^`]*`/.test(content)) {
    errors.push("Missing required remediation field for NO-GO");
  }

  const requiredEvidenceFields = [
    "`timestamp`",
    "`instanceId`",
    "`sender/personId`",
    "`messageId`",
    "pipeline decision",
    "selected action",
    "sent/not sent",
    "error",
    "operator notes",
  ];

  for (const field of requiredEvidenceFields) {
    if (!content.includes(field)) {
      errors.push(`Missing evidence field: ${field}`);
    }
  }

  if (!/omitted or redacted/i.test(content)) {
    errors.push("Missing mandatory redaction language");
  }

  if (!/private operator-owned runtime config/i.test(content)) {
    errors.push("Missing runtime allowlist ownership statement");
  }

  if (!/do not require PostgreSQL/i.test(content)) {
    errors.push("Missing explicit no-PostgreSQL allowlist statement");
  }

  if (!/Runway remains <=4 tasks/i.test(content)) {
    errors.push("Missing <=4 tasks runway statement");
  }

  return errors;
}

test("t45 readiness doc contains canonical sections and fail-closed fields", () => {
  const readiness = readRepoFile("docs/ops/t45-controlled-pairing-readiness.md");
  assert.deepEqual(validateT45ReadinessDocument(readiness), []);
});

test("t45 readiness keeps repo-only deferred scope", () => {
  const readiness = readRepoFile("docs/ops/t45-controlled-pairing-readiness.md");

  assert.match(readiness, /repo-only/i);
  assert.match(readiness, /T46-only/i);
  assert.match(readiness, /does \*\*not\*\* approve/i);
  assert.match(readiness, /abort/i);
  assert.match(readiness, /revalidated?/i);
});

test("t45 readiness fails closed when required sections/fields are removed", () => {
  const readiness = readRepoFile("docs/ops/t45-controlled-pairing-readiness.md");

  const malformed = readiness
    .replace("## Runtime Allowlist And Config Ownership", "## Runtime Config")
    .replace("- `messageId`\n", "")
    .replace(/\*\*Required remediation\*\* \(if NO-GO\):[^\n]*\n/, "");

  const errors = validateT45ReadinessDocument(malformed);
  assert.ok(errors.length >= 3);
  assert.ok(errors.some((error) => error.includes("Missing section: ## Runtime Allowlist And Config Ownership")));
  assert.ok(errors.some((error) => error.includes("Missing evidence field: `messageId`")));
  assert.ok(errors.some((error) => error.includes("Missing required remediation field for NO-GO")));
});

test("t45 docs do not approve forbidden scope expansion", () => {
  const readiness = readRepoFile("docs/ops/t45-controlled-pairing-readiness.md");
  const readme = readRepoFile("README.md");
  const projectStatus = readRepoFile("docs/project-status.md");
  const openQuestions = readRepoFile("docs/open-questions.md");

  const allDocs = [readiness, readme, projectStatus, openQuestions].join("\n\n");

  const forbiddenApprovals = [
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}(pairing|qr)/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}real send/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}public\/admin exposure/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}host port/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}caddy/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}dns/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}(vps|docker)[^\n]{0,120}mutation/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}secret/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}postgresql rollout/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}hmac/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}durable state rollout/i,
  ];

  for (const pattern of forbiddenApprovals) {
    assert.doesNotMatch(allDocs, pattern);
  }
});

test("t45 is wired into check pipeline after t44", () => {
  const packageJson = readRepoFile("package.json");

  assert.match(packageJson, /"validate:t45"\s*:/);
  assert.match(packageJson, /"check"\s*:\s*"[^"]*validate:t44[^"]*validate:t45[^"]*typecheck[^"]*"/);
});
