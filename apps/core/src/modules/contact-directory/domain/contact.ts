import type { ChannelBinding } from "../../shared/channel.ts";

export type Contact = {
  id: string;
  displayName: string;
  whatsappId: string;
  externalBindings?: ChannelBinding[];
};
