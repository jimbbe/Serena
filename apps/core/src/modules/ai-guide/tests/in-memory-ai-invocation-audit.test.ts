import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";

test("records invocation and retrieves it", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    {
      useCaseId: "serena.conversation.reply",
      systemPrompt: "You are helpful",
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
  // noUncheckedIndexedAccess — safe because we asserted length
  const r = records[0]!;
  assert.equal(r.useCaseId, "serena.conversation.reply");
  assert.equal(r.systemPrompt, "You are helpful");
  assert.equal(r.userPrompt, "Hello");
  assert.equal(r.output, "Hi there!");
  assert.equal(r.tokensUsed, 42);
  assert.equal(r.executionTimeMs, 100);
  assert.equal(r.success, true);
});

test("records multiple invocations in order", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    { useCaseId: "serena.conversation.reply", systemPrompt: "p1", userPrompt: "u1" },
    { output: "r1", executionTimeMs: 10, success: true }
  );
  await audit.record(
    { useCaseId: "serena.risk.review", systemPrompt: "p2", userPrompt: "u2" },
    { output: "r2", executionTimeMs: 20, success: false, error: "provider error" }
  );
  await audit.record(
    { useCaseId: "serena.mediation.understand_request", systemPrompt: "p3", userPrompt: "u3" },
    { output: "r3", executionTimeMs: 30, success: true }
  );

  const records = audit.getRecords();
  assert.equal(records.length, 3);
  assert.equal(records[0]!.useCaseId, "serena.conversation.reply");
  assert.equal(records[1]!.useCaseId, "serena.risk.review");
  assert.equal(records[2]!.useCaseId, "serena.mediation.understand_request");
});

test("records failed invocation with error", async () => {
  const audit = new InMemoryAiInvocationAudit();

  await audit.record(
    { useCaseId: "serena.risk.review", systemPrompt: "p", userPrompt: "u" },
    { output: "", tokensUsed: 0, executionTimeMs: 500, success: false, error: "timeout" }
  );

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.equal(r.success, false);
  assert.equal(r.error, "timeout");
  assert.equal(r.output, "");
});

test("starts with empty records", () => {
  const audit = new InMemoryAiInvocationAudit();

  const records = audit.getRecords();
  assert.equal(records.length, 0);
});
