import test from "node:test";
import assert from "node:assert/strict";

import { AiGuideService } from "../application/use-cases/ai-guide-service.ts";
import { UseCaseRegistry } from "../application/use-cases/use-case-registry.ts";
import { ExecutionPipeline } from "../application/use-cases/execution-pipeline.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import { InMemoryAiInvocationAudit } from "../infrastructure/memory/in-memory-ai-invocation-audit.ts";
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

function makeContract(overrides?: Partial<UseCaseContract>): UseCaseContract {
  return {
    id: "serena.conversation.reply",
    systemPrompt: "You are Serena.",
    inputTemplate: "User: {text}",
    outputSchemaName: "text",
    executionPolicy: { ...defaultPolicy },
    ...overrides,
  };
}

function setupService() {
  const registry = new UseCaseRegistry();
  const provider = new MockLlmProvider();
  const audit = new InMemoryAiInvocationAudit();
  const pipeline = new ExecutionPipeline({ provider, audit });
  const service = new AiGuideService({ registry, pipeline });
  return { registry, provider, audit, pipeline, service };
}

test("execute returns success GuideResult for registered use case", async () => {
  const { registry, service } = setupService();
  registry.register(makeContract({ id: "serena.conversation.reply" }));

  const result = await service.execute("serena.conversation.reply", {
    text: "Hello!",
  });

  assert.equal(result.status, "success");
  const success = result as GuideResultSuccess;
  assert.equal(success.useCaseId, "serena.conversation.reply");
  assert.ok(typeof success.output === "string");
  assert.ok(success.output.length > 0);
  assert.equal(success.metadata.attempts, 1);
  assert.equal(success.metadata.auditRecorded, true);
});

test("execute returns success GuideResult for risk review", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.risk.review",
      systemPrompt: "Assess risk.",
      executionPolicy: { ...defaultPolicy, temperature: 0.3 },
    })
  );

  const result = await service.execute("serena.risk.review", { text: "I need help" });

  assert.equal(result.status, "success");
  assert.equal(result.useCaseId, "serena.risk.review");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
});

test("execute returns success GuideResult for mediation understanding", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.mediation.understand_request",
      systemPrompt: "Understand the mediation request.",
    })
  );

  const result = await service.execute(
    "serena.mediation.understand_request",
    { text: "Tell John to call me" }
  );

  assert.equal(result.status, "success");
  assert.equal(result.useCaseId, "serena.mediation.understand_request");
  const success = result as GuideResultSuccess;
  assert.ok(typeof success.output === "string");
});

test("execute throws for unregistered use case", async () => {
  const { service } = setupService();

  await assert.rejects(
    () => service.execute("serena.risk.review", { text: "test" }),
    /not registered/
  );
});

test("execute throws NotImplementedError for clarification", async () => {
  const { registry, service } = setupService();
  registry.register(
    makeContract({
      id: "serena.mediation.clarify",
      systemPrompt: "Clarify the request.",
    })
  );

  await assert.rejects(
    () => service.execute("serena.mediation.clarify", { text: "test" }),
    /not implemented/i
  );
});

test("execute throws for clarification even without a registered contract", async () => {
  const { service } = setupService();

  await assert.rejects(
    () => service.execute("serena.mediation.clarify", { text: "test" }),
    /not implemented/i
  );
});
