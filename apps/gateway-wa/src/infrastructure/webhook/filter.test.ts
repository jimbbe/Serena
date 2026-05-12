/**
 * T5 — Webhook self-message filter (tests first).
 *
 * Tests for filtering self-messages and non-text messages from
 * Evolution API webhook payloads.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EvolutionWebhookPayload } from "../evolution/types.ts";
import { isSelfMessage, extractText, shouldDiscard } from "./filter.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<{
  fromMe: boolean;
  conversation: string | undefined;
  extendedText: string | undefined;
}> = {}): EvolutionWebhookPayload {
  const msg: EvolutionWebhookPayload["data"]["message"] = {};

  // Only set conversation if explicitly provided
  if ("conversation" in overrides) {
    const c = overrides.conversation;
    if (c !== undefined) msg.conversation = c;
  } else {
    msg.conversation = "Hola";
  }

  if (overrides.extendedText !== undefined) {
    msg.extendedTextMessage = { text: overrides.extendedText };
  }

  return {
    event: "MESSAGES_UPSERT",
    instance: "serena-main",
    data: {
      key: {
        id: "wamid-001",
        remoteJid: "5491111111111@s.whatsapp.net",
        fromMe: overrides.fromMe ?? false,
      },
      messageTimestamp: 1715000000,
      message: msg,
    },
  };
}

// ---------------------------------------------------------------------------
// isSelfMessage
// ---------------------------------------------------------------------------

describe("isSelfMessage", () => {
  it("returns true when fromMe is true", () => {
    const payload = makePayload({ fromMe: true });
    assert.equal(isSelfMessage(payload), true);
  });

  it("returns false when fromMe is false", () => {
    const payload = makePayload({ fromMe: false });
    assert.equal(isSelfMessage(payload), false);
  });

  it("returns false when fromMe is undefined", () => {
    const payload = makePayload();
    // fromMe defaults to false in fixture
    assert.equal(isSelfMessage(payload), false);
  });
});

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe("extractText", () => {
  it("extracts from conversation field", () => {
    const payload = makePayload({ conversation: "Hola mundo" });
    assert.equal(extractText(payload), "Hola mundo");
  });

  it("extracts from extendedTextMessage when conversation is absent", () => {
    const payload = makePayload({
      conversation: undefined,
      extendedText: "reply text",
    });
    assert.equal(extractText(payload), "reply text");
  });

  it("prefers conversation over extendedTextMessage when both exist", () => {
    const payload = makePayload({
      conversation: "direct text",
      extendedText: "reply text",
    });
    assert.equal(extractText(payload), "direct text");
  });

  it("returns null when neither field has text", () => {
    const payload = makePayload({
      conversation: undefined,
      extendedText: undefined,
    });
    // conversation & extendedTextMessage are absent from message
    const p: EvolutionWebhookPayload = {
      event: "MESSAGES_UPSERT",
      instance: "test",
      data: {
        key: { id: "1", remoteJid: "x", fromMe: false },
        messageTimestamp: 1,
        message: {}, // no text fields
      },
    };
    assert.equal(extractText(p), null);
  });
});

// ---------------------------------------------------------------------------
// shouldDiscard
// ---------------------------------------------------------------------------

describe("shouldDiscard", () => {
  it("discards self-messages with reason self_message", () => {
    const payload = makePayload({ fromMe: true });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "self_message");
  });

  it("discards image messages with reason non-text", () => {
    const payload: EvolutionWebhookPayload = {
      event: "MESSAGES_UPSERT",
      instance: "test",
      data: {
        key: { id: "1", remoteJid: "x", fromMe: false },
        messageTimestamp: 1,
        message: { imageMessage: {} },
      },
    };
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "non-text");
  });

  it("discards audio messages with reason non-text", () => {
    const payload: EvolutionWebhookPayload = {
      event: "MESSAGES_UPSERT",
      instance: "test",
      data: {
        key: { id: "1", remoteJid: "x", fromMe: false },
        messageTimestamp: 1,
        message: { audioMessage: {} },
      },
    };
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "non-text");
  });

  it("discards video messages with reason non-text", () => {
    const payload: EvolutionWebhookPayload = {
      event: "MESSAGES_UPSERT",
      instance: "test",
      data: {
        key: { id: "1", remoteJid: "x", fromMe: false },
        messageTimestamp: 1,
        message: { videoMessage: {} },
      },
    };
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "non-text");
  });

  it("discards empty conversation string", () => {
    const payload = makePayload({ conversation: "" });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "non-text");
  });

  it("discards whitespace-only conversation", () => {
    const payload = makePayload({ conversation: "   " });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "non-text");
  });

  it("does NOT discard valid text from conversation", () => {
    const payload = makePayload({ conversation: "Hola!" });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, false);
  });

  it("does NOT discard valid text from extendedTextMessage", () => {
    const payload = makePayload({
      conversation: undefined,
      extendedText: "reply",
    });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, false);
  });

  it("self-message takes priority over text check", () => {
    const payload = makePayload({ fromMe: true, conversation: "Hola" });
    const result = shouldDiscard(payload);
    assert.equal(result.discard, true);
    assert.equal(result.reason, "self_message");
  });
});
