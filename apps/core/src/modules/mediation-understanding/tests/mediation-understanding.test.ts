import test from "node:test";
import assert from "node:assert/strict";

import { RuleBasedMediationUnderstanding } from "../infrastructure/rules/rule-based-mediation-understanding.ts";
import { SPANISH_MEDIATION_PATTERNS } from "../infrastructure/rules/spanish-mediation-patterns.ts";
import { ExtractMediationRequest } from "../application/use-cases/extract-mediation-request.ts";

// ── Helpers ──────────────────────────────────────────────────────────

const adapter = new RuleBasedMediationUnderstanding();
const useCase = new ExtractMediationRequest({ mediationUnderstanding: adapter });

async function extract(text: string, senderId = "maria") {
  return adapter.extract(text, senderId);
}

async function extractViaUseCase(text: string, senderId = "maria") {
  return useCase.execute({ text, senderId });
}

// ── Core Tests (12) ──────────────────────────────────────────────────

test('"avisale a Carlos que llego tarde" → extracts recipient and message', async () => {
  const result = await extract("avisale a Carlos que llego tarde");
  assert.ok(result);
  assert.equal(result!.recipientName, "Carlos");
  assert.equal(result!.messageToRelay, "llego tarde");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"decile a María que la llamo mañana" → extracts correctly', async () => {
  const result = await extract("decile a María que la llamo mañana");
  assert.ok(result);
  assert.equal(result!.recipientName, "María");
  assert.equal(result!.messageToRelay, "la llamo mañana");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"llamá a Juan" → recipient="Juan", message="llamá" (verb-as-message)', async () => {
  const result = await extract("llamá a Juan");
  assert.ok(result);
  assert.equal(result!.recipientName, "Juan");
  assert.equal(result!.messageToRelay, "llamá");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"escribile a María que voy a llegar" → extracts correctly', async () => {
  const result = await extract("escribile a María que voy a llegar");
  assert.ok(result);
  assert.equal(result!.recipientName, "María");
  assert.equal(result!.messageToRelay, "voy a llegar");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"contactá a Juan" → recipient="Juan"', async () => {
  const result = await extract("contactá a Juan");
  assert.ok(result);
  assert.equal(result!.recipientName, "Juan");
  assert.equal(result!.messageToRelay, "contactá");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"pedile a Carlos que venga" → extracts correctly', async () => {
  const result = await extract("pedile a Carlos que venga");
  assert.ok(result);
  assert.equal(result!.recipientName, "Carlos");
  assert.equal(result!.messageToRelay, "venga");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test('"hola, cómo estás?" → returns null (no mediation verb)', async () => {
  const result = await extract("hola, cómo estás?");
  assert.equal(result, null);
});

test('"avisale a Carlos que hay peligro" → message includes "peligro" literally', async () => {
  const result = await extract("avisale a Carlos que hay peligro");
  assert.ok(result);
  assert.equal(result!.messageToRelay, "hay peligro");
});

test("Case insensitivity: uppercase input works", async () => {
  const result = await extract("AVISALE A CARLOS QUE LLEGO");
  assert.ok(result);
  assert.equal(result!.recipientName, "CARLOS");
  assert.equal(result!.messageToRelay, "LLEGO");
});

test("Extra whitespace is trimmed", async () => {
  const result = await extract("  avisale  a  Carlos  que  llego tarde  ");
  assert.ok(result);
  assert.equal(result!.recipientName, "Carlos");
  assert.equal(result!.messageToRelay, "llego tarde");
});

test('Multi-word message with nested "que" is preserved fully', async () => {
  const result = await extract("avisale a Carlos que llego tarde y que no se preocupe");
  assert.ok(result);
  assert.equal(result!.messageToRelay, "llego tarde y que no se preocupe");
});

test('"avisale" without "a" or name → returns null', async () => {
  const result = await extract("avisale");
  assert.equal(result, null);
});

// ── Edge Case Tests (10) ─────────────────────────────────────────────

test("Name with accent: José → recipient preserves accent", async () => {
  const result = await extract("avisale a José que venga");
  assert.ok(result);
  assert.equal(result!.recipientName, "José");
});

test("Two-word name: María José → recipient captures both words", async () => {
  const result = await extract("decile a María José que la llamo");
  assert.ok(result);
  assert.equal(result!.recipientName, "María José");
});

test('"llama a Carlos" (unaccented form) works same as "llamá a Carlos"', async () => {
  const result = await extract("llama a Carlos");
  assert.ok(result);
  assert.equal(result!.recipientName, "Carlos");
  assert.equal(result!.messageToRelay, "llamá");
});

test("Message with special characters ($) is preserved", async () => {
  const result = await extract("avisale a Carlos que el precio es $500");
  assert.ok(result);
  assert.equal(result!.messageToRelay, "el precio es $500");
});

test("Very long message >200 chars still extracts fully", async () => {
  const longMsg = "este es un mensaje muy largo ".repeat(10).trim();
  const text = `avisale a Carlos que ${longMsg}`;
  const result = await extract(text);
  assert.ok(result);
  assert.equal(result!.messageToRelay, longMsg);
});

test('"avisale" alone without "a" or name → returns null', async () => {
  const result = await extract("avisale");
  assert.equal(result, null);
});

test("Text starting with unrelated words → returns null", async () => {
  const result = await extract("hola avisale a Carlos que viene");
  assert.equal(result, null);
});

test("Two verbs in one message → extracts first match only", async () => {
  // "avisale" matches first (ordered before "decile" in patterns);
  // the second verb becomes part of the message since the first pattern consumes the entire string
  const result = await extract("avisale a Carlos que vengan, también decile a María");
  assert.ok(result);
  assert.equal(result!.recipientName, "Carlos");
  assert.equal(result!.messageToRelay, "vengan, también decile a María");
});

test("Emoji in message is preserved", async () => {
  const result = await extract("avisale a Carlos que llega 🎉");
  assert.ok(result);
  assert.ok(result!.messageToRelay.includes("🎉"));
});

test("Verb in middle of sentence returns null (pattern requires verb at start)", async () => {
  const result = await extract("por favor avisale a Carlos que llega");
  assert.equal(result, null);
});

// ── Use Case Delegation Tests ────────────────────────────────────────

test("ExtractMediationRequest delegates to MediationUnderstanding port", async () => {
  const result = await extractViaUseCase("decile a María que te quiero");
  assert.ok(result);
  assert.equal(result!.recipientName, "María");
  assert.equal(result!.messageToRelay, "te quiero");
  assert.equal(result!.confidence, "high");
  assert.equal(result!.source, "rule");
});

test("ExtractMediationRequest returns null when port returns null", async () => {
  const result = await extractViaUseCase("hola, cómo estás?");
  assert.equal(result, null);
});

// ── Custom patterns injection ────────────────────────────────────────

test("RuleBasedMediationUnderstanding accepts custom patterns", async () => {
  const customPatterns = [
    {
      verb: "chiflá",
      regex: /^chifl[áa]\s+a\s+(\S+(?:\s+\S+)?)$/i,
      hasMessageCapture: false,
    },
  ];
  const customAdapter = new RuleBasedMediationUnderstanding(customPatterns);
  const result = await customAdapter.extract("chiflá a Pedro", "maria");
  assert.ok(result);
  assert.equal(result!.recipientName, "Pedro");
  assert.equal(result!.messageToRelay, "chiflá");
});
