import test from "node:test";
import assert from "node:assert/strict";

import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptDefinition } from "../domain/prompt-definition.ts";

function findPrompt(id: string): PromptDefinition {
  const prompt = defaultPrompts.find((p) => p.id === id);
  if (!prompt) throw new Error(`Prompt not found: ${id}`);
  return prompt;
}

// ── Phase 1 policy values (history active, mediation contacts active, no safety) ──────

test("serena.conversation.reply contextPolicy matches Phase 1 values", () => {
  const cp = findPrompt("serena.conversation.reply.v1").contextPolicy;

  assert.equal(cp.includeCurrentMessage, true);
  assert.equal(cp.includeResolvedIdentity, true);
  assert.equal(cp.includeActorContext, true);
  assert.equal(cp.includeChannelMetadata, true);
  assert.equal(cp.includeConversationHistory, true);
  assert.equal(cp.maxRecentMessages, 6);
  assert.equal(cp.includeKnownContacts, false);
  assert.equal(cp.includeSafetyMemory, false);
  assert.equal(cp.includeFullConversation, false);
});

test("serena.risk.review contextPolicy matches Phase 1 values", () => {
  const cp = findPrompt("serena.risk.review.v1").contextPolicy;

  assert.equal(cp.includeCurrentMessage, true);
  assert.equal(cp.includeResolvedIdentity, true);
  assert.equal(cp.includeActorContext, true);
  assert.equal(cp.includeChannelMetadata, true);
  assert.equal(cp.includeConversationHistory, true);
  assert.equal(cp.maxRecentMessages, 5);
  assert.equal(cp.includeKnownContacts, false);
  assert.equal(cp.includeSafetyMemory, false);
  assert.equal(cp.includeFullConversation, false);
});

test("serena.mediation.understand_request contextPolicy matches T28 values", () => {
  const cp = findPrompt("serena.mediation.understand_request.v1").contextPolicy;

  assert.equal(cp.includeCurrentMessage, true);
  assert.equal(cp.includeResolvedIdentity, true);
  assert.equal(cp.includeActorContext, true);
  assert.equal(cp.includeChannelMetadata, true);
  assert.equal(cp.includeConversationHistory, true);
  assert.equal(cp.maxRecentMessages, 4);
  assert.equal(cp.includeKnownContacts, true);
  assert.equal(cp.includeSafetyMemory, false);
  assert.equal(cp.includeFullConversation, false);
});

test("serena.mediation.clarify contextPolicy matches T28 values", () => {
  const cp = findPrompt("serena.mediation.clarify.v1").contextPolicy;

  assert.equal(cp.includeCurrentMessage, true);
  assert.equal(cp.includeResolvedIdentity, true);
  assert.equal(cp.includeActorContext, true);
  assert.equal(cp.includeChannelMetadata, false);
  assert.equal(cp.includeConversationHistory, true);
  assert.equal(cp.maxRecentMessages, 3);
  assert.equal(cp.includeKnownContacts, true);
  assert.equal(cp.includeSafetyMemory, false);
  assert.equal(cp.includeFullConversation, false);
});

// ── Guard tests: conversation history is now active ──────────────────

test("guard: 4 prompts have includeConversationHistory=true, others may differ", () => {
  const activePrompts = new Set([
    "serena.conversation.reply.v1",
    "serena.risk.review.v1",
    "serena.mediation.understand_request.v1",
    "serena.mediation.clarify.v1",
  ]);

  const maxRecentValues: Record<string, number> = {
    "serena.conversation.reply.v1": 6,
    "serena.risk.review.v1": 5,
    "serena.mediation.understand_request.v1": 4,
    "serena.mediation.clarify.v1": 3,
  };

  for (const prompt of defaultPrompts) {
    if (activePrompts.has(prompt.id)) {
      assert.equal(
        prompt.contextPolicy.includeConversationHistory,
        true,
        `${prompt.id}: includeConversationHistory must be true — T27 wires recentMessages into ExecutionPipeline`
      );
      assert.equal(
        prompt.contextPolicy.maxRecentMessages,
        maxRecentValues[prompt.id],
        `${prompt.id}: maxRecentMessages must be ${maxRecentValues[prompt.id]}`
      );
    }
  }
});

test("guard: mediation prompts have includeKnownContacts=true, others remain false", () => {
  const mediationPrompts = new Set([
    "serena.mediation.understand_request.v1",
    "serena.mediation.clarify.v1",
  ]);
  for (const prompt of defaultPrompts) {
    if (mediationPrompts.has(prompt.id)) {
      assert.equal(
        prompt.contextPolicy.includeKnownContacts,
        true,
        `${prompt.id}: includeKnownContacts must be true — T28 wires known contacts for mediation`
      );
    } else {
      assert.equal(
        prompt.contextPolicy.includeKnownContacts,
        false,
        `${prompt.id}: includeKnownContacts must remain false — only mediation prompts enable it`
      );
    }
  }
});

// ── Global properties ───────────────────────────────────────────────

test("includeFullConversation is false for all use cases", () => {
  for (const prompt of defaultPrompts) {
    assert.equal(
      prompt.contextPolicy.includeFullConversation,
      false,
      `${prompt.id}: includeFullConversation must be false in Phase 1`
    );
  }
});

test("all context policies have valid structure", () => {
  for (const prompt of defaultPrompts) {
    const cp = prompt.contextPolicy;
    assert.equal(typeof cp.includeCurrentMessage, "boolean");
    assert.equal(typeof cp.includeResolvedIdentity, "boolean");
    assert.equal(typeof cp.includeActorContext, "boolean");
    assert.equal(typeof cp.includeChannelMetadata, "boolean");
    assert.equal(typeof cp.includeConversationHistory, "boolean");
    assert.equal(typeof cp.includeKnownContacts, "boolean");
    assert.equal(typeof cp.includeSafetyMemory, "boolean");
    assert.equal(typeof cp.includeFullConversation, "boolean");
  }
});

// ── Output contract tests ───────────────────────────────────────────

test("conversation.reply uses text output", () => {
  const prompt = findPrompt("serena.conversation.reply.v1");
  assert.equal(prompt.outputContract.format, "text");
});

test("risk.review, mediation.understand_request, mediation.clarify use json output", () => {
  const jsonPrompts = [
    "serena.risk.review.v1",
    "serena.mediation.understand_request.v1",
    "serena.mediation.clarify.v1",
  ];
  for (const id of jsonPrompts) {
    const prompt = findPrompt(id);
    assert.equal(
      prompt.outputContract.format,
      "json",
      `${id}: expected JSON output`
    );
  }
});

test("all JSON prompts have strict: true", () => {
  const jsonPrompts = [
    "serena.risk.review.v1",
    "serena.mediation.understand_request.v1",
    "serena.mediation.clarify.v1",
  ];
  for (const id of jsonPrompts) {
    const prompt = findPrompt(id);
    assert.equal(
      prompt.outputContract.format,
      "json",
      `${id}: expected JSON output`
    );
    if (prompt.outputContract.format === "json") {
      assert.equal(
        prompt.outputContract.strict,
        true,
        `${id}: strict must be true for JSON output prompts`
      );
    }
  }
});

// ── Safety notes tests ──────────────────────────────────────────────

test("conversation.reply and risk.review have safetyNotes", () => {
  const reply = findPrompt("serena.conversation.reply.v1");
  const risk = findPrompt("serena.risk.review.v1");

  assert.ok(reply.safetyNotes !== undefined);
  assert.ok(reply.safetyNotes!.length > 0);
  assert.ok(risk.safetyNotes !== undefined);
  assert.ok(risk.safetyNotes!.length > 0);
});

test("mediation.understand_request.v1 has safetyNotes", () => {
  const prompt = findPrompt("serena.mediation.understand_request.v1");
  assert.ok(prompt.safetyNotes !== undefined);
  assert.ok(prompt.safetyNotes!.length > 0);
});
