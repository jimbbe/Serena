import test from "node:test";
import assert from "node:assert/strict";

import { ContextBuilder } from "../application/prompts/context-builder.ts";
import type { ContextPolicy } from "../domain/context-policy.ts";

const fullPolicy: ContextPolicy = {
  includeCurrentMessage: true,
  includeResolvedIdentity: true,
  includeActorContext: true,
  includeChannelMetadata: true,
  includeConversationHistory: true,
  maxRecentMessages: 3,
  includeKnownContacts: true,
  includeSafetyMemory: true,
  includeFullConversation: false,
  notes: "Test policy",
};

function makeBuilder() {
  return new ContextBuilder();
}

test("builds with all data available", () => {
  const builder = makeBuilder();
  const output = builder.build(fullPolicy, {
    currentMessage: "Hola",
    resolvedIdentity: "Abuela Rosa",
    actorContext: "rol: elder, canal: whatsapp",
    channelMetadata: "WhatsApp",
    recentMessages: ["msg1", "msg2", "msg3", "msg4"],
    knownContacts: ["Carlos", "María"],
    safetyMemory: "No hay riesgos conocidos",
  });

  assert.ok(output.includes("Hola"));
  assert.ok(output.includes("Abuela Rosa"));
  assert.ok(output.includes("rol: elder"));
  assert.ok(output.includes("WhatsApp"));
  assert.ok(output.includes("Carlos"));
  assert.ok(output.includes("María"));
  assert.ok(output.includes("No hay riesgos conocidos"));
  // Only the 3 most recent messages
  assert.ok(output.includes("msg2"));
  assert.ok(output.includes("msg3"));
  assert.ok(output.includes("msg4"));
  assert.ok(!output.includes("msg1"), "msg1 should be excluded by maxRecentMessages=3");
});

test("handles missing optional data (no knownContacts, no safetyMemory)", () => {
  const builder = makeBuilder();
  const output = builder.build(fullPolicy, {
    currentMessage: "Hola",
    recentMessages: ["msg1"],
  });

  assert.ok(output.includes("Hola"));
  // No crash, no contact/safety sections
  assert.ok(!output.includes("Contactos conocidos"));
  assert.ok(!output.includes("Memoria de seguridad"));
});

test("does NOT include full conversation when flag is false", () => {
  const builder = makeBuilder();
  const output = builder.build(
    { ...fullPolicy, includeFullConversation: false },
    { currentMessage: "Hola" }
  );

  assert.ok(!output.includes("[Full conversation history"));
});

test("respects maxRecentMessages limit (only N most recent)", () => {
  const builder = makeBuilder();
  const output = builder.build(
    {
      includeCurrentMessage: false,
      includeResolvedIdentity: false,
      includeActorContext: false,
      includeChannelMetadata: false,
      includeConversationHistory: true,
      maxRecentMessages: 2,
      includeKnownContacts: false,
      includeSafetyMemory: false,
      includeFullConversation: false,
    },
    {
      currentMessage: "",
      recentMessages: ["msg-1-first", "msg-2", "msg-3", "msg-4", "msg-5-last"],
    }
  );

  // Only last 2
  assert.ok(output.includes("msg-4"));
  assert.ok(output.includes("msg-5-last"));
  assert.ok(!output.includes("msg-1-first"));
  assert.ok(!output.includes("msg-2"), "msg-2 should be excluded by maxRecentMessages=2");
  assert.ok(!output.includes("msg-3"), "msg-3 should be excluded by maxRecentMessages=2");
});

test("does not cross tenant boundaries", () => {
  // Phase 1: the builder only receives data for one person at a time.
  // The test verifies that the output contains only the data provided.
  const builder = makeBuilder();
  const output = builder.build(fullPolicy, {
    currentMessage: "Mensaje de persona A",
    resolvedIdentity: "Persona A",
  });

  assert.ok(output.includes("Persona A"));
  // No other person's data can appear since we didn't provide it
  assert.ok(!output.includes("Persona B"));
});

test("handles empty current message gracefully", () => {
  const builder = makeBuilder();
  const policy: ContextPolicy = {
    ...fullPolicy,
    includeResolvedIdentity: false,
    includeChannelMetadata: false,
    includeConversationHistory: false,
    includeKnownContacts: false,
    includeSafetyMemory: false,
  };

  const output = builder.build(policy, {
    currentMessage: "",
  });

  // Should produce empty or minimal output without crashing
  assert.equal(output, "");
});

test("includes actorContext when policy flag is true", () => {
  const builder = makeBuilder();
  const output = builder.build(
    { ...fullPolicy, includeResolvedIdentity: false, includeChannelMetadata: false, includeConversationHistory: false, includeKnownContacts: false, includeSafetyMemory: false },
    { currentMessage: "Hola", actorContext: "rol: elder, canal: simulation" }
  );

  assert.ok(output.includes("rol: elder"));
  assert.ok(output.includes("canal: simulation"));
  assert.ok(output.includes("Contexto del actor"));
});

test("omits actorContext when flag is false", () => {
  const builder = makeBuilder();
  const output = builder.build(
    { ...fullPolicy, includeActorContext: false },
    { currentMessage: "Hola", actorContext: "rol: elder" }
  );

  assert.ok(!output.includes("Contexto del actor"));
  assert.ok(!output.includes("rol: elder"));
});

test("produces plain string output", () => {
  const builder = makeBuilder();
  const output = builder.build(fullPolicy, {
    currentMessage: "Hola",
    resolvedIdentity: "Abuela",
  });

  assert.equal(typeof output, "string");
  assert.ok(output.length > 0);
});

test("renderTemplate replaces placeholders", () => {
  const builder = makeBuilder();

  const result = builder.renderTemplate("User says: {text} in {language}", {
    text: "Hello",
    language: "Spanish",
  });

  assert.equal(result, "User says: Hello in Spanish");
});

test("renderTemplate keeps unmatched placeholders", () => {
  const builder = makeBuilder();

  const result = builder.renderTemplate("User says: {text} at {time}", {
    text: "Hello",
  });

  assert.equal(result, "User says: Hello at {time}");
});
