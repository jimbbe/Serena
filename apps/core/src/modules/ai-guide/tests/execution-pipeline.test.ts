import test from "node:test";
import assert from "node:assert/strict";

import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
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

test("successful pipeline execution returns GuideResult", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "Hello!" });

  assert.equal(result.useCaseId, "serena.conversation.reply");
  assert.ok(typeof result.output === "string");
  assert.ok((result.output as string).length > 0, "Output should not be empty");
  assert.ok(typeof result.metadata.executionTimeMs === "number");
  assert.ok(result.metadata.executionTimeMs >= 0);
  assert.equal(result.metadata.retryCount, 0);
  assert.equal(result.audited, true);
});

test("pipeline interpolates input template", async () => {
  const provider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract({
    inputTemplate: "Translate: {text} into {language}",
  });

  // The provider will see the rendered user prompt;
  // we verify the pipeline doesn't crash and returns a result
  const result = await pipeline.execute(contract, {
    text: "Hello",
    language: "Spanish",
  });

  assert.ok(typeof result.output === "string");
  assert.ok((result.output as string).length > 0);
});

test("pipeline records audit after successful execution", async () => {
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  await pipeline.execute(contract, { text: "Hello" });

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r0 = records[0]!;
  assert.equal(r0.useCaseId, "serena.conversation.reply");
  assert.equal(r0.success, true);
});

test("empty provider result throws", async () => {
  // Use canned responses to force empty output
  const canned = new Map();
  canned.set("You are Serena, a companion.", { content: "" });
  const provider = new MockLlmProvider(canned);
  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract();

  await assert.rejects(
    () => pipeline.execute(contract, { text: "test" }),
    /empty/i
  );
});

test("provider error without retry returns failed result", async () => {
  const provider: MockLlmProvider = {
    invoke: () => {
      throw new Error("Provider connection failed");
    },
  } as unknown as MockLlmProvider;

  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract({ executionPolicy: { ...defaultPolicy, retryOnFailure: false } });

  const result = await pipeline.execute(contract, { text: "test" });

  assert.equal(result.audited, false);
  assert.equal(result.metadata.retryCount, 0);
  // Output should be error message or empty
  assert.ok(typeof result.output === "string");

  // Verify audit recorded failure
  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.equal(r.success, false);
});

test("provider error with retry that succeeds", async () => {
  let callCount = 0;
  const provider = {
    async invoke(_input: {
      systemPrompt: string;
      userPrompt: string;
      policy: ExecutionPolicy;
    }) {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary failure");
      }
      return { content: "Success on retry!", tokensUsed: 10, modelUsed: "mock" };
    },
  };

  const pipeline = new ExecutionPipeline({ provider });
  const contract = makeContract({
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { text: "test" });

  assert.equal(result.audited, false, "audited is false when no audit port configured");
  assert.equal(result.metadata.retryCount, 1);
  assert.equal(result.output, "Success on retry!");
  assert.equal(callCount, 2);
});

test("provider error exhausts retries", async () => {
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

  assert.equal(result.metadata.retryCount, 2); // maxRetries = 2, all exhausted
  assert.equal(result.audited, false);
  assert.ok(typeof result.output === "string");

  // Audit should record the last failure
  const records = audit.getRecords();
  assert.ok(records.length >= 1);
  const lastRecord = records[records.length - 1];
  if (lastRecord) {
    assert.equal(lastRecord.success, false);
  }
});

test("audit failure does not crash pipeline", async () => {
  const provider = new MockLlmProvider();
  const audit = {
    async record() {
      throw new Error("Audit storage failure");
    },
  };
  const pipeline = new ExecutionPipeline({ provider, audit });
  const contract = makeContract();

  const result = await pipeline.execute(contract, { text: "test" });

  // Pipeline should still return a result even though audit failed
  assert.ok(typeof result.output === "string");
  assert.ok(result.output.length > 0);
  // audited should be false because audit threw
  assert.equal(result.audited, false);
});
