export type MediationRequest = {
  recipientName: string;
  messageToRelay: string;
  confidence: "high" | "medium" | "low";
  source: "rule" | "llm";
};
