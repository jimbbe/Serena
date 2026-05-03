import test from "node:test";
import assert from "node:assert/strict";

import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

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
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  const result2 = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  assert.equal(result1.content, result2.content, "Same input should produce same content");
});

test("response includes content as string", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "Tell me a joke",
    policy: defaultPolicy,
  });

  assert.ok(typeof result.content === "string");
  assert.ok(result.content.length > 0, "Content should not be empty");
});

test("different input produces different response", async () => {
  const provider = new MockLlmProvider();

  const result1 = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "Hello",
    policy: defaultPolicy,
  });

  const result2 = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "Goodbye",
    policy: defaultPolicy,
  });

  assert.notEqual(result1.content, result2.content, "Different inputs should produce different outputs");
});

test("response includes optional metadata", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "Hi",
    policy: defaultPolicy,
  });

  assert.ok(typeof result.tokensUsed === "number", "tokensUsed should be a number");
  assert.ok(typeof result.modelUsed === "string", "modelUsed should be a string");
  assert.ok(result.modelUsed.length > 0, "modelUsed should not be empty");
});

test("configurable canned responses by systemPrompt", async () => {
  const cannedResponses = new Map<string, { content: string; tokensUsed?: number }>();
  cannedResponses.set("You are helpful", { content: "I am here to help!", tokensUsed: 42 });
  cannedResponses.set("You are formal", { content: "Greetings. How may I assist?", tokensUsed: 30 });

  const provider = new MockLlmProvider(cannedResponses);

  const result1 = await provider.invoke({
    systemPrompt: "You are helpful",
    userPrompt: "anything",
    policy: defaultPolicy,
  });

  const result2 = await provider.invoke({
    systemPrompt: "You are formal",
    userPrompt: "anything",
    policy: defaultPolicy,
  });

  assert.equal(result1.content, "I am here to help!");
  assert.equal(result1.tokensUsed, 42);
  assert.equal(result2.content, "Greetings. How may I assist?");
  assert.equal(result2.tokensUsed, 30);
});
