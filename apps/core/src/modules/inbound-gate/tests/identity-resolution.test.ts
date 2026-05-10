import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPipeline } from "../../../bootstrap/create-in-memory-pipeline.ts";

test("DR1: WhatsApp contact resolves from externalSenderId", async () => {
  const pipeline = await createInMemoryPipeline();
  const result = await pipeline.identityResolver.resolve({
    channel: "whatsapp",
    externalSenderId: "5491111111111",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "c1");
  assert.equal(result.role, "contact");
  assert.equal(result.authorized, true);
});

test("DR3: Authorized local voice device resolves to Marta", async () => {
  const pipeline = await createInMemoryPipeline();
  const result = await pipeline.identityResolver.resolve({
    channel: "voice",
    externalSenderId: "serena_device_001",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.role, "elder");
});

test("DR3: Authorized local web_chat session resolves to Marta", async () => {
  const pipeline = await createInMemoryPipeline();
  const result = await pipeline.identityResolver.resolve({
    channel: "web_chat",
    externalSenderId: "session_abc",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.personId, "marta");
  assert.equal(result.role, "elder");
});

test("DR2/DR4: Unknown senders resolve unknown", async () => {
  const pipeline = await createInMemoryPipeline();
  const unknownWhatsApp = await pipeline.identityResolver.resolve({
    channel: "whatsapp",
    externalSenderId: "5498888888888",
    text: "hola",
    tenantId: "demo",
  });
  const unknownVoice = await pipeline.identityResolver.resolve({
    channel: "voice",
    externalSenderId: "unknown_device_001",
    text: "hola",
    tenantId: "demo",
  });

  assert.equal(unknownWhatsApp.status, "unknown");
  assert.equal(unknownVoice.status, "unknown");
});
