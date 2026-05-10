/**
 * T6 — Webhook normalizer tests.
 *
 * Tests for mapping Evolution API webhook payloads into NormalizedWhatsAppInboundMessage.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EvolutionWebhookPayload } from "../evolution/types.ts";
import { normalizeEvolutionPayload } from "./normalizer.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<{
  remoteJid: string;
  messageId: string;
  conversation: string | undefined;
  extendedText: string | undefined;
  pushName: string | undefined;
  timestamp: number;
}> = {}): EvolutionWebhookPayload {
  const msg: EvolutionWebhookPayload["data"]["message"] = {};

  // Only set conversation if explicitly provided
  if ("conversation" in overrides) {
    const c = overrides.conversation;
    if (c !== undefined) msg.conversation = c;
  } else {
    msg.conversation = "Hola mundo";
  }

  if (overrides.extendedText !== undefined) {
    msg.extendedTextMessage = { text: overrides.extendedText };
  }

  const payload: EvolutionWebhookPayload = {
    event: "MESSAGES_UPSERT",
    instance: "serena-main",
    data: {
      key: {
        id: overrides.messageId ?? "wamid-001",
        remoteJid: overrides.remoteJid ?? "5491111111111@s.whatsapp.net",
        fromMe: false,
      },
      messageTimestamp: overrides.timestamp ?? 1715000000,
      message: msg,
    },
  };

  if ("pushName" in overrides) {
    const pn = overrides.pushName;
    if (pn !== undefined) payload.data.pushName = pn;
  } else {
    payload.data.pushName = "Maria";
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeEvolutionPayload", () => {
  it("strips @s.whatsapp.net suffix from sender", () => {
    const payload = makePayload({ remoteJid: "5491111111111@s.whatsapp.net" });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.senderWhatsAppId, "5491111111111");
  });

  it("handles JID without suffix gracefully", () => {
    const payload = makePayload({ remoteJid: "5491111111111" });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.senderWhatsAppId, "5491111111111");
  });

  it("copies messageId from key.id", () => {
    const payload = makePayload({ messageId: "wamid-custom-123" });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.messageId, "wamid-custom-123");
  });

  it("extracts text from conversation", () => {
    const payload = makePayload({ conversation: "Hola, como estas?" });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.text, "Hola, como estas?");
  });

  it("extracts text from extendedTextMessage fallback", () => {
    const payload = makePayload({
      conversation: undefined,
      extendedText: "reply text here",
    });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.text, "reply text here");
  });

  it("converts unix timestamp to ISO 8601 UTC", () => {
    const payload = makePayload({ timestamp: 1715000000 });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    // 1715000000 → 2024-05-06T12:53:20.000Z
    const date = new Date(1715000000 * 1000);
    assert.equal(result.receivedAt, date.toISOString());
  });

  it("converts another timestamp correctly", () => {
    const payload = makePayload({ timestamp: 1700000000 });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    const date = new Date(1700000000 * 1000);
    assert.equal(result.receivedAt, date.toISOString());
  });

  it("sets pushName as senderName when present", () => {
    const payload = makePayload({ pushName: "Maria L." });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.senderName, "Maria L.");
  });

  it("senderName is undefined when pushName is absent", () => {
    const payload = makePayload({ pushName: undefined });
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.senderName, undefined);
  });

  it("sets instanceId from parameter", () => {
    const payload = makePayload();
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.instanceId, "serena-main");
  });

  it("sets channel to whatsapp", () => {
    const payload = makePayload();
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.channel, "whatsapp");
  });

  it("includes raw payload for debugging", () => {
    const payload = makePayload();
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.deepEqual(result.raw, payload as unknown as Record<string, unknown>);
  });

  it("sets provider to evolution", () => {
    const payload = makePayload();
    const result = normalizeEvolutionPayload(payload, "serena-main");
    assert.equal(result.provider, "evolution");
  });
});
