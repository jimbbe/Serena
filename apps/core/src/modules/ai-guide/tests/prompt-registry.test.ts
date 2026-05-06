import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryPromptRegistry } from "../application/prompts/in-memory-prompt-registry.ts";
import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptId } from "../domain/prompt-id.ts";

const ALL_IDS: PromptId[] = [
  "serena.conversation.reply.v1",
  "serena.risk.review.v1",
  "serena.mediation.understand_request.v1",
  "serena.mediation.clarify.v1",
  "serena.inbound.classify_intent.v1",
];

test("register and retrieve each of the 5 prompts by ID", () => {
  const registry = new InMemoryPromptRegistry(defaultPrompts);

  for (const id of ALL_IDS) {
    const prompt = registry.get(id);
    assert.equal(prompt.id, id);
    assert.equal(prompt.version, 1);
    assert.ok(typeof prompt.systemPrompt === "string");
    assert.ok(prompt.systemPrompt.length > 0);
    assert.ok(typeof prompt.useCaseId === "string");
  }
});

test("get unknown prompt throws with promptId in message", () => {
  const registry = new InMemoryPromptRegistry(defaultPrompts);

  const unknownId: PromptId = "serena.conversation.reply.v1"; // actually valid, use a cast
  // We need to test with an invalid string. Since PromptId is a literal union,
  // we assert on the error containing the requested ID.
  assert.throws(
    () => registry.get("serena.nonexistent.v99" as PromptId),
    /serena.nonexistent.v99/
  );
});

test("list returns all 5 prompts", () => {
  const registry = new InMemoryPromptRegistry(defaultPrompts);

  const prompts = registry.list();
  assert.equal(prompts.length, 5);

  const ids = prompts.map((p) => p.id);
  for (const expected of ALL_IDS) {
    assert.ok(ids.includes(expected), `Expected ${expected} in list`);
  }
});

test("duplicate IDs throw on construction", () => {
  const duplicate: typeof defaultPrompts = [
    ...defaultPrompts,
    {
      ...defaultPrompts[0]!,
      // Same ID as the first prompt
    },
  ];

  assert.throws(
    () => new InMemoryPromptRegistry(duplicate),
    /Duplicate prompt ID/
  );
});

test("deterministic behavior: same input → same output", () => {
  const r1 = new InMemoryPromptRegistry(defaultPrompts);
  const r2 = new InMemoryPromptRegistry(defaultPrompts);

  for (const id of ALL_IDS) {
    const p1 = r1.get(id);
    const p2 = r2.get(id);
    assert.deepEqual(p1, p2);
  }
});

test("no external dependencies: works in isolation", () => {
  // Creating and using the registry requires no network, DB, or file I/O
  const registry = new InMemoryPromptRegistry(defaultPrompts);
  const prompt = registry.get("serena.conversation.reply.v1");
  assert.equal(prompt.id, "serena.conversation.reply.v1");
  assert.equal(prompt.version, 1);
});
