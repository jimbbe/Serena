import test from "node:test";
import assert from "node:assert/strict";

import { validateOutputContract } from "../application/prompts/validate-output-contract.ts";
import type { OutputContract } from "../domain/output-contract.ts";
import { defaultPrompts } from "../application/prompts/default-prompts.ts";

function findContract(id: string): Extract<OutputContract, { format: "json" }> {
  const prompt = defaultPrompts.find((p) => p.id === id);
  if (!prompt || prompt.outputContract.format !== "json") throw new Error(`JSON contract not found: ${id}`);
  return prompt.outputContract as Extract<OutputContract, { format: "json" }>;
}

const textContract: OutputContract = {
  format: "text",
  description: "Test text output",
};

const basicJsonContract: OutputContract = {
  format: "json",
  strict: true,
  description: "Test JSON",
  fields: [
    { name: "name", type: "string", required: true, description: "" },
    { name: "age", type: "number", required: false, description: "" },
  ],
};

const enumContract: OutputContract = {
  format: "json",
  strict: true,
  description: "Enum test",
  fields: [
    { name: "riskLevel", type: "enum", required: true, description: "", allowedValues: ["low", "medium", "high", "critical"] },
  ],
};

const enumArrayContract: OutputContract = {
  format: "json",
  strict: true,
  description: "Enum array test",
  fields: [
    { name: "missingFields", type: "string[]", required: true, description: "", allowedValues: ["recipient", "message", "confirmation"] },
  ],
};

// ── Text format ──────────────────────────────────────────────────────

test("text: empty string fails", () => {
  const result = validateOutputContract(textContract, "");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Empty"));
});

test("text: whitespace-only fails", () => {
  const result = validateOutputContract(textContract, "   ");
  assert.equal(result.ok, false);
});

test("text: non-empty text passes", () => {
  const result = validateOutputContract(textContract, "Hello!");
  assert.equal(result.ok, true);
});

// ── JSON: invalid input ──────────────────────────────────────────────

test("JSON: invalid syntax fails", () => {
  const result = validateOutputContract(basicJsonContract, "not json");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Invalid JSON"));
});

test("JSON: array fails", () => {
  const result = validateOutputContract(basicJsonContract, "[1, 2, 3]");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("JSON object"));
});

test("JSON: null fails", () => {
  const result = validateOutputContract(basicJsonContract, "null");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("JSON object"));
});

test("JSON: empty object passes if no required fields", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "No required",
    fields: [
      { name: "optionalField", type: "string", required: false, description: "" },
    ],
  };
  const result = validateOutputContract(contract, "{}");
  assert.equal(result.ok, true);
});

// ── JSON: required fields ────────────────────────────────────────────

test("JSON: missing required field fails", () => {
  const result = validateOutputContract(basicJsonContract, "{}");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Missing required field: name"));
});

test("JSON: all required fields present passes", () => {
  const result = validateOutputContract(basicJsonContract, '{"name": "Alice"}');
  assert.equal(result.ok, true);
});

// ── JSON: type validation ────────────────────────────────────────────

test("JSON: invalid type for string field fails", () => {
  const result = validateOutputContract(basicJsonContract, '{"name": 42}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("expected string"));
});

test("JSON: invalid type for number field fails", () => {
  const result = validateOutputContract(basicJsonContract, '{"name": "Alice", "age": "old"}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("expected number"));
});

test("JSON: NaN is not a valid number", () => {
  const result = validateOutputContract(basicJsonContract, '{"name": "Alice", "age": null}');
  // null is not a valid number
  assert.equal(result.ok, false);
});

test("JSON: boolean field validates correctly", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "flag", type: "boolean", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"flag": true}').ok, true);
  assert.equal(validateOutputContract(contract, '{"flag": false}').ok, true);
  const fail = validateOutputContract(contract, '{"flag": "yes"}');
  assert.equal(fail.ok, false);
  if (!fail.ok) assert.ok(fail.message.includes("expected boolean"));
});

// ── JSON: enum allowedValues ─────────────────────────────────────────

test("JSON: enum with valid value passes", () => {
  const result = validateOutputContract(enumContract, '{"riskLevel": "low"}');
  assert.equal(result.ok, true);
});

test("JSON: enum with invalid value fails", () => {
  const result = validateOutputContract(enumContract, '{"riskLevel": "banana"}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Invalid value for field riskLevel: banana"));
});

// ── JSON: string[] / enum[] with allowedValues ───────────────────────

test("JSON: string[] with valid allowedValues passes", () => {
  const result = validateOutputContract(enumArrayContract, '{"missingFields": ["recipient", "message"]}');
  assert.equal(result.ok, true);
});

test("JSON: string[] with invalid allowedValue fails", () => {
  const result = validateOutputContract(enumArrayContract, '{"missingFields": ["recipient", "foo"]}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Invalid value for field missingFields[1]: foo"));
});

test("JSON: string[] with non-string element fails", () => {
  const result = validateOutputContract(enumArrayContract, '{"missingFields": ["recipient", 42]}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("expected string"));
});

// ── JSON: string | null ──────────────────────────────────────────────

test("JSON: string | null accepts string", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "value", type: "string | null", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"value": "hello"}').ok, true);
});

test("JSON: string | null accepts null", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "value", type: "string | null", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"value": null}').ok, true);
});

test("JSON: string | null rejects number", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "value", type: "string | null", required: true, description: "" },
    ],
  };
  const result = validateOutputContract(contract, '{"value": 42}');
  assert.equal(result.ok, false);
});

// ── JSON: number type ────────────────────────────────────────────────

test("JSON: number field accepts valid number", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "score", type: "number", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"score": 95}').ok, true);
});

test("JSON: number field with null fails", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "score", type: "number", required: true, description: "" },
    ],
  };
  const result = validateOutputContract(contract, '{"score": null}');
  assert.equal(result.ok, false);
});

// ── JSON: null type ─────────────────────────────────────────────────

test("JSON: null type validates correctly", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "unset", type: "null", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"unset": null}').ok, true);
  const fail = validateOutputContract(contract, '{"unset": "not null"}');
  assert.equal(fail.ok, false);
  if (!fail.ok) assert.ok(fail.message.includes("expected null"));
});

// ── JSON: object type ───────────────────────────────────────────────

test("JSON: object type validates correctly", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "nested", type: "object", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"nested": {"a": 1}}').ok, true);
  const failArray = validateOutputContract(contract, '{"nested": [1, 2]}');
  assert.equal(failArray.ok, false);
  if (!failArray.ok) assert.ok(failArray.message.includes("expected object"));
  const failNull = validateOutputContract(contract, '{"nested": null}');
  assert.equal(failNull.ok, false);
});

// ── Integration: full prompts ────────────────────────────────────────

test("integration: risk.review valid output passes", () => {
  const contract = findContract("serena.risk.review.v1");
  const result = validateOutputContract(contract, JSON.stringify({
    riskLevel: "low",
    riskType: "unknown",
    source: "direct",
    situationSummary: "No se detectan señales claras de riesgo.",
    recommendedAction: "reply",
    requiresEscalation: false,
    missingInformation: [],
  }));
  assert.equal(result.ok, true);
});

test("integration: mediation.understand_request valid output passes", () => {
  const contract = findContract("serena.mediation.understand_request.v1");
  const result = validateOutputContract(contract, JSON.stringify({
    isMediationRequest: true,
    recipientHint: "Mari",
    messageDraft: "Llego más tarde.",
    requiresConfirmation: true,
    missingFields: ["confirmation"],
    riskSignal: false,
  }));
  assert.equal(result.ok, true);
});

test("integration: risk.review with invalid enum value fails", () => {
  const contract = findContract("serena.risk.review.v1");
  const result = validateOutputContract(contract, JSON.stringify({
    riskLevel: "extreme",
    riskType: "unknown",
    source: "direct",
    situationSummary: "...",
    recommendedAction: "reply",
    requiresEscalation: false,
    missingInformation: [],
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("riskLevel"));
});

test("integration: understand_request with missing required field fails", () => {
  const contract = findContract("serena.mediation.understand_request.v1");
  const result = validateOutputContract(contract, JSON.stringify({
    isMediationRequest: true,
    recipientHint: "Mari",
    messageDraft: "test",
    requiresConfirmation: true,
    riskSignal: false,
    // missingFields is required but missing
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("missingFields"));
});

test("integration: mediation.clarify valid output passes", () => {
  const contract = findContract("serena.mediation.clarify.v1");
  const result = validateOutputContract(contract, JSON.stringify({
    question: "¿A quién querés que le avise?",
    reason: "Falta el destinatario del mensaje.",
  }));
  assert.equal(result.ok, true);
});

test("integration: undefined value for optional field passes", () => {
  const result = validateOutputContract(basicJsonContract, '{"name": "Alice"}');
  // age is optional and not present — should pass
  assert.equal(result.ok, true);
});

test("integration: unknown field type accepts any value", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "data", type: "unknown", required: true, description: "" },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"data": "anything"}').ok, true);
  assert.equal(validateOutputContract(contract, '{"data": 42}').ok, true);
  assert.equal(validateOutputContract(contract, '{"data": null}').ok, true);
});

// ── enum[] with allowedValues ────────────────────────────────────────

test("JSON: enum[] with valid allowedValues passes", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "priorities", type: "enum[]", required: true, description: "", allowedValues: ["low", "high"] },
    ],
  };
  assert.equal(validateOutputContract(contract, '{"priorities": ["low", "high"]}').ok, true);
  assert.equal(validateOutputContract(contract, '{"priorities": ["low"]}').ok, true);
  const fail = validateOutputContract(contract, '{"priorities": ["low", "nope"]}');
  assert.equal(fail.ok, false);
  if (!fail.ok) assert.ok(fail.message.includes("nope"));
});

test("JSON strict contract rejects unexpected fields", () => {
  const contract: OutputContract = {
    format: "json",
    strict: true,
    description: "",
    fields: [
      { name: "riskLevel", type: "enum", required: true, description: "", allowedValues: ["low", "medium", "high", "critical"] },
      { name: "riskType", type: "enum", required: true, description: "", allowedValues: ["health", "emotional", "safety", "scam", "confusion", "unknown"] },
      { name: "source", type: "enum", required: true, description: "", allowedValues: ["direct", "reported", "system", "unknown"] },
      { name: "situationSummary", type: "string", required: true, description: "" },
      { name: "recommendedAction", type: "enum", required: true, description: "", allowedValues: ["reply", "clarify", "notify_contact", "human_review"] },
      { name: "requiresEscalation", type: "boolean", required: true, description: "" },
      { name: "missingInformation", type: "string[]", required: true, description: "" },
    ],
  };

  const result = validateOutputContract(contract, JSON.stringify({
    riskLevel: "low",
    riskType: "unknown",
    source: "direct",
    situationSummary: "ok",
    recommendedAction: "reply",
    requiresEscalation: false,
    missingInformation: [],
    extra: true,
  }));

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes("Unexpected field: extra"));
});
