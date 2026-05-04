import test from "node:test";
import assert from "node:assert/strict";

import { renderOutputContract } from "../application/prompts/render-output-contract.ts";
import type { OutputContract } from "../domain/output-contract.ts";

const toText = (contract: OutputContract) => renderOutputContract(contract);

// ── text format ───────────────────────────────────────────────────

test("text format includes format description and description", () => {
  const contract: OutputContract = {
    format: "text",
    description: "Texto breve user-facing.",
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Formato esperado: texto"),
    "must mention texto format"
  );
  assert.ok(
    rendered.includes("Texto breve user-facing"),
    "must include description"
  );
});

test("text format instructs to return only final text", () => {
  const contract: OutputContract = {
    format: "text",
    description: "Respuesta breve.",
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Devolve solo el texto final"),
    "must instruct to return only final text"
  );
  assert.ok(
    rendered.includes("No incluyas analisis interno"),
    "must forbid internal analysis"
  );
});

// ── json format ──────────────────────────────────────────────────

test("json format includes format description and description", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Análisis estructurado.",
    strict: false,
    fields: [
      {
        name: "score",
        type: "number",
        required: true,
        description: "puntaje de 0 a 100",
      },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Formato esperado: JSON"),
    "must mention JSON format"
  );
  assert.ok(
    rendered.includes("Análisis estructurado"),
    "must include description"
  );
});

test("json format includes each field name and type", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      { name: "isActive", type: "boolean", required: true, description: "activo?" },
      { name: "count", type: "number", required: false, description: "cantidad" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(rendered.includes("isActive"), "must include isActive field name");
  assert.ok(rendered.includes("boolean"), "must include boolean type");
  assert.ok(rendered.includes("count"), "must include count field name");
  assert.ok(rendered.includes("number"), "must include number type");
});

test("json format includes required flag per field", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      { name: "requiredField", type: "string", required: true, description: "req" },
      { name: "optionalField", type: "string", required: false, description: "opt" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Requerido: si"),
    "required field must show si"
  );
  assert.ok(
    rendered.includes("Requerido: no"),
    "optional field must show no"
  );
});

test("json format includes field description", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      { name: "name", type: "string", required: true, description: "nombre de la persona" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("nombre de la persona"),
    "must include field description"
  );
});

test("json format includes allowedValues when present", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      {
        name: "status",
        type: "enum",
        required: true,
        description: "estado del pedido",
        allowedValues: ["pending", "approved", "rejected"],
      },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Valores permitidos: pending, approved, rejected"),
    "must include allowedValues"
  );
});

test("json format omits allowedValues line when not present", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      { name: "freeField", type: "string", required: true, description: "sin限制" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    !rendered.includes("Valores permitidos"),
    "must not mention allowedValues when field has none"
  );
});

test("json format instructs to return only valid JSON", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: true,
    fields: [
      { name: "x", type: "string", required: true, description: "x" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Devolve solo JSON valido"),
    "must instruct JSON validity"
  );
});

test("json format instructs no markdown when strict", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: true,
    fields: [
      { name: "x", type: "string", required: true, description: "x" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("No incluyas markdown"),
    "must forbid markdown"
  );
});

test("json format instructs to include all required fields", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: true,
    fields: [
      { name: "x", type: "string", required: true, description: "x" },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Inclui todos los campos requeridos"),
    "must instruct to include required fields"
  );
});

test("json format with strict=false still includes all rules", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: false,
    fields: [
      { name: "x", type: "string", required: true, description: "x" },
    ],
  };
  const rendered = toText(contract);

  // All format rules are always included (not conditional on strict)
  assert.ok(
    rendered.includes("Devolve solo JSON valido"),
    "must include valid JSON rule"
  );
  assert.ok(
    rendered.includes("No incluyas markdown"),
    "must include no markdown rule"
  );
  assert.ok(
    rendered.includes("No incluyas texto fuera del JSON"),
    "must include no extra text rule"
  );
  assert.ok(
    rendered.includes("Inclui todos los campos requeridos"),
    "must include required fields rule"
  );
});

test("json format with allowedValues fields instructs to use permitted values", () => {
  const contract: OutputContract = {
    format: "json",
    description: "Test",
    strict: true,
    fields: [
      {
        name: "priority",
        type: "enum",
        required: true,
        description: "prioridad",
        allowedValues: ["low", "high"],
      },
    ],
  };
  const rendered = toText(contract);

  assert.ok(
    rendered.includes("Usa solo valores permitidos cuando el campo declare allowedValues"),
    "must instruct to use allowedValues"
  );
});

// ── integration: understand_request contract ──────────────────────

test("understand_request rendered contract contains all field names", async () => {
  const { defaultPrompts } = await import("../application/prompts/default-prompts.ts");
  const prompt = defaultPrompts.find(
    (p) => p.id === "serena.mediation.understand_request.v1"
  )!;
  const rendered = toText(prompt.outputContract);

  for (const field of [
    "isMediationRequest",
    "recipientHint",
    "messageDraft",
    "requiresConfirmation",
    "missingFields",
    "riskSignal",
  ]) {
    assert.ok(
      rendered.includes(field),
      `rendered contract must include field: ${field}`
    );
  }
});

test("understand_request rendered contract contains missingFields allowedValues", async () => {
  const { defaultPrompts } = await import("../application/prompts/default-prompts.ts");
  const prompt = defaultPrompts.find(
    (p) => p.id === "serena.mediation.understand_request.v1"
  )!;
  const rendered = toText(prompt.outputContract);

  assert.ok(
    rendered.includes("recipient"),
    "must include recipient in allowedValues"
  );
  assert.ok(
    rendered.includes("message"),
    "must include message in allowedValues"
  );
  assert.ok(
    rendered.includes("confirmation"),
    "must include confirmation in allowedValues"
  );
});

// ── integration: risk.review contract ────────────────────────────

test("risk.review rendered contract contains all field names", async () => {
  const { defaultPrompts } = await import("../application/prompts/default-prompts.ts");
  const prompt = defaultPrompts.find(
    (p) => p.id === "serena.risk.review.v1"
  )!;
  const rendered = toText(prompt.outputContract);

  for (const field of [
    "riskLevel",
    "riskType",
    "source",
    "situationSummary",
    "recommendedAction",
    "requiresEscalation",
    "missingInformation",
  ]) {
    assert.ok(
      rendered.includes(field),
      `rendered contract must include field: ${field}`
    );
  }
});

test("risk.review rendered contract contains allowedValues for riskLevel", async () => {
  const { defaultPrompts } = await import("../application/prompts/default-prompts.ts");
  const prompt = defaultPrompts.find(
    (p) => p.id === "serena.risk.review.v1"
  )!;
  const rendered = toText(prompt.outputContract);

  assert.ok(
    rendered.includes("low"),
    "must include low"
  );
  assert.ok(
    rendered.includes("critical"),
    "must include critical"
  );
});

test("risk.review rendered contract contains allowedValues for recommendedAction", async () => {
  const { defaultPrompts } = await import("../application/prompts/default-prompts.ts");
  const prompt = defaultPrompts.find(
    (p) => p.id === "serena.risk.review.v1"
  )!;
  const rendered = toText(prompt.outputContract);

  assert.ok(
    rendered.includes("notify_contact"),
    "must include notify_contact"
  );
  assert.ok(
    rendered.includes("human_review"),
    "must include human_review"
  );
});