import type { IncomingWhatsAppMessage } from "../../domain/incoming-message.ts";

export type WhatsAppGateway = {
  sendMessage(toWhatsAppId: string, text: string): Promise<void>;
  onMessage(handler: (message: IncomingWhatsAppMessage) => Promise<void>): void;
};
