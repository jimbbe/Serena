import type { InboundChannel } from "../../../shared/channel.ts";
import type { Contact } from "../../domain/contact.ts";

export type ContactDirectory = {
  hasAllowedSender(normalizedSenderId: string): Promise<boolean>;
  findByWhatsAppId(whatsappId: string): Promise<Contact | undefined>;
  findByChannelBinding(channel: InboundChannel, externalId: string): Promise<Contact | undefined>;
  findById(id: string): Promise<Contact | undefined>;
  findAll(): Promise<readonly Contact[]>;
};
