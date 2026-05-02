import test from "node:test";
import assert from "node:assert/strict";

import type { Contact } from "../domain/contact.ts";
import { InMemoryContactDirectory, loadContactsFromSeed } from "../infrastructure/memory/in-memory-contact-directory.ts";
import { ResolveContact } from "../application/use-cases/resolve-contact.ts";

// ─── Core Tests ───

test("loads contacts from seed data", async () => {
  const contacts = await loadContactsFromSeed();

  assert.ok(Array.isArray(contacts));
  assert.ok(contacts.length >= 4);

  const maria = contacts.find((c) => c.id === "c1");
  assert.ok(maria);
  assert.equal(maria.displayName, "María");
  assert.equal(maria.whatsappId, "5491111111111");
});

test("hasAllowedSender returns true for existing contact whatsappId", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.hasAllowedSender("5491111111111");
  assert.equal(result, true);
});

test("hasAllowedSender returns false for unknown sender", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.hasAllowedSender("5499999999999");
  assert.equal(result, false);
});

test("hasAllowedSender normalizes case and whitespace", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.hasAllowedSender("  5491111111111  ");
  assert.equal(result, true);
});

test("findByWhatsAppId finds contact by whatsappId", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
    { id: "c2", displayName: "Carlos", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findByWhatsAppId("5491111111111");
  assert.ok(result);
  assert.equal(result.id, "c1");
  assert.equal(result.displayName, "María");
});

test("findByWhatsAppId returns undefined for non-existent whatsappId", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findByWhatsAppId("5490000000000");
  assert.equal(result, undefined);
});

test("findById finds contact by id", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
    { id: "c2", displayName: "Carlos", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findById("c2");
  assert.ok(result);
  assert.equal(result.id, "c2");
  assert.equal(result.displayName, "Carlos");
});

test("findById returns undefined for non-existent id", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findById("non-existent");
  assert.equal(result, undefined);
});

test("findAll returns all contacts", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
    { id: "c2", displayName: "Carlos", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findAll();
  assert.equal(result.length, 2);
  assert.deepEqual(result, contacts);
});

test("ResolveContact use case finds contact by displayName (case-insensitive)", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
    { id: "c2", displayName: "Carlos", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);
  const useCase = new ResolveContact({ contactDirectory: directory });

  const result = await useCase.execute({ displayName: "  carlos  " });
  assert.ok(result);
  assert.equal(result.id, "c2");
  assert.equal(result.displayName, "Carlos");
});

// ─── Edge Case Tests ───

test("empty contacts array — hasAllowedSender returns false, findAll returns empty", async () => {
  const directory = new InMemoryContactDirectory([]);

  const allowed = await directory.hasAllowedSender("5491111111111");
  assert.equal(allowed, false);

  const all = await directory.findAll();
  assert.equal(all.length, 0);
});

test("contact with special characters in displayName (José María)", async () => {
  const contacts = [
    { id: "c5", displayName: "José María", whatsappId: "5495555555555" },
  ];
  const directory = new InMemoryContactDirectory(contacts);
  const useCase = new ResolveContact({ contactDirectory: directory });

  const result = await useCase.execute({ displayName: "José María" });
  assert.ok(result);
  assert.equal(result.id, "c5");
  assert.equal(result.displayName, "José María");
});

test("contacts with same displayName but different whatsappId — findByWhatsAppId distinguishes them", async () => {
  const contacts = [
    { id: "c1", displayName: "Luis", whatsappId: "5491111111111" },
    { id: "c2", displayName: "Luis", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result1 = await directory.findByWhatsAppId("5491111111111");
  assert.ok(result1);
  assert.equal(result1.id, "c1");

  const result2 = await directory.findByWhatsAppId("5492222222222");
  assert.ok(result2);
  assert.equal(result2.id, "c2");
});

test("hasAllowedSender with whatsappId that differs only in country code prefix returns false", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  // Same digits, different country code
  const result = await directory.hasAllowedSender("5411111111111");
  assert.equal(result, false);
});

test("duplicate id in seed — last one wins", async () => {
  const contacts = [
    { id: "dup", displayName: "First", whatsappId: "5491111111111" },
    { id: "dup", displayName: "Second", whatsappId: "5492222222222" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findById("dup");
  assert.ok(result);
  // Map.set overwrites — last one wins
  assert.equal(result.displayName, "Second");
  assert.equal(result.whatsappId, "5492222222222");
});

test("findByWhatsAppId is case-insensitive on the whatsappId field", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);

  const result = await directory.findByWhatsAppId("5491111111111");
  assert.ok(result);
  assert.equal(result.id, "c1");
});

test("ResolveContact with name that doesn't exist returns undefined", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);
  const useCase = new ResolveContact({ contactDirectory: directory });

  const result = await useCase.execute({ displayName: "Pedro" });
  assert.equal(result, undefined);
});

test("ResolveContact with partial name match returns undefined (exact match required)", async () => {
  const contacts = [
    { id: "c1", displayName: "María", whatsappId: "5491111111111" },
  ];
  const directory = new InMemoryContactDirectory(contacts);
  const useCase = new ResolveContact({ contactDirectory: directory });

  const result = await useCase.execute({ displayName: "Mar" });
  assert.equal(result, undefined);
});
