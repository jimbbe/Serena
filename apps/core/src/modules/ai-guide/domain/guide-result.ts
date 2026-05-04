import type { GuideUseCaseId } from "./guide-use-case-id.ts";
import type { PromptId } from "./prompt-id.ts";

/** Discriminated union: a technical failure must never appear as a successful output. */
export type GuideResult = GuideResultSuccess | GuideResultFailed;

export type GuideResultSuccess = {
  status: "success";
  useCaseId: GuideUseCaseId;
  output: unknown;
  metadata: {
    provider: string;
    model: string;
    attempts: number;
    auditId?: string;
    auditRecorded: boolean;
    promptId: PromptId;
    promptVersion: number;
  };
};

export type GuideResultFailed = {
  status: "failed";
  useCaseId: GuideUseCaseId;
  error: {
    message: string;
    code?: string;
    cause?: unknown;
  };
  metadata: {
    provider: string;
    model: string;
    attempts: number;
    auditId?: string;
    auditRecorded: boolean;
    promptId: PromptId;
    promptVersion: number;
  };
};
