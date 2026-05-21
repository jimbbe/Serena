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

function validateT46RehearsalDocument(content: string): string[] {
  const errors: string[] = [];

  const requiredSections = [
    "## Readiness Checklist",
    "## GO/NO-GO Ledger",
    "## Private Operator Runtime Sequence",
    "## Evidence Ledger",
    "## Evidence Redaction Policy",
    "## Abort And Revalidate Rules",
    "## Fake Outbound Safety Invariant",
    "## Explicit Non-Actions",
    "## Deferred/NO-GO Handling",
    "## Closeout",
  ];

  for (const section of requiredSections) {
    if (!new RegExp(`^${escapeForRegex(section)}$`, "m").test(content)) {
      errors.push(`Missing section: ${section}`);
    }
  }

  if (!/Any unchecked gate means\s+\*\*NO-GO\*\*\.?/i.test(content)) {
    errors.push("Missing fail-closed checklist statement");
  }

  if (!/one approved private attempt only/i.test(content)) {
    errors.push("Missing one-attempt-only scope statement");
  }

  const requiredEvidenceFields = [
    "timestamp",
    "operator",
    "reviewer",
    "private path confirmed",
    "instanceId",
    "sender/personId",
    "messageId",
    "route/allowlist revalidation status",
    "pairing phase/state",
    "pipeline decision/action",
    "sent/not sent",
    "error/abort reason",
    "operator notes",
  ];

  for (const field of requiredEvidenceFields) {
    if (!new RegExp(field, "i").test(content)) {
      errors.push(`Missing evidence field: ${field}`);
    }
  }

  if (!/omitted or redacted/i.test(content)) {
    errors.push("Missing mandatory redaction language");
  }

  if (!/OUTBOUND_DELIVERY_ADAPTER=fake/i.test(content)) {
    errors.push("Missing fake outbound invariant");
  }

  if (!/before, during, and after/i.test(content)) {
    errors.push("Missing before/during/after fake outbound wording");
  }

  if (!/no runtime pairing may proceed/i.test(content)) {
    errors.push("Missing NO-GO runtime stop wording");
  }

  return errors;
}

test("t46 rehearsal doc contains canonical sections and fail-closed fields", () => {
  const rehearsal = readRepoFile("docs/ops/t46-controlled-pairing-rehearsal.md");
  assert.deepEqual(validateT46RehearsalDocument(rehearsal), []);
});

test("t46 rehearsal records deferred path when runtime gates are unavailable", () => {
  const rehearsal = readRepoFile("docs/ops/t46-controlled-pairing-rehearsal.md");

  assert.match(rehearsal, /NO-GO|deferred/i);
  assert.match(rehearsal, /private operator/i);
  assert.match(rehearsal, /abort/i);
  assert.match(rehearsal, /revalidate/i);
});

test("t46 docs do not approve forbidden scope expansion", () => {
  const rehearsal = readRepoFile("docs/ops/t46-controlled-pairing-rehearsal.md");
  const readme = readRepoFile("README.md");
  const projectStatus = readRepoFile("docs/project-status.md");
  const openQuestions = readRepoFile("docs/open-questions.md");

  const allDocs = [rehearsal, readme, projectStatus, openQuestions].join("\n\n");

  const forbiddenApprovals = [
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}real send/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}public\/admin exposure/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}host port/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}caddy/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}dns/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}(vps|docker)[^\n]{0,120}mutation/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}postgresql rollout/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}hmac/i,
    /(approved\s+(to|for)|authorization\s+for)[^\n]{0,120}durable state rollout/i,
  ];

  for (const pattern of forbiddenApprovals) {
    assert.doesNotMatch(allDocs, pattern);
  }
});

test("t46 is wired into check pipeline after t45", () => {
  const packageJson = readRepoFile("package.json");

  assert.match(packageJson, /"validate:t46"\s*:/);
  assert.match(packageJson, /"check"\s*:\s*"[^"]*validate:t45[^"]*validate:t46[^"]*typecheck[^"]*"/);
});
