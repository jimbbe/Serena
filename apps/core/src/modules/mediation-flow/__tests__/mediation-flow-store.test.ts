/**
 * T32 — Unit tests for InMemoryMediationFlowStore.
 *
 * Tests all MediationFlowStore port methods: findActiveByConversation,
 * startFlow, updateFlow, clearFlow, pauseFlow, resumeFlow, and edge cases.
 *
 * Uses node:test + node:assert/strict (zero external deps).
 * Follows the same pattern as conversation-store.test.ts.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryMediationFlowStore } from "../adapter/in-memory-mediation-flow-store.ts";
import type { MediationFlowState } from "../domain/mediation-flow-state.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlowState(overrides?: Partial<MediationFlowState>): MediationFlowState {
  const now = new Date();
  return {
    conversationId: "conv-1",
    personId: "person-1",
    status: "clarifying",
    draft: null,
    pendingAction: "clarify_message",
    missingFields: ["message"],
    lastQuestion: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("findActiveByConversation returns undefined for unknown conversation", async () => {
  const store = new InMemoryMediationFlowStore();
  const result = await store.findActiveByConversation("nonexistent");
  assert.equal(result, undefined);
});

test("findActiveByConversation returns active flow when found", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState();
  await store.startFlow(flow);

  const found = await store.findActiveByConversation("conv-1");
  assert.ok(found !== undefined);
  assert.equal(found.conversationId, "conv-1");
  assert.equal(found.status, "clarifying");
});

test("findActiveByConversation returns undefined for resolved flow", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "resolved" });
  await store.startFlow(flow);

  const found = await store.findActiveByConversation("conv-1");
  assert.equal(found, undefined);
});

test("findActiveByConversation returns undefined for paused flow", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "paused" });
  await store.startFlow(flow);

  const found = await store.findActiveByConversation("conv-1");
  assert.equal(found, undefined);
});

test("startFlow stores and returns the flow state", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState();

  const saved = await store.startFlow(flow);
  assert.equal(saved.conversationId, "conv-1");
  assert.equal(saved.status, "clarifying");
});

test("startFlow replaces existing flow for same conversation", async () => {
  const store = new InMemoryMediationFlowStore();

  const first = makeFlowState({ status: "clarifying", pendingAction: "clarify_message" });
  await store.startFlow(first);

  const second = makeFlowState({ status: "confirming", pendingAction: "confirm_mediation" });
  const replaced = await store.startFlow(second);

  assert.equal(replaced.status, "confirming");

  const found = await store.findActiveByConversation("conv-1");
  assert.ok(found !== undefined);
  assert.equal(found.status, "confirming");
  assert.equal(found.pendingAction, "confirm_mediation");
});

test("updateFlow updates existing flow", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState();
  await store.startFlow(flow);

  const updated = makeFlowState({
    status: "confirming",
    pendingAction: "confirm_mediation",
    missingFields: ["confirmation"],
  });
  const result = await store.updateFlow(updated);

  assert.equal(result.status, "confirming");
  assert.equal(result.pendingAction, "confirm_mediation");

  const found = await store.findActiveByConversation("conv-1");
  assert.ok(found !== undefined);
  assert.equal(found.status, "confirming");
});

test("updateFlow on non-existent flow still persists it", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ conversationId: "new-conv" });

  const result = await store.updateFlow(flow);
  assert.equal(result.conversationId, "new-conv");

  const found = await store.findActiveByConversation("new-conv");
  assert.ok(found !== undefined);
  assert.equal(found.conversationId, "new-conv");
});

test("clearFlow removes the flow state", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState();
  await store.startFlow(flow);

  await store.clearFlow("conv-1");

  const found = await store.findActiveByConversation("conv-1");
  assert.equal(found, undefined);
});

test("clearFlow on non-existent conversation does not throw", async () => {
  const store = new InMemoryMediationFlowStore();
  await store.clearFlow("nonexistent");
  // No error — idempotent
});

test("pauseFlow changes status to paused", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "confirming", pendingAction: "confirm_mediation" });
  await store.startFlow(flow);

  const paused = await store.pauseFlow("conv-1");
  assert.ok(paused !== undefined);
  assert.equal(paused.status, "paused");
  assert.equal(paused.pendingAction, null);

  const found = await store.findActiveByConversation("conv-1");
  assert.equal(found, undefined); // paused flows are not "active"
});

test("pauseFlow on non-existent conversation returns undefined", async () => {
  const store = new InMemoryMediationFlowStore();
  const result = await store.pauseFlow("nonexistent");
  assert.equal(result, undefined);
});

test("pauseFlow is idempotent — pausing an already-paused flow keeps it paused", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "paused" });
  // Directly insert as paused (simulate previous pause)
  await store.updateFlow(flow);

  // pauseFlow should not find it (paused = not active), returns undefined
  const result = await store.pauseFlow("conv-1");
  assert.equal(result, undefined);
});

test("resumeFlow changes status from paused to clarifying", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "paused", pendingAction: null });
  await store.updateFlow(flow);

  const resumed = await store.resumeFlow("conv-1");
  assert.ok(resumed !== undefined);
  assert.equal(resumed.status, "clarifying");
});

test("resumeFlow on non-existent conversation returns undefined", async () => {
  const store = new InMemoryMediationFlowStore();
  const result = await store.resumeFlow("nonexistent");
  assert.equal(result, undefined);
});

test("resumeFlow on non-paused flow returns undefined", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "clarifying" });
  await store.startFlow(flow);

  const result = await store.resumeFlow("conv-1");
  assert.equal(result, undefined);
});

test("multiple conversations are isolated from each other", async () => {
  const store = new InMemoryMediationFlowStore();

  const flowA = makeFlowState({ conversationId: "conv-a", personId: "person-a" });
  const flowB = makeFlowState({ conversationId: "conv-b", personId: "person-b" });

  await store.startFlow(flowA);
  await store.startFlow(flowB);

  const foundA = await store.findActiveByConversation("conv-a");
  const foundB = await store.findActiveByConversation("conv-b");

  assert.ok(foundA !== undefined);
  assert.ok(foundB !== undefined);
  assert.equal(foundA.personId, "person-a");
  assert.equal(foundB.personId, "person-b");

  // Clearing one does not affect the other
  await store.clearFlow("conv-a");
  const stillFoundB = await store.findActiveByConversation("conv-b");
  assert.ok(stillFoundB !== undefined);
  assert.equal(stillFoundB.conversationId, "conv-b");
});

test("idle status is considered active (findable)", async () => {
  const store = new InMemoryMediationFlowStore();
  const flow = makeFlowState({ status: "idle" });
  await store.startFlow(flow);

  const found = await store.findActiveByConversation("conv-1");
  assert.ok(found !== undefined);
  assert.equal(found.status, "idle");
});
