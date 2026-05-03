export type ExecutionPolicy = {
  maxTokens: number;
  temperature: number;
  retryOnFailure: boolean;
  maxRetries: number;
  timeoutMs: number;
};
