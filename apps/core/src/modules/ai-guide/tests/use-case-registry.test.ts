import test from "node:test";
import assert from "node:assert/strict";

import { UseCaseRegistry } from "../application/use-cases/use-case-registry.ts";
import type { UseCaseContract } from "../domain/use-case-contract.ts";
import type { GuideUseCaseId } from "../domain/guide-use-case-id.ts";

function makeContract(
  id: GuideUseCaseId,
  overrides?: Partial<UseCaseContract>
): UseCaseContract {
  return {
    id,
    systemPrompt: `System prompt for ${id}`,
    inputTemplate: `Template: {input}`,
    outputSchemaName: "text",
    executionPolicy: {
      maxTokens: 256,
      temperature: 0.7,
      retryOnFailure: false,
      maxRetries: 0,
      timeoutMs: 10000,
    },
    ...overrides,
  };
}

test("register and retrieve a contract", () => {
  const registry = new UseCaseRegistry();
  const contract = makeContract("serena.conversation.reply");

  registry.register(contract);
  const retrieved = registry.get("serena.conversation.reply");

  assert.ok(retrieved !== undefined, "Expected contract to be retrieved");
  if (retrieved) {
    assert.equal(retrieved.id, "serena.conversation.reply");
    assert.equal(retrieved.systemPrompt, contract.systemPrompt);
    assert.equal(retrieved.inputTemplate, contract.inputTemplate);
    assert.equal(retrieved.outputSchemaName, contract.outputSchemaName);
    assert.equal(retrieved.executionPolicy.maxTokens, 256);
  }
});

test("get returns undefined for unregistered contract", () => {
  const registry = new UseCaseRegistry();

  const result = registry.get("serena.risk.review");

  assert.equal(result, undefined);
});

test("register duplicate contract throws", () => {
  const registry = new UseCaseRegistry();
  const contract = makeContract("serena.conversation.reply");

  registry.register(contract);

  assert.throws(() => {
    registry.register(contract);
  }, /already registered/);
});

test("getAll returns all registered contracts", () => {
  const registry = new UseCaseRegistry();
  const c1 = makeContract("serena.conversation.reply");
  const c2 = makeContract("serena.risk.review");

  registry.register(c1);
  registry.register(c2);

  const all = registry.getAll();

  assert.equal(all.length, 2);
  const ids = all.map((c) => c.id);
  assert.ok(ids.includes("serena.conversation.reply"));
  assert.ok(ids.includes("serena.risk.review"));
});

test("getAll returns empty array for empty registry", () => {
  const registry = new UseCaseRegistry();

  const all = registry.getAll();

  assert.equal(all.length, 0);
});
