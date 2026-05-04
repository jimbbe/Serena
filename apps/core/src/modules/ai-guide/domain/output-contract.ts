/** Describes a single field the LLM must return in a JSON output contract. */
export type OutputFieldDefinition = {
  name: string;
  type: "string" | "boolean" | "string[]" | "enum" | "enum[]" | "number" | "object" | "unknown" | "null" | "string | null";
  required: boolean;
  description: string;
  allowedValues?: string[];
};

/** Declares whether the prompt expects plain text or structured JSON output, and what shape. */
export type OutputContract =
  | {
      format: "text";
      description: string;
    }
  | {
      format: "json";
      description: string;
      fields: OutputFieldDefinition[];
      strict: boolean;
    };
