import test from "node:test";
import assert from "node:assert/strict";

import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
import type { GuideResultSuccess, GuideResultFailed } from "../domain/guide-result.ts";
import type { UseCaseContract } from "../domain/use-case-contract.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

function makeContract(overrides?: Partial<UseCaseContract>): UseCaseContract {
  return {
    id: "serena.conversation.reply",
    systemPrompt: "You are Serena, a companion.",
    inputTemplate: "User says: {text}",
    outputSchemaName: "text",
    executionPolicy: { ...defaultPolicy },
    ...overrides,
  };
}

// ── Success path tests ──────────────────────────────────────────────

test("successful execution returns status=success with output and audit metadata", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "Hello!" });

  assert.equal(result.status, "success", "status must be success");
  const success = result as GuideResultSuccess;
  assert.equal(success.useCaseId, "serena.conversation.reply");
  assert.ok(typeof success.output === "string", "output must be a string");
  assert.ok((success.output as string).length > 0, "output must not be empty");
  assert.equal(success.metadata.provider, "mock");
  assert.equal(success.metadata.model, "mock-model-v1");
  assert.equal(success.metadata.attempts, 1);
  assert.equal(success.metadata.auditRecorded, true, "audit must be recorded");
  assert.ok(typeof success.metadata.auditId === "string", "auditId must exist");
  assert.ok(success.metadata.auditId!.startsWith("audit-"), "auditId format");
});

test("pipeline interpolates input template", async () => {
  const provider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract({
    inputTemplate: "Translate: {text} into {language}",
  });

  const result = await pipeline.execute(contract, {
    text: "Hello",
    language: "Spanish",
  });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.ok((success.output as string).length > 0);
});

test("pipeline records audit after successful execution", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "Hello" });

  assert.equal(result.status, "success");
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r0 = records[0]!;
  assert.equal(r0.useCaseId, "serena.conversation.reply");
  assert.equal(r0.success, true);
});

// ── Failure path tests ──────────────────────────────────────────────

test("empty provider result returns status=failed (not output in success)", async () => {
  const canned = new Map();
  canned.set("You are Serena, a companion.", { content: "" });
  const provider = new MockLlmProvider(canned);
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "test" });

  assert.equal(result.status, "failed", "must be failed, not success");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Empty result from provider");
  assert.ok(!("output" in failed && failed.output !== undefined), "no output field in failed result");
  // Audit should be recorded for the failure
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist for failed result");
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.success, false);
});

test("provider error without retry returns status=failed with error.message", async () => {
  const provider = {
    invoke: () => {
      throw new Error("Provider connection failed");
    },
  };

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract({ executionPolicy: { ...defaultPolicy, retryOnFailure: false } });

  const result = await pipeline.execute(contract, { text: "test" });

  // Must be failed, NOT success with error.message as output
  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Provider connection failed");
  assert.equal(failed.metadata.attempts, 1);
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist");

  // No output field on failure
  assert.ok(
    !("output" in failed),
    "failed result must not have an output field"
  );

  // Verify audit recorded the failure
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.equal(r.success, false);
  assert.equal(r.error, "Provider connection failed");
});

test("provider error with retry that succeeds returns status=success", async () => {
  let callCount = 0;
  const provider = {
    async invoke() {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary failure");
      }
      return { content: "Success on retry!", tokensUsed: 10, modelUsed: "mock" };
    },
  };

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract({
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { text: "test" });

  assert.equal(result.status, "success", "must succeed after retry");
  const success = result as GuideResultSuccess;
  assert.equal(success.output, "Success on retry!");
  assert.equal(success.metadata.attempts, 2, "2 attempts (1 failure + 1 success)");
  assert.equal(callCount, 2);

  // Audit should have 2 records: 1 failure + 1 success
  const records = audit.getRecords();
  assert.equal(records.length, 2);
  assert.equal(records[0]!.success, false, "first record: failure");
  assert.equal(records[1]!.success, true, "second record: success");
});

test("provider error exhausts retries: returns status=failed with error, no output, audit recorded", async () => {
  const provider = {
    async invoke() {
      throw new Error("Persistent failure");
    },
  };

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract({
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { text: "test" });

  // Assert it's a proper failure, not success with error.message as output
  assert.equal(result.status, "failed", "must be failed after exhausting retries");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Persistent failure");
  assert.equal(failed.metadata.attempts, 3, "3 attempts (1 initial + 2 retries)");
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist");

  // Critically: NO output field — the error must NOT be a valid output
  assert.ok(
    !("output" in failed),
    "failed result must not masquerade error as output"
  );

  // All 3 attempts should be audited as failures
  const records = audit.getRecords();
  assert.equal(records.length, 3, "all 3 attempts must be audited");
  for (const r of records) {
    assert.equal(r.success, false, "each record must be a failure");
    assert.equal(r.error, "Persistent failure");
  }
});

// ── Audit resilience test ───────────────────────────────────────────

test("audit failure does not crash pipeline — returns auditRecorded=false", async () => {
  const provider = new MockLlmProvider();
  const audit = {
    async record() {
      throw new Error("Audit storage failure");
    },
  };
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "test" });

  // Pipeline must succeed even if audit fails
  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.ok(success.output.length > 0);
  assert.equal(success.metadata.auditRecorded, false, "audit failed so recorded=false");
  assert.equal(success.metadata.auditId, undefined, "no auditId when audit fails");
});

// ── Type narrowing convenience test ─────────────────────────────────

test("discriminated union narrows correctly via status check", async () => {
  const provider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "test" });

  // TypeScript narrowing: after checking status, access typed fields
  if (result.status === "success") {
    assert.ok(typeof result.output !== "undefined");
    assert.equal(result.metadata.provider, "mock");
  } else {
    // Should not reach here for mock provider
    assert.fail("successful mock provider should not return failed");
  }
});

test("failed result narrows correctly", async () => {
  const provider = {
    async invoke() {
      throw new Error("Boom");
    },
  };
  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "test" });

  if (result.status === "failed") {
    assert.equal(result.error.message, "Boom");
    // TypeScript should know output is not accessible here
  } else {
    assert.fail("failing provider should return failed");
  }
});
