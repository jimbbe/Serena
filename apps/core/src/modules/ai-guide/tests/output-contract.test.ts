import test from "node:test";
import assert from "node:assert/strict";

import { defaultPrompts } from "../application/prompts/default-prompts.ts";
import { MockLlmProvider } from "../infrastructure/memory/mock-llm-provider.ts";
import type { PromptDefinition } from "../domain/prompt-definition.ts";
import type { ExecutionPolicy } from "../domain/execution-policy.ts";

// ── helpers ──────────────────────────────────────────────────────────

function findPrompt(id: string): PromptDefinition {
  const prompt = defaultPrompts.find((p) => p.id === id);
  if (!prompt) throw new Error(`Prompt not found: ${id}`);
  return prompt;
}

const defaultPolicy: ExecutionPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
};

// ── Test 1: mediation.understand_request ─────────────────────────────

test("understand_request contract has all expected fields", () => {
  const prompt = findPrompt("serena.mediation.understand_request.v1");
  const oc = prompt.outputContract;

  assert.strictEqual(oc.format, "json");
  if (oc.format !== "json") throw new Error("Expected json format");

  const fieldNames = oc.fields.map((f) => f.name);

  // All 6 fields present
  assert.ok(fieldNames.includes("isMediationRequest"), "missing isMediationRequest");
  assert.ok(fieldNames.includes("recipientHint"), "missing recipientHint");
  assert.ok(fieldNames.includes("messageDraft"), "missing messageDraft");
  assert.ok(fieldNames.includes("requiresConfirmation"), "missing requiresConfirmation");
  assert.ok(fieldNames.includes("missingFields"), "missing missingFields");
  assert.ok(fieldNames.includes("riskSignal"), "missing riskSignal");

  // Every field must be required
  for (const field of oc.fields) {
    assert.strictEqual(
      field.required,
      true,
      `${field.name} must be required`
    );
  }

  // missingFields has correct allowedValues
  const missingFieldsDef = oc.fields.find((f) => f.name === "missingFields");
  assert.ok(missingFieldsDef, "missingFields field must exist");
  assert.deepStrictEqual(
    missingFieldsDef!.allowedValues,
    ["recipient", "message", "confirmation"]
  );
});

// ── Test 2: mediation.clarify ────────────────────────────────────────

test("clarify contract has question and reason fields", () => {
  const prompt = findPrompt("serena.mediation.clarify.v1");
  const oc = prompt.outputContract;

  assert.strictEqual(oc.format, "json");
  if (oc.format !== "json") throw new Error("Expected json format");

  const fieldNames = oc.fields.map((f) => f.name);
  assert.strictEqual(fieldNames.length, 2, "clarify must have exactly 2 fields");

  assert.ok(fieldNames.includes("question"), "missing question");
  assert.ok(fieldNames.includes("reason"), "missing reason");

  // Both must be required
  for (const field of oc.fields) {
    assert.strictEqual(field.required, true, `${field.name} must be required`);
  }
});

// ── Test 3: risk.review ──────────────────────────────────────────────

test("risk.review contract has all required fields with allowedValues", () => {
  const prompt = findPrompt("serena.risk.review.v1");
  const oc = prompt.outputContract;

  assert.strictEqual(oc.format, "json");
  if (oc.format !== "json") throw new Error("Expected json format");

  const fieldNames = oc.fields.map((f) => f.name);

  // 7 fields total
  assert.strictEqual(fieldNames.length, 7, "risk.review must have exactly 7 fields");

  assert.ok(fieldNames.includes("riskLevel"), "missing riskLevel");
  assert.ok(fieldNames.includes("riskType"), "missing riskType");
  assert.ok(fieldNames.includes("source"), "missing source");
  assert.ok(fieldNames.includes("situationSummary"), "missing situationSummary");
  assert.ok(fieldNames.includes("recommendedAction"), "missing recommendedAction");
  assert.ok(fieldNames.includes("requiresEscalation"), "missing requiresEscalation");
  assert.ok(fieldNames.includes("missingInformation"), "missing missingInformation");

  // All must be required
  for (const field of oc.fields) {
    assert.strictEqual(field.required, true, `${field.name} must be required`);
  }

  // ── allowedValues checks ──

  const riskLevelDef = oc.fields.find((f) => f.name === "riskLevel");
  assert.ok(riskLevelDef, "riskLevel field must exist");
  assert.deepStrictEqual(
    riskLevelDef!.allowedValues,
    ["low", "medium", "high", "critical"]
  );

  const riskTypeDef = oc.fields.find((f) => f.name === "riskType");
  assert.ok(riskTypeDef, "riskType field must exist");
  assert.deepStrictEqual(
    riskTypeDef!.allowedValues,
    ["health", "emotional", "safety", "scam", "confusion", "unknown"]
  );

  const sourceDef = oc.fields.find((f) => f.name === "source");
  assert.ok(sourceDef, "source field must exist");
  assert.deepStrictEqual(
    sourceDef!.allowedValues,
    ["direct", "reported", "system", "unknown"]
  );

  const recommendedActionDef = oc.fields.find((f) => f.name === "recommendedAction");
  assert.ok(recommendedActionDef, "recommendedAction field must exist");
  assert.deepStrictEqual(
    recommendedActionDef!.allowedValues,
    ["reply", "clarify", "notify_contact", "human_review"]
  );
});

// ── Test 4: conversation.reply (text format) ─────────────────────────

test("conversation.reply contract is text format", () => {
  const prompt = findPrompt("serena.conversation.reply.v1");
  const oc = prompt.outputContract;

  assert.strictEqual(oc.format, "text");
  assert.ok(oc.description.length > 0, "description must be non-empty");
  assert.ok(!("fields" in oc), "text output must not have fields");
});

// ── Test 5 & 6: MockLlmProvider field compatibility ──────────────────

test("mock understand_request returns all required fields", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    promptId: "serena.mediation.understand_request.v1",
    promptVersion: 1,
    systemPrompt: "system",
    userPrompt: "Decile a Mari que llego más tarde",
    policy: defaultPolicy,
  });

  const parsed = JSON.parse(result.content);

  assert.ok("isMediationRequest" in parsed, "missing isMediationRequest");
  assert.ok("recipientHint" in parsed, "missing recipientHint");
  assert.ok("messageDraft" in parsed, "missing messageDraft");
  assert.ok("requiresConfirmation" in parsed, "missing requiresConfirmation");
  assert.ok("missingFields" in parsed, "missing missingFields");
  assert.ok("riskSignal" in parsed, "missing riskSignal");
});

test("mock risk.review returns all required fields", async () => {
  const provider = new MockLlmProvider();

  const result = await provider.invoke({
    promptId: "serena.risk.review.v1",
    promptVersion: 1,
    systemPrompt: "system",
    userPrompt: "Me siento un poco mareado",
    policy: defaultPolicy,
  });

  const parsed = JSON.parse(result.content);

  assert.ok("riskLevel" in parsed, "missing riskLevel");
  assert.ok("riskType" in parsed, "missing riskType");
  assert.ok("source" in parsed, "missing source");
  assert.ok("situationSummary" in parsed, "missing situationSummary");
  assert.ok("recommendedAction" in parsed, "missing recommendedAction");
  assert.ok("requiresEscalation" in parsed, "missing requiresEscalation");
  assert.ok("missingInformation" in parsed, "missing missingInformation");
});
