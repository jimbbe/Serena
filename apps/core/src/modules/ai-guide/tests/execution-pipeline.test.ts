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
import type { PromptDefinition } from "../domain/prompt-definition.ts";
import type { AiGuideInput } from "../application/use-cases/ai-guide-input.ts";

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

// ── FIX 1: promptVersion parsed from promptId suffix on resolution failure ──

test("resolution failure extracts promptVersion from contract promptId suffix (.v2)", async () => {
  const provider = new MockLlmProvider();
  const emptyRegistry = new InMemoryPromptRegistry([]);
  const pipeline = new ExecutionPipeline({
    provider,
    registry: emptyRegistry,
    contextBuilder: makeContextBuilder(),
  });

  // Use a contract with a .v2 promptId not registered
  const contract = makeContract({
    // promptId must be cast through unknown — the union type only has .v1 members,
    // but this test validates the parser handles any valid .v{N} suffix
    promptId: "serena.conversation.reply.v2" as PromptId,
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.equal(failed.metadata.promptVersion, 2, "must extract version 2 from .v2 suffix, not hardcoded 1");
});

// ── Output contract rendering tests ──────────────────────────────

test("pipeline sends output contract rendered to provider as developerPrompt", async () => {
  let receivedDeveloperPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedDeveloperPrompt = req.developerPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  await pipeline.execute(makeContract(), { input: "Hello" });

  assert.ok(
    receivedDeveloperPrompt !== undefined,
    "developerPrompt must be sent to provider"
  );
  assert.ok(
    receivedDeveloperPrompt!.includes("Contrato de salida"),
    "developerPrompt must contain output contract header"
  );
});

test("understand_request pipeline includes field names in developerPrompt", async () => {
  let receivedDeveloperPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedDeveloperPrompt = req.developerPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  await pipeline.execute(
    makeContract({
      id: "serena.mediation.understand_request",
      promptId: "serena.mediation.understand_request.v1",
    }),
    { input: "Decile a Mari que llego más tarde" }
  );

  assert.ok(receivedDeveloperPrompt !== undefined);
  assert.ok(receivedDeveloperPrompt!.includes("isMediationRequest"));
  assert.ok(receivedDeveloperPrompt!.includes("recipientHint"));
  assert.ok(receivedDeveloperPrompt!.includes("messageDraft"));
  assert.ok(receivedDeveloperPrompt!.includes("missingFields"));
  assert.ok(receivedDeveloperPrompt!.includes("riskSignal"));
  assert.ok(receivedDeveloperPrompt!.includes("recipient"));
  assert.ok(receivedDeveloperPrompt!.includes("message"));
  assert.ok(receivedDeveloperPrompt!.includes("confirmation"));
});

test("risk.review pipeline includes field names and allowedValues in developerPrompt", async () => {
  let receivedDeveloperPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedDeveloperPrompt = req.developerPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  await pipeline.execute(
    makeContract({ id: "serena.risk.review", promptId: "serena.risk.review.v1" }),
    { input: "Me siento mal" }
  );

  assert.ok(receivedDeveloperPrompt !== undefined);
  assert.ok(receivedDeveloperPrompt!.includes("riskLevel"));
  assert.ok(receivedDeveloperPrompt!.includes("riskType"));
  assert.ok(receivedDeveloperPrompt!.includes("recommendedAction"));
  assert.ok(receivedDeveloperPrompt!.includes("low"));
  assert.ok(receivedDeveloperPrompt!.includes("critical"));
  assert.ok(receivedDeveloperPrompt!.includes("notify_contact"));
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

// ── Output contract validation tests (P1) ────────────────────────────

test("provider returns invalid JSON for risk.review → failed", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        return { content: "not json", tokensUsed: 5, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.ok(
    failed.error.message.startsWith("Output contract validation failed:"),
    `Expected validation failure, got: ${failed.error.message}`
  );
  assert.ok(failed.error.message.includes("Invalid JSON"));
  assert.equal(failed.metadata.promptId, "serena.risk.review.v1");
});

test("provider returns JSON missing required field → failed", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        return { content: '{"riskLevel": "low"}', tokensUsed: 3, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.ok(failed.error.message.includes("Missing required field"));
});

test("provider returns invalid enum value → failed", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        return { content: '{"riskLevel": "extreme"}', tokensUsed: 4, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  const failed = result as GuideResultFailed;
  assert.ok(failed.error.message.includes("Invalid value"), `Expected invalid value, got: ${failed.error.message}`);
});

test("provider returns valid JSON → success", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        return {
          content: JSON.stringify({
            riskLevel: "low",
            riskType: "unknown",
            source: "direct",
            situationSummary: "No se detectan riesgos.",
            recommendedAction: "reply",
            requiresEscalation: false,
            missingInformation: [],
          }),
          tokensUsed: 10,
          modelUsed: "mock",
        };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.metadata.promptId, "serena.risk.review.v1");
});

test("validation failure audits success=false with provider output", async () => {
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        return { content: "not valid json", tokensUsed: 7, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
  });

  await pipeline.execute(contract, { input: "test" });

  const records = audit.getRecords();
  assert.equal(records.length, 1);
  const r0 = records[0]!;
  assert.equal(r0.success, false, "audit must record failure");
  assert.equal(r0.output, "not valid json", "audit must preserve provider output for debugging");
  assert.ok(r0.error !== undefined, "audit must contain error message");
});

test("validation failure does NOT retry even with retryOnFailure=true", async () => {
  let callCount = 0;
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke() {
        callCount++;
        return { content: "bad json", tokensUsed: 2, modelUsed: "mock" };
      },
    },
    audit,
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });
  const contract = makeContract({
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
    executionPolicy: { ...defaultPolicy, retryOnFailure: true, maxRetries: 2 },
  });

  const result = await pipeline.execute(contract, { input: "test" });

  assert.equal(result.status, "failed");
  assert.equal(callCount, 1, "validation failure must not retry");
});

// ── T27 — Conversation history wiring tests ──────────────────────────

function makeCustomRegistry(prompts: PromptDefinition[]) {
  return new InMemoryPromptRegistry(prompts);
}

test("recentMessages flows to ContextBuilder when includeConversationHistory is true", async () => {
  let receivedUserPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedUserPrompt = req.userPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  const input: AiGuideInput = {
    input: "current message",
    recentMessages: ["msg1", "msg2", "msg3", "msg4", "msg5"],
  };

  // conversation-reply.v1 has maxRecentMessages=6, so all 5 should appear
  await pipeline.execute(makeContract(), input);

  assert.ok(receivedUserPrompt !== undefined);
  assert.ok(
    receivedUserPrompt!.includes("Historial reciente"),
    "userPrompt must contain history section when recentMessages provided"
  );
  assert.ok(receivedUserPrompt!.includes("msg1"), "must include msg1");
  assert.ok(receivedUserPrompt!.includes("msg5"), "must include msg5");
});

test("recentMessages respects maxRecentMessages limit", async () => {
  let receivedUserPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();

  // Create a custom prompt with maxRecentMessages=3
  const customPrompts: PromptDefinition[] = [
    {
      id: "serena.conversation.reply.v1",
      version: 1,
      useCaseId: "serena.conversation.reply",
      description: "test prompt",
      systemPrompt: "test",
      inputTemplate: "Mensaje: {input}",
      contextPolicy: {
        includeCurrentMessage: true,
        includeResolvedIdentity: false,
        includeActorContext: false,
        includeChannelMetadata: false,
        includeConversationHistory: true,
        maxRecentMessages: 3,
        includeKnownContacts: false,
        includeSafetyMemory: false,
        includeFullConversation: false,
      },
      outputContract: { format: "text", description: "text" },
    },
  ];

  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedUserPrompt = req.userPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeCustomRegistry(customPrompts),
    contextBuilder: makeContextBuilder(),
  });

  const input: AiGuideInput = {
    input: "current msg",
    recentMessages: ["msg1", "msg2", "msg3", "msg4", "msg5"],
  };

  await pipeline.execute(makeContract(), input);

  assert.ok(receivedUserPrompt !== undefined);
  // maxRecentMessages=3 → only the last 3 should appear
  assert.ok(receivedUserPrompt!.includes("msg3"), "must include msg3 (3rd from end)");
  assert.ok(receivedUserPrompt!.includes("msg4"), "must include msg4");
  assert.ok(receivedUserPrompt!.includes("msg5"), "must include msg5");
  assert.ok(!receivedUserPrompt!.includes("msg1"), "must NOT include msg1 (beyond limit)");
  assert.ok(!receivedUserPrompt!.includes("msg2"), "must NOT include msg2 (beyond limit)");
});

test("empty recentMessages does not add history section", async () => {
  let receivedUserPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedUserPrompt = req.userPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  const input: AiGuideInput = {
    input: "hello",
    recentMessages: [],
  };

  await pipeline.execute(makeContract(), input);

  assert.ok(receivedUserPrompt !== undefined);
  assert.ok(
    !receivedUserPrompt!.includes("Historial reciente"),
    "userPrompt must NOT contain history section when recentMessages is empty"
  );
});

test("currentMessage appears even with recentMessages present", async () => {
  let receivedUserPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedUserPrompt = req.userPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  const input: AiGuideInput = {
    input: "current msg",
    recentMessages: ["history msg"],
  };

  await pipeline.execute(makeContract(), input);

  assert.ok(receivedUserPrompt !== undefined);
  assert.ok(
    receivedUserPrompt!.includes("current msg"),
    "userPrompt must contain the current message"
  );
  assert.ok(
    receivedUserPrompt!.includes("history msg"),
    "userPrompt must contain history messages"
  );
});

test("renderTemplate does not break with array fields in input", async () => {
  let receivedUserPrompt: string | undefined;
  const mockProvider = new MockLlmProvider();
  const pipeline = new ExecutionPipeline({
    provider: {
      async invoke(req) {
        receivedUserPrompt = req.userPrompt;
        return mockProvider.invoke(req);
      },
    },
    registry: makeRegistry(),
    contextBuilder: makeContextBuilder(),
  });

  const input: AiGuideInput = {
    input: "hello world",
    recentMessages: ["test"],
  };

  await pipeline.execute(makeContract(), input);

  assert.ok(receivedUserPrompt !== undefined);
  assert.ok(
    receivedUserPrompt!.includes("hello world"),
    "template must render correctly even with array fields present"
  );
  // Template uses {input} placeholder — the rendered output should contain the input value
  assert.ok(
    !receivedUserPrompt!.includes("recentMessages"),
    "array field names must not leak into template output"
  );
});
