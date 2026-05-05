import test from "node:test";
import assert from "node:assert/strict";

import { AiGuideService } from "../application/use-cases/ai-guide-service.ts";
import { UseCaseRegistry } from "../application/use-cases/use-case-registry.ts";
import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
import { InMemoryPromptRegistry } from "../application/prompts/in-memory-prompt-registry.ts";
import { ContextBuilder } from "../application/prompts/context-builder.ts";
import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptId } from "../domain/prompt-id.ts";
import type { GuideResultSuccess } from "../domain/guide-result.ts";
import type { UseCaseContract } from "../domain/use-case-contract.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

const REPLY: PromptId = "serena.conversation.reply.v1";
const RISK: PromptId = "serena.risk.review.v1";
const UNDERSTAND: PromptId = "serena.mediation.understand_request.v1";
const CLARIFY: PromptId = "serena.mediation.clarify.v1";

function makeContract(overrides?: Partial<UseCaseContract>): UseCaseContract {
  return {
    id: "serena.conversation.reply",
    promptId: REPLY,
    executionPolicy: { ...defaultPolicy },
    ...overrides,
  };
}

function setupService() {
  const registry = new UseCaseRegistry();
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const promptRegistry = new InMemoryPromptRegistry(defaultPrompts);
  const contextBuilder = new ContextBuilder();
  const pipeline = new ExecutionPipeline({
    provider,
    audit,
    registry: promptRegistry,
    contextBuilder,
    providerName: "mock",
    configuredModel: "mock-model-v1",
  });
  const service = new AiGuideService({ registry, pipeline });
  return { registry, provider, audit, pipeline, service };
}

test("execute returns success GuideResult for registered use case", async () => {
  const { registry, service } = setupService();
  registry.register(makeContract({ id: "serena.conversation.reply" }));

  const result = await service.execute("serena.conversation.reply", {
    input: "Hello!",
  });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.useCaseId, "serena.conversation.reply");
  assert.ok(typeof success.output === "string");
  assert.ok(success.output.length > 0);
  assert.equal(success.metadata.attempts, 1);
  assert.equal(success.metadata.auditRecorded, true);
  assert.equal(success.metadata.promptId, REPLY);
  assert.equal(success.metadata.promptVersion, 1);
});

test("execute returns success GuideResult for risk review", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.risk.review",
      promptId: RISK,
      executionPolicy: { ...defaultPolicy, temperature: 0.3 },
    })
  );

  const result = await service.execute("serena.risk.review", { input: "I need help" });

  assert.equal(result.status, "success");
  assert.equal(result.useCaseId, "serena.risk.review");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.equal(success.metadata.promptId, RISK);
});

test("execute returns success GuideResult for mediation understanding", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.mediation.understand_request",
      promptId: UNDERSTAND,
    })
  );

  const result = await service.execute(
    "serena.mediation.understand_request",
    { input: "Tell John to call me" }
  );

  assert.equal(result.status, "success");
  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
  assert.equal(success.metadata.promptId, UNDERSTAND);
});

test("execute throws for unregistered use case", async () => {
  const { service } = setupService();

  await assert.rejects(
    () => service.execute("serena.risk.review", { input: "test" }),
    /not registered/
  );
});

test("execute returns success for clarification use case", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.mediation.clarify",
      promptId: CLARIFY,
    })
  );

  const result = await service.execute("serena.mediation.clarify", { input: "Decile algo a alguien" });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.useCaseId, "serena.mediation.clarify");
  assert.equal(success.metadata.promptId, CLARIFY);
  assert.ok(typeof success.output === "string");
  // Clarification output should be JSON with question and reason
  const parsed = JSON.parse(success.output as string);
  assert.ok(typeof parsed.question === "string");
  assert.ok(typeof parsed.reason === "string");
});
