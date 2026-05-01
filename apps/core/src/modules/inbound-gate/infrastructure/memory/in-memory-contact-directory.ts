import type { ContactDirectory } from "../../application/ports/contact-directory.ts";

export class InMemoryContactDirectory implements ContactDirectory {
  private readonly allowed = new Set<string>();

  constructor(allowedSenderIds: string[]) {
    for (const senderId of allowedSenderIds) {
      const normalized = senderId.trim().toLocaleLowerCase();
      if (normalized) {
        this.allowed.add(normalized);
      }
    }
  }

  async hasAllowedSender(normalizedSenderId: string): Promise<boolean> {
    return this.allowed.has(normalizedSenderId);
  }
}
