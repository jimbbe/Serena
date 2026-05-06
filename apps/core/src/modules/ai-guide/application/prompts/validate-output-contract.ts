import type { OutputContract, OutputFieldDefinition } from "../../domain/output-contract.ts";

export type OutputValidationResult =
  | { ok: true; parsed?: unknown }
  | { ok: false; message: string };

/** Validates raw LLM output against the declared OutputContract. */
export function validateOutputContract(
  contract: OutputContract,
  rawOutput: string
): OutputValidationResult {
  if (contract.format === "text") {
    return validateText(rawOutput);
  }

  return validateJson(contract, rawOutput);
}

function validateText(raw: string): OutputValidationResult {
  if (raw.trim().length === 0) {
    return { ok: false, message: "Empty output — text format requires non-empty content" };
  }
  return { ok: true };
}

function validateJson(
  contract: Extract<OutputContract, { format: "json" }>,
  raw: string
): OutputValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Invalid JSON output: could not parse" };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "Output must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of contract.fields) {
    const value = obj[field.name];
    const err = validateField(field, value);
    if (err) return { ok: false, message: err };
  }

  if (contract.strict) {
    const allowedFields = new Set(contract.fields.map((field) => field.name));
    for (const key of Object.keys(obj)) {
      if (!allowedFields.has(key)) {
        return { ok: false, message: `Unexpected field: ${key}` };
      }
    }
  }

  return { ok: true, parsed };
}

function validateField(
  field: OutputFieldDefinition,
  value: unknown
): string | null {
  // Required check
  if (field.required && value === undefined) {
    return `Missing required field: ${field.name}`;
  }

  // Optional field not present — skip type check
  if (value === undefined) return null;

  // Type + allowedValues validation
  switch (field.type) {
    case "string":
      if (typeof value !== "string") return typeError(field.name, "string");
      return validateAllowedValue(field, value);

    case "boolean":
      if (typeof value !== "boolean") return typeError(field.name, "boolean");
      return null;

    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) return typeError(field.name, "number");
      return null;

    case "string[]":
    case "enum[]": {
      if (!Array.isArray(value)) return typeError(field.name, field.type);
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== "string") {
          return typeError(`${field.name}[${i}]`, "string");
        }
        const itemErr = validateAllowedValue(field, arr[i] as string, `[${i}]`);
        if (itemErr) return itemErr;
      }
      return null;
    }

    case "enum":
      if (typeof value !== "string") return typeError(field.name, "enum");
      return validateAllowedValue(field, value);

    case "object":
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return typeError(field.name, "object");
      }
      return null;

    case "unknown":
      return null;

    case "null":
      if (value !== null) return typeError(field.name, "null");
      return null;

    case "string | null":
      if (value !== null && typeof value !== "string") {
        return typeError(field.name, "string | null");
      }
      return null;

    default:
      return null;
  }
}

function typeError(
  fieldName: string,
  expected: string
): string {
  return `Invalid type for field ${fieldName}: expected ${expected}`;
}

function validateAllowedValue(
  field: OutputFieldDefinition,
  value: string,
  indexSuffix: string = ""
): string | null {
  if (!field.allowedValues || field.allowedValues.length === 0) return null;

  if (!field.allowedValues.includes(value)) {
    return `Invalid value for field ${field.name}${indexSuffix}: ${value}`;
  }

  return null;
}
