import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
import type { PromptId } from "../domain/prompt-id.ts";

const REPLY: PromptId = "serena.conversation.reply.v1";

test("record returns auditId", async () => {
  const audit = new InMemoryAiInvocationAudit();

  const result = await audit.record(
    {
      useCaseId: "serena.conversation.reply",
      promptId: REPLY,
      promptVersion: 1,
      userPrompt: "Hello",
    },
    {
      output: "Hi there!",
      tokensUsed: 42,
      executionTimeMs: 100,
      success: true,
    }
  );

  assert.ok(typeof result.auditId === "string");
  assert.ok(result.auditId.startsWith("audit-"));
});

test("records invocation with auditId, promptId, promptVersion and retrieves it", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    {
      useCaseId: "serena.conversation.reply",
      promptId: REPLY,
      promptVersion: 1,
      userPrompt: "Hello",
    },
    {
      output: "Hi there!",
      tokensUsed: 42,
      executionTimeMs: 100,
      success: true,
    }
  );

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.ok(typeof r.auditId === "string");
  assert.ok(r.auditId.startsWith("audit-"));
  assert.equal(r.useCaseId, "serena.conversation.reply");
  assert.equal(r.promptId, REPLY);
  assert.equal(r.promptVersion, 1);
  assert.equal(r.userPrompt, "Hello");
  assert.equal(r.output, "Hi there!");
  assert.equal(r.tokensUsed, 42);
  assert.equal(r.executionTimeMs, 100);
  assert.equal(r.success, true);
  // systemPrompt must NOT be present
  assert.ok(!("systemPrompt" in r), "systemPrompt must not be present in AuditRecord");
});

test("records multiple invocations with unique auditIds in order", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    { useCaseId: "serena.conversation.reply", promptId: REPLY, promptVersion: 1, userPrompt: "u1" },
    { output: "r1", executionTimeMs: 10, success: true }
  );
  await audit.record(
    { useCaseId: "serena.risk.review", promptId: "serena.risk.review.v1" as PromptId, promptVersion: 1, userPrompt: "u2" },
    { output: "r2", executionTimeMs: 20, success: false, error: "provider error" }
  );
  await audit.record(
    { useCaseId: "serena.mediation.understand_request", promptId: "serena.mediation.understand_request.v1" as PromptId, promptVersion: 1, userPrompt: "u3" },
    { output: "r3", executionTimeMs: 30, success: true }
  );

  const records = audit.getRecords();
  assert.equal(records.length, 3);
  assert.equal(records[0]!.useCaseId, "serena.conversation.reply");
  assert.equal(records[1]!.useCaseId, "serena.risk.review");
  assert.equal(records[2]!.useCaseId, "serena.mediation.understand_request");

  const ids = records.map((r) => r.auditId);
  assert.equal(new Set(ids).size, 3, "auditIds must be unique");
});

test("records failed invocation with error and auditId", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    { useCaseId: "serena.risk.review", promptId: REPLY, promptVersion: 1, userPrompt: "u" },
    { output: "", tokensUsed: 0, executionTimeMs: 500, success: false, error: "timeout" }
  );

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.ok(typeof r.auditId === "string");
  assert.equal(r.success, false);
  assert.equal(r.error, "timeout");
  assert.equal(r.output, "");
  assert.equal(r.promptId, REPLY);
});

test("starts with empty records", () => {
  const audit = new InMemoryAiInvocationAudit();

  const records = audit.getRecords();
  assert.equal(records.length, 0);
});
