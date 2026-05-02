import type { Contact } from "../../domain/contact.ts";
import type { ContactDirectory } from "../ports/contact-directory.ts";

export type ResolveContactInput = {
  displayName: string;
};

export type ResolveContactDependencies = {
  contactDirectory: ContactDirectory;
};

export class ResolveContact {
  private readonly deps: ResolveContactDependencies;

  constructor(deps: ResolveContactDependencies) {
    this.deps = deps;
  }

  async execute(input: ResolveContactInput): Promise<Contact | undefined> {
    const normalizedInput = input.displayName.trim().toLocaleLowerCase();
    const all = await this.deps.contactDirectory.findAll();

    return all.find((contact) => {
      const normalizedDisplayName = contact.displayName.trim().toLocaleLowerCase();
      return normalizedDisplayName === normalizedInput;
    });
  }
}
