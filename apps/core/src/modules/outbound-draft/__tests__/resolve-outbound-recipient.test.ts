import assert from "node:assert/strict";
import test from "node:test";

import type { ContactDirectory } from "../../contact-directory/application/ports/contact-directory.ts";
import type { Contact } from "../../contact-directory/domain/contact.ts";
import { resolveOutboundRecipient } from "../application/resolve-outbound-recipient.ts";

function makeDirectory(contacts: Contact[]): ContactDirectory {
  return {
    hasAllowedSender: async () => true,
    findByWhatsAppId: async () => undefined,
    findByChannelBinding: async () => undefined,
    findById: async () => undefined,
    findAll: async () => contacts,
  };
}

test("resolveOutboundRecipient resolves exact displayName case-insensitively", async () => {
  const result = await resolveOutboundRecipient("  carlos  ", makeDirectory([
    {
      id: "carlos",
      displayName: "Carlos",
      whatsappId: "fallback-id",
      externalBindings: [{
        channel: "whatsapp",
        externalId: "5491111111111",
        ownerPersonId: "carlos",
        role: "contact",
        displayName: "Carlos",
        authorized: true,
        bindingKind: "whatsapp_sender",
      }],
    },
  ]));

  assert.deepEqual(result, {
    status: "resolved",
    personId: "carlos",
    displayName: "Carlos",
    channel: "whatsapp",
    externalId: "5491111111111",
  });
});

test("resolveOutboundRecipient returns not_found when no contact matches", async () => {
  const result = await resolveOutboundRecipient("Unknown", makeDirectory([]));
  assert.deepEqual(result, { status: "not_found" });
});

test("resolveOutboundRecipient returns ambiguous when multiple contacts match", async () => {
  const result = await resolveOutboundRecipient("Carlos", makeDirectory([
    { id: "c1", displayName: "Carlos", whatsappId: "1" },
    { id: "c2", displayName: "Carlos", whatsappId: "2" },
  ]));

  assert.deepEqual(result, {
    status: "ambiguous",
    candidates: [
      { personId: "c1", displayName: "Carlos" },
      { personId: "c2", displayName: "Carlos" },
    ],
  });
});

test("resolveOutboundRecipient falls back to whatsappId when no binding exists", async () => {
  const result = await resolveOutboundRecipient("Carlos", makeDirectory([
    { id: "carlos", displayName: "Carlos", whatsappId: "5491111111111" },
  ]));

  assert.deepEqual(result, {
    status: "resolved",
    personId: "carlos",
    displayName: "Carlos",
    channel: "whatsapp",
    externalId: "5491111111111",
  });
});
