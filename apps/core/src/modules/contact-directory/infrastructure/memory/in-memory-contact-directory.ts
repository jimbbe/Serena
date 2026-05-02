import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Contact } from "../../domain/contact.ts";
import type { ContactDirectory } from "../../application/ports/contact-directory.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadContactsFromSeed(): Promise<Contact[]> {
  const seedPath = path.resolve(__dirname, "..", "seed", "contacts.seed.json");
  const raw = await readFile(seedPath, "utf-8");
  const contacts: Contact[] = JSON.parse(raw);
  return contacts;
}

export class InMemoryContactDirectory implements ContactDirectory {
  private readonly contacts: Contact[];
  private readonly byId = new Map<string, Contact>();
  private readonly byWhatsAppId = new Map<string, Contact>();

  constructor(contacts: Contact[]) {
    this.contacts = [...contacts];
    for (const contact of contacts) {
      this.byId.set(contact.id, contact);
      const normalizedWhatsAppId = contact.whatsappId.trim().toLocaleLowerCase();
      this.byWhatsAppId.set(normalizedWhatsAppId, contact);
    }
  }

  async hasAllowedSender(normalizedSenderId: string): Promise<boolean> {
    const normalized = normalizedSenderId.trim().toLocaleLowerCase();
    return this.byWhatsAppId.has(normalized);
  }

  async findByWhatsAppId(whatsappId: string): Promise<Contact | undefined> {
    const normalized = whatsappId.trim().toLocaleLowerCase();
    return this.byWhatsAppId.get(normalized);
  }

  async findById(id: string): Promise<Contact | undefined> {
    return this.byId.get(id);
  }

  async findAll(): Promise<readonly Contact[]> {
    return this.contacts;
  }
}
