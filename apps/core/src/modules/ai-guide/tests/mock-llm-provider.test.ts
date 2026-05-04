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

test("different input produces different response", async () => {
  // Use empty Map to bypass default canned responses and test fallback behavior
  const provider = new MockLlmProvider(new Map());

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
    userPrompt: "Goodbye",
    policy: defaultPolicy,
  });

  assert.notEqual(result1.content, result2.content, "Different inputs should produce different outputs");
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

test("mock fallback uses promptId + userPrompt hash (not systemPrompt)", async () => {
  // Use empty Map to bypass default canned responses
  const provider = new MockLlmProvider(new Map());

  const result = await provider.invoke({
    promptId: REPLY,
    promptVersion: 1,
    systemPrompt: "You are helpful",
    userPrompt: "Hi",
    policy: defaultPolicy,
  });

  assert.ok(result.content.includes("Mock response for"));
  assert.ok(result.content.includes("hash"));
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
