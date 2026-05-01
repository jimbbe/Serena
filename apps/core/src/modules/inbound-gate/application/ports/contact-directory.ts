export type ContactDirectory = {
  hasAllowedSender(normalizedSenderId: string): Promise<boolean>;
};
