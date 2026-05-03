import type { GuideUseCaseId } from "./guide-use-case-id.ts";

export type GuideResult<T = unknown> = {
  useCaseId: GuideUseCaseId;
  output: T;
  metadata: {
    tokensUsed?: number;
    modelUsed?: string;
    executionTimeMs: number;
    retryCount: number;
  };
  audited: boolean;
};
