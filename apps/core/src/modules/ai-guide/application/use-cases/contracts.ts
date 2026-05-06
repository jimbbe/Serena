import type { UseCaseContract } from "../../domain/use-case-contract.ts";

const defaultPolicy = {
  maxTokens: 256,
  temperature: 0.7,
  retryOnFailure: false,
  maxRetries: 0,
  timeoutMs: 10000,
} as const;

export const defaultContracts: UseCaseContract[] = [
  {
    id: "serena.conversation.reply",
    promptId: "serena.conversation.reply.v1",
    executionPolicy: { ...defaultPolicy },
  },
  {
    id: "serena.risk.review",
    promptId: "serena.risk.review.v1",
    executionPolicy: { ...defaultPolicy, temperature: 0.3 },
  },
  {
    id: "serena.mediation.understand_request",
    promptId: "serena.mediation.understand_request.v1",
    executionPolicy: { ...defaultPolicy },
  },
  {
    id: "serena.mediation.clarify",
    promptId: "serena.mediation.clarify.v1",
    executionPolicy: { ...defaultPolicy },
  },
  {
    id: "serena.inbound.classify_intent",
    promptId: "serena.inbound.classify_intent.v1",
    executionPolicy: { ...defaultPolicy, temperature: 0.2 },
  },
];
