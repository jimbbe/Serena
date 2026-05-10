import type { ContactDirectory } from "../../contact-directory/application/ports/contact-directory.ts";
import type { InboundChannel } from "../../shared/channel.ts";

export type RecipientResolution =
  | {
      status: "resolved";
      personId: string;
      displayName: string;
      channel: InboundChannel | null;
      externalId: string | null;
    }
  | {
      status: "ambiguous";
      candidates: Array<{
        personId: string;
        displayName: string;
      }>;
    }
  | {
      status: "not_found";
    };

export async function resolveOutboundRecipient(
  hint: string,
  contactDirectory: ContactDirectory,
): Promise<RecipientResolution> {
  const normalizedHint = hint.trim().toLocaleLowerCase();
  const matches = (await contactDirectory.findAll()).filter((contact) => {
    return contact.displayName.trim().toLocaleLowerCase() === normalizedHint;
  });

  if (matches.length === 0) {
    return { status: "not_found" };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidates: matches.map((contact) => ({
        personId: contact.id,
        displayName: contact.displayName,
      })),
    };
  }

  const match = matches[0]!;
  const whatsappBinding = match.externalBindings?.find((binding) => binding.channel === "whatsapp") ?? null;

  return {
    status: "resolved",
    personId: match.id,
    displayName: match.displayName,
    channel: whatsappBinding?.channel ?? "whatsapp",
    externalId: whatsappBinding?.externalId ?? match.whatsappId,
  };
}
