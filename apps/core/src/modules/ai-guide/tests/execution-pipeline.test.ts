import test from "node:test";
import assert from "node:assert/strict";

import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
import { InMemoryPromptRegistry } from "../application/prompts/in-memory-prompt-registry.ts";
import { ContextBuilder } from "../application/prompts/context-builder.ts";
import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptId } from "../domain/prompt-id.ts";
import type { GuideResultSuccess, GuideResultFailed } from "../domain/guide-result.ts";
import type { UseCaseContract } from "../domain/use-case-contract.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

const REPLY: PromptId = "serena.conversation.reply.v1";

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
    promptId: REPLY,
    executionPolicy: { ...defaultPolicy },
    ...overrides,
  };
}

function makeRegistry() {
  return new InMemoryPromptRegistry(defaultPrompts);
}

function makeContextBuilder() {
  return new ContextBuilder();
}

// ── Success path tests ──────────────────────────────────────────────

test("successful execution returns status=success with output and audit metadata", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "Hello!" });

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
  assert.equal(success.metadata.promptId, REPLY);
  assert.equal(success.metadata.promptVersion, 1);
});

test("pipeline builds user prompt via ContextBuilder", async () => {
  const provider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "Hello" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.ok((success.output as string).length > 0);
});

test("pipeline records audit with promptId and promptVersion", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "Hello" });

  assert.equal(result.status, "success");
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r0 = records[0]!;
  assert.equal(r0.useCaseId, "serena.conversation.reply");
  assert.equal(r0.success, true);
  assert.equal(r0.promptId, REPLY);
  assert.equal(r0.promptVersion, 1);
});

// ── Failure path tests ──────────────────────────────────────────────

test("empty provider result returns status=failed (not output in success)", async () => {
  const canned = new Map<PromptId, { content: string; tokensUsed?: number }>();
  canned.set(REPLY, { content: "" });
  const provider = new MockLlmProvider(canned);
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed", "must be failed, not success");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Empty result from provider");
  assert.ok(!("output" in failed && failed.output !== undefined), "no output field in failed result");
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist for failed result");
  assert.equal(failed.metadata.promptId, REPLY);
  assert.equal(failed.metadata.promptVersion, 1);
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.success, false);
});

test("provider error without retry returns status=failed with error.message", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() { throw new Error("Provider connection failed"); },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({ executionPolicy: { ...defaultPolicy, retryOnFailure: false } });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Provider connection failed");
  assert.equal(failed.metadata.attempts, 1);
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist");
  assert.ok(!("output" in failed), "failed result must not have an output field");
  assert.equal(failed.metadata.promptId, REPLY);
  assert.equal(failed.metadata.promptVersion, 1);

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.success, false);
  assert.equal(records[0]!.error, "Provider connection failed");
});

test("provider error with retry that succeeds returns status=success", async () => {
  let callCount = 0;
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        callCount++;
        if (callCount === 1) throw new Error("Temporary failure");
        return { content: "Success on retry!", tokensUsed: 10, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "success", "must succeed after retry");
  const success = result as GuideResultSuccess;
  assert.equal(success.output, "Success on retry!");
  assert.equal(success.metadata.attempts, 2);
  assert.equal(success.metadata.promptId, REPLY);
  assert.equal(success.metadata.promptVersion, 1);
  assert.equal(callCount, 2);

  const records = audit.getRecords();
  assert.equal(records.length, 2);
  assert.equal(records[0]!.success, false, "first record: failure");
  assert.equal(records[1]!.success, true, "second record: success");
});

test("provider error exhausts retries: returns status=failed with error, no output, audit recorded", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() { throw new Error("Persistent failure"); },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed", "must be failed after exhausting retries");
  const failed = result as GuideResultFailed;
  assert.equal(failed.error.message, "Persistent failure");
  assert.equal(failed.metadata.attempts, 3);
  assert.equal(failed.metadata.auditRecorded, true);
  assert.ok(failed.metadata.auditId, "auditId must exist");
  assert.ok(!("output" in failed), "failed result must not masquerade error as output");
  assert.equal(failed.metadata.promptId, REPLY);
  assert.equal(failed.metadata.promptVersion, 1);

  const records = audit.getRecords();
  assert.equal(records.length, 3, "all 3 attempts must be audited");
  for (const r of records) {
    assert.equal(r.success, false);
    assert.equal(r.error, "Persistent failure");
  }
});

// ── Audit resilience test ───────────────────────────────────────────

test("audit failure does not crash pipeline — returns auditRecorded=false", async () => {
  const provider = new MockLlmProvider();
  const audit = {
    async record() { throw new Error("Audit storage failure"); },
  };
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.ok(success.output.length > 0);
  assert.equal(success.metadata.auditRecorded, false);
  assert.equal(success.metadata.auditId, undefined);
  assert.equal(success.metadata.promptId, REPLY);
});

// ── Registry resolution test ───────────────────────────────────────

test("pipeline fails when prompt not in registry", async () => {
  const provider = new MockLlmProvider();
  const emptyRegistry = new InMemoryPromptRegistry([]);
  const pipeline = new ExecutionPipeline({
    provider,
    registry: emptyRegistry,
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.ok(
    failed.error.message.includes("Prompt resolution failed"),
    `Expected prompt resolution error, got: ${failed.error.message}`
  );
});

// ── Type narrowing convenience tests ────────────────────────────────

test("discriminated union narrows correctly via status check", async () => {
  const provider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "test" });

  if (result.status === "success") {
    assert.ok(typeof result.output !== "undefined");
    assert.equal(result.metadata.provider, "mock");
    assert.equal(result.metadata.promptId, REPLY);
  } else {
    assert.fail("successful mock provider should not return failed");
  }
});

test("failed result narrows correctly", async () => {
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() { throw new Error("Boom"); },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { input: "test" });

  if (result.status === "failed") {
    assert.equal(result.error.message, "Boom");
    assert.equal(result.metadata.promptId, REPLY);
  } else {
    assert.fail("failing provider should return failed");
  }
});
