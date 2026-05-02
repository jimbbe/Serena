export type PipelineResult =
  | { type: "message_sent"; toWhatsAppId: string; sessionId: string }
  | { type: "message_received_and_relayed"; sessionId: string }
  | { type: "blocked"; reason: string }
  | { type: "no_action_taken"; reason: string };

export type PipelineInput = {
  senderWhatsAppId: string;
  messageText: string;
  receivedAt: string;
};
