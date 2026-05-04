import test from "node:test";
import assert from "node:assert/strict";

import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import type { PromptDefinition } from "../domain/prompt-definition.ts";

function findPrompt(id: string): PromptDefinition {
  const prompt = defaultPrompts.find((p) => p.id === id);
  if (!prompt) throw new Error(`Prompt not found: ${id}`);
  return prompt;
}

// ── REQ-4 table values ──────────────────────────────────────────────

test("serena.conversation.reply contextPolicy matches MVP values", () => {
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

test("serena.risk.review contextPolicy matches MVP values", () => {
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

test("serena.mediation.understand_request contextPolicy matches MVP values", () => {
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

test("serena.mediation.clarify contextPolicy matches MVP values", () => {
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
    // maxRecentMessages is optional, but all 4 have it defined
    assert.ok(cp.maxRecentMessages !== undefined, `${prompt.id}: maxRecentMessages should be set`);
    assert.equal(typeof cp.maxRecentMessages, "number");
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
