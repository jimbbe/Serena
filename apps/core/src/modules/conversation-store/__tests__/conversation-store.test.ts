/**
 * T22 — Unit tests for InMemoryConversationStore.
 *
 * Tests all ConversationStore port methods: findOrCreate, get, append,
 * list, and edge cases.
 *
 * Uses node:test + node:assert/strict (zero external deps).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryConversationStore } from "../adapter/in-memory-conversation-store.ts";
import type { ConversationMessage } from "../domain/conversation-message.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides?: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    tenantId: "demo",
    personId: "person-1",
    channel: "whatsapp",
    direction: "inbound",
    text: "hello",
    occurredAt: new Date("2025-01-15T10:30:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("findOrCreate creates new conversation when no id provided", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  assert.equal(typeof conv.id, "string");
  assert.ok(conv.id.length > 0);
  assert.equal(conv.tenantId, "demo");
  assert.equal(conv.personId, "person-1");
  assert.equal(conv.status, "open");
  assert.ok(conv.createdAt instanceof Date);
  assert.ok(conv.updatedAt instanceof Date);
  assert.equal(conv.createdAt.getTime(), conv.updatedAt.getTime());
});

test("findOrCreate reuses existing conversation when valid id provided", async () => {
  const store = new InMemoryConversationStore();

  const first = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  const second = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
    conversationId: first.id,
  });

  assert.equal(second.id, first.id);
  assert.equal(second.tenantId, "demo");
  assert.equal(second.personId, "person-1");
  // updatedAt should be newer when reusing
  assert.ok(second.updatedAt.getTime() >= first.updatedAt.getTime());
});

test("findOrCreate with unknown id creates new conversation", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
    conversationId: "nonexistent",
  });

  assert.ok(conv.id !== "nonexistent");
  assert.equal(conv.tenantId, "demo");
  assert.equal(conv.personId, "person-1");
  assert.equal(conv.status, "open");
});

test("findOrCreate with existing id but different tenant/person creates new", async () => {
  const store = new InMemoryConversationStore();

  const first = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  // Try to reuse with different tenantId
  const second = await store.findOrCreateConversation({
    tenantId: "other-tenant",
    personId: "person-1",
    conversationId: first.id,
  });

  // Should NOT reuse — tenant mismatch
  assert.notEqual(second.id, first.id);
});

test("getConversation returns undefined for unknown id", async () => {
  const store = new InMemoryConversationStore();

  const result = await store.getConversation("nonexistent");
  assert.equal(result, undefined);
});

test("getConversation returns conversation when found", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  const found = await store.getConversation(conv.id);
  assert.ok(found !== undefined);
  assert.equal(found!.id, conv.id);
  assert.equal(found!.tenantId, "demo");
});

test("appendMessage stores message", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  const msg = makeMessage({ conversationId: conv.id });
  const stored = await store.appendMessage(msg);

  assert.equal(stored.id, msg.id);
  assert.equal(stored.conversationId, conv.id);

  const messages = await store.listMessages(conv.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.id, msg.id);
  assert.equal(messages[0]!.text, "hello");
});

test("appendMessage updates conversation updatedAt", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  const originalUpdatedAt = conv.updatedAt.getTime();

  // Small delay to ensure timestamp difference
  await new Promise((resolve) => setTimeout(resolve, 5));

  const msg = makeMessage({ conversationId: conv.id });
  await store.appendMessage(msg);

  const found = await store.getConversation(conv.id);
  assert.ok(found !== undefined);
  assert.ok(found!.updatedAt.getTime() > originalUpdatedAt);
});

test("listMessages returns messages in insertion order", async () => {
  const store = new InMemoryConversationStore();

  const conv = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });

  const msg1 = makeMessage({ id: "msg-1", conversationId: conv.id, text: "first" });
  const msg2 = makeMessage({ id: "msg-2", conversationId: conv.id, text: "second" });
  const msg3 = makeMessage({ id: "msg-3", conversationId: conv.id, text: "third" });

  await store.appendMessage(msg1);
  await store.appendMessage(msg2);
  await store.appendMessage(msg3);

  const messages = await store.listMessages(conv.id);
  assert.equal(messages.length, 3);
  assert.equal(messages[0]!.id, "msg-1");
  assert.equal(messages[1]!.id, "msg-2");
  assert.equal(messages[2]!.id, "msg-3");
});

test("listMessages returns empty array for unknown conversation", async () => {
  const store = new InMemoryConversationStore();

  const messages = await store.listMessages("nonexistent");
  assert.deepEqual(messages, []);
});

test("appendMessage to unknown conversation still stores message", async () => {
  const store = new InMemoryConversationStore();

  const msg = makeMessage({ conversationId: "nonexistent" });
  await store.appendMessage(msg);

  const messages = await store.listMessages("nonexistent");
  assert.equal(messages.length, 1);
});

test("each findOrCreate call produces unique IDs", async () => {
  const store = new InMemoryConversationStore();

  const conv1 = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-1",
  });
  const conv2 = await store.findOrCreateConversation({
    tenantId: "demo",
    personId: "person-2",
  });

  assert.notEqual(conv1.id, conv2.id);
});

test("findOrCreate with different tenants for same person creates separate conversations", async () => {
  const store = new InMemoryConversationStore();

  const convA = await store.findOrCreateConversation({
    tenantId: "tenant-a",
    personId: "person-1",
  });
  const convB = await store.findOrCreateConversation({
    tenantId: "tenant-b",
    personId: "person-1",
  });

  assert.notEqual(convA.id, convB.id);
});
