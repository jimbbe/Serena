import type { OutputContract } from "../../domain/output-contract.ts";

type TextOutputContract = Extract<OutputContract, { format: "text" }>;
type JsonOutputContract = Extract<OutputContract, { format: "json" }>;

export function renderOutputContract(contract: OutputContract): string {
  if (contract.format === "text") {
    return renderTextContract(contract);
  }

  return renderJsonContract(contract);
}

function renderTextContract(contract: TextOutputContract): string {
  return [
    "Contrato de salida:",
    "- Formato esperado: texto.",
    "- Descripcion: " + contract.description,
    "- Devolve solo el texto final.",
    "- No incluyas analisis interno.",
  ].join("\n");
}

function renderJsonContract(contract: JsonOutputContract): string {
  const lines: string[] = [
    "Contrato de salida:",
    "- Formato esperado: JSON.",
    "- Modo estricto: " + String(contract.strict) + ".",
    "- Descripcion: " + contract.description,
    "",
    "Campos:",
  ];

  contract.fields.forEach((field, index) => {
    lines.push(String(index + 1) + ". " + field.name);
    lines.push("   - Tipo: " + field.type);
    lines.push("   - Requerido: " + (field.required ? "si" : "no"));
    lines.push("   - Descripcion: " + field.description);

    if (field.allowedValues && field.allowedValues.length > 0) {
      lines.push("   - Valores permitidos: " + field.allowedValues.join(", "));
    }
  });

  lines.push("");
  lines.push("Reglas:");
  lines.push("- Devolve solo JSON valido.");
  lines.push("- No incluyas markdown.");
  lines.push("- No incluyas texto fuera del JSON.");
  lines.push("- Inclui todos los campos requeridos.");

  const hasAllowedValues = contract.fields.some(
    (field) => field.allowedValues && field.allowedValues.length > 0
  );

  if (hasAllowedValues) {
    lines.push("- Usa solo valores permitidos cuando el campo declare allowedValues.");
  }

  return lines.join("\n");
}
