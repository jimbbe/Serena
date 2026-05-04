/**
 * Renders an OutputContract into human-readable instructions for the LLM.
 *
 * This ensures the LLM receives formal field definitions (name, type, description,
 * allowedValues) generated from the OutputContract -- not just hand-written text
 * inside systemPrompt. The rendered contract is appended to developerPrompt so
 * the LLM knows exactly what to return.
 *
 * @see ExecutionPipeline -- where this is injected into the provider request.
 */
import type { OutputContract } from "../../domain/output-contract.ts";

/**
 * Renders an OutputContract as a string containing structured instructions
 * for the LLM about what fields to return and in what format.
 */
export function renderOutputContract(contract: OutputContract): string {
  if (contract.format === "text") {
    return renderTextContract(contract);
  }
  return renderJsonContract(contract);
}

function renderTextContract(contract: { description: string }): string {
  return [
    "Contrato de salida:",
    "- Formato esperado: texto.",
    `- Descripción: ${contract.description}`,
    "- Devolvé solo el texto final.",
    "- No incluyas análisis interno.",
  ].join("\n");
}

type JsonContractShape = {
  description: string;
  strict: boolean;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    allowedValues?: string[];
  }>;
};

function renderJsonContract(contract: JsonContractShape): string {
  const { strict, description, fields } = contract;

  const lines: string[] = [
    "Contrato de salida:",
    "- Formato esperado: JSON.",
    `- Modo estricto: ${strict}.`,
    `- Descripción: ${description}`,
    "",
    "Campos:",
  ];

  fields.forEach((f, index) => {
    lines.push(`${index + 1}. ${f.name}`);
    lines.push(`   - Tipo: ${f.type}`);
    lines.push(`   - Requerido: ${f.required ? "sí" : "no"}`);
    lines.push(`   - Descripción: ${f.description}`);
    if (f.allowedValues !== undefined && f.allowedValues.length > 0) {
      lines.push(`   - Valores permitidos: ${f.allowedValues.join(", ")}`);
    }
  });

  lines.push("");
  lines.push("Reglas:");

  if (strict) {
    lines.push("- Devolvé solo JSON válido.");
    lines.push("- No incluyas markdown.");
    lines.push("- No incluyas texto fuera del JSON.");
  }

  lines.push("- Incluí todos los campos requeridos.");

  const hasAllowedValues = fields.some(
    (f) => f.allowedValues !== undefined && f.allowedValues.length > 0
  );
  if (hasAllowedValues) {
    lines.push(
      "- Usá solo valores permitidos cuando el campo declare allowedValues."
    );
  }

  return lines.join("\n");
}
