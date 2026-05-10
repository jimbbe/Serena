/**
 * T30 — Unit tests for InMemoryExternalIdentityResolver.
 *
 * Tests all resolution paths: known sender on each channel, unknown
 * sender sentinel, blocked sender short-circuit, and default tenant.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIdentityResolver } from "../infrastructure/memory/in-memory-external-identity-resolver.ts";
import type { InboundMessageCommand } from "../domain/inbound-message-command.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function command(
  overrides: Partial<InboundMessageCommand>,
): InboundMessageCommand {
  return {
    channel: "whatsapp",
    externalSenderId: "unknown",
    text: "hola",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("whatsapp known sender resolves to marta", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5492600000000",
    }),
  );

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.role, "elder");
  assert.equal(result.displayName, "Marta");
  assert.equal(result.authorized, true);
  assert.equal(result.tenantId, "demo");
  assert.equal(result.channel, "whatsapp");
  assert.equal(result.externalSenderId, "+5492600000000");
});

test("voice known device resolves to marta", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "voice",
      externalSenderId: "serena_device_001",
    }),
  );

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.role, "elder");
  assert.equal(result.displayName, "Marta");
  assert.equal(result.authorized, true);
});

test("web_chat known session resolves to marta", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "web_chat",
      externalSenderId: "session_abc",
    }),
  );

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.role, "elder");
  assert.equal(result.displayName, "Marta");
  assert.equal(result.authorized, true);
});

test("unknown sender returns status: unknown", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5490000000000",
    }),
  );

  assert.equal(result.status, "unknown");
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "unknown_sender");
  assert.equal(result.tenantId, "demo");
  assert.equal(result.channel, "whatsapp");
  assert.equal(result.externalSenderId, "+5490000000000");
});

test("blocked sender returns status: blocked", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5499999999999",
    }),
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "sender_blocked");
});

test("missing tenantId defaults to demo", async () => {
  const resolver = new InMemoryExternalIdentityResolver();
  const result = await resolver.resolve(
    command({
      // No tenantId
      channel: "whatsapp",
      externalSenderId: "+5492600000000",
    }),
  );

  // Should still resolve because tenantId defaults to "demo"
  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.tenantId, "demo");
});

test("extra entries at construction time extend the registry", async () => {
  const resolver = new InMemoryExternalIdentityResolver({
    "demo:telegram:tgauthor_001": {
      status: "resolved",
      tenantId: "demo",
      channel: "telegram",
      externalSenderId: "tgauthor_001",
      personId: "author_001",
      actorId: "author_001",
      role: "system",
      displayName: "Serena Admin",
      authorized: true,
    },
  });

  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "telegram",
      externalSenderId: "tgauthor_001",
    }),
  );

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "author_001");
  assert.equal(result.role, "system");
  assert.equal(result.displayName, "Serena Admin");
  assert.equal(result.authorized, true);
});

test("extra entries override defaults", async () => {
  // Override Marta's display name via extra entries
  const resolver = new InMemoryExternalIdentityResolver({
    "demo:whatsapp:+5492600000000": {
      status: "resolved",
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5492600000000",
      personId: "marta",
      actorId: "marta",
      role: "elder",
      displayName: "Marta (custom)",
      authorized: true,
    },
  });

  const result = await resolver.resolve(
    command({
      tenantId: "demo",
      channel: "whatsapp",
      externalSenderId: "+5492600000000",
    }),
  );

  assert.equal(result.displayName, "Marta (custom)");
});
