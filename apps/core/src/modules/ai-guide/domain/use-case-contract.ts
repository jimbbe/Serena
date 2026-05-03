import type { GuideUseCaseId } from "./guide-use-case-id.ts";
import type { ExecutionPolicy } from "./execution-policy.ts";

export type UseCaseContract = {
  id: GuideUseCaseId;
  systemPrompt: string;
  inputTemplate: string;
  outputSchemaName: string;
  executionPolicy: ExecutionPolicy;
};
