import test from "node:test";
import assert from "node:assert/strict";

import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import type { PromptId } from "../domain/prompt-id.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

const REPLY: PromptId = "serena.conversation.reply.v1";

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

test("deterministic response for same input", async () => {
  const provider = new MockLlmProvider();

  const result1 = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  const result2 = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  assert.equal(result1.content, result2.content, "Same input should produce same content");
});

test("response includes content as string", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Tell me a joke",
    policy: defaultPolicy,
  });

  assert.ok(typeof result.content === "string");
  assert.ok(result.content.length > 0, "Content should not be empty");
});

test("different promptIds produce different default responses", async () => {
  // Empty Map still gets defaults primed (FIX 4) — different promptIds have different defaults
  const provider = new MockLlmProvider(new Map());

  const reply = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "anything",
    policy: defaultPolicy,
  });

  const risk = await provider.invoke({
    promptId: "serena.risk.review.v1",
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "anything else",
    policy: defaultPolicy,
  });

  assert.notEqual(
    reply.content,
    risk.content,
    "Different promptIds should produce different default responses"
  );
  // REPLY is conversational text; RISK is JSON
  assert.ok(JSON.parse(risk.content), "risk default should be parseable JSON");
});

test("response includes optional metadata", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hi",
    policy: defaultPolicy,
  });

  assert.ok(typeof result.tokensUsed === "number", "tokensUsed should be a number");
  assert.ok(typeof result.modelUsed === "string", "modelUsed should be a string");
  assert.ok(result.modelUsed.length > 0, "modelUsed should not be empty");
});

test("canned responses keyed by promptId, not systemPrompt text", async () => {
  const canned = new Map<PromptId, { content: string; tokensUsed?: number }>();
  canned.set(REPLY, { content: "I am here to help!", tokensUsed: 42 });

  const provider = new MockLlmProvider(canned);

  // Same promptId but different systemPrompt — should still return canned
  const result1 = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "anything",
    policy: defaultPolicy,
  });

  const result2 = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are formal",
    userPrompt: "anything",
    policy: defaultPolicy,
  });

  // Both should return the same canned response because key is promptId
  assert.equal(result1.content, "I am here to help!");
  assert.equal(result1.tokensUsed, 42);
  assert.equal(result2.content, result1.content, "different systemPrompt, same promptId → same canned response");
});

test("default canned response is meaningful content, not simpleHash fallback text", async () => {
  // Empty Map still gets defaults primed (FIX 4) — the default should be real content, not "Mock response for:"
  const provider = new MockLlmProvider(new Map());

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "irrelevant",
    policy: defaultPolicy,
  });

  assert.ok(!result.content.includes("Mock response for"), "default should not be fallback hash");
  assert.ok(result.content.includes("Entendido"), "default reply should be the conversational canned text");
});

test("backward compatibility: unconfigured mock returns deterministic response", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "Some prompt",
    userPrompt: "Test",
    policy: defaultPolicy,
  });

  assert.ok(typeof result.content === "string");
  assert.ok(result.content.length > 0);
  assert.ok(typeof result.tokensUsed === "number");
});

// ── FIX 4: partial Map constructor still seeds defaults for unconfigured prompts ──

test("constructor with partial Map — unconfigured prompts return default canned, not fallback", async () => {
  // Only override conversation.reply, leave other 3 prompts unconfigured
  const canned = new Map<PromptId, { content: string; tokensUsed?: number }>();
  canned.set(REPLY, { content: "Custom reply!", tokensUsed: 99 });

  const provider = new MockLlmProvider(canned);

  // Custom entry wins
  const replyResult = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "irrelevant",
    policy: defaultPolicy,
  });
  assert.equal(replyResult.content, "Custom reply!");
  assert.equal(replyResult.tokensUsed, 99);

  // Unconfigured prompts should get their default canned response, NOT the simpleHash fallback
  const riskResult = await provider.invoke({
    promptId: "serena.risk.review.v1",
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "irrelevant",
    policy: defaultPolicy,
  });
  // Default risk review response is JSON (not a "Mock response for:" string)
  assert.ok(!riskResult.content.includes("Mock response for"));
  const parsed = JSON.parse(riskResult.content);
  assert.ok(typeof parsed.riskLevel === "string", "riskLevel must be present in default response");

  const mediationResult = await provider.invoke({
    promptId: "serena.mediation.understand_request.v1",
    promptVersion: 1,
    systemPrompt: "irrelevant",
    userPrompt: "irrelevant",
    policy: defaultPolicy,
  });
  assert.ok(!mediationResult.content.includes("Mock response for"));
  const mediationParsed = JSON.parse(mediationResult.content);
  assert.ok(typeof mediationParsed.isMediationRequest === "boolean");
});
