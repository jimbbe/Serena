/**
 * T32 — Unit tests for resolveConfirmationInput keyword resolver.
 *
 * Table-driven tests covering all keyword variants, unknown text,
 * empty input, mixed case, and embedded keywords.
 *
 * Pure function — no mocks needed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfirmationInput } from "../application/resolve-confirmation-input.ts";

// ---------------------------------------------------------------------------
// Confirmation keywords → "confirm"
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'sí' → confirm", () => {
  const result = resolveConfirmationInput("sí");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "sí");
});

test("resolveConfirmationInput: 'si' → confirm", () => {
  const result = resolveConfirmationInput("si");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "si");
});

test("resolveConfirmationInput: 'dale' → confirm", () => {
  const result = resolveConfirmationInput("dale");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "dale");
});

test("resolveConfirmationInput: 'ok' → confirm", () => {
  const result = resolveConfirmationInput("ok");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "ok");
});

test("resolveConfirmationInput: 'mandalo' → confirm", () => {
  const result = resolveConfirmationInput("mandalo");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "mandalo");
});

test("resolveConfirmationInput: 'envialo' → confirm", () => {
  const result = resolveConfirmationInput("envialo");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "envialo");
});

test("resolveConfirmationInput: 'confirmo' → confirm", () => {
  const result = resolveConfirmationInput("confirmo");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "confirmo");
});

// ---------------------------------------------------------------------------
// Cancel keywords → "cancel"
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'no' → cancel", () => {
  const result = resolveConfirmationInput("no");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "no");
});

test("resolveConfirmationInput: 'mejor no' → cancel", () => {
  const result = resolveConfirmationInput("mejor no");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "mejor no");
});

test("resolveConfirmationInput: 'cancelar' → cancel", () => {
  const result = resolveConfirmationInput("cancelar");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "cancelar");
});

test("resolveConfirmationInput: 'cancela' → cancel", () => {
  const result = resolveConfirmationInput("cancela");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "cancela");
});

test("resolveConfirmationInput: 'espera' → cancel", () => {
  const result = resolveConfirmationInput("espera");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "espera");
});

// ---------------------------------------------------------------------------
// Edit keywords → "edit"
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'cambi' → edit", () => {
  const result = resolveConfirmationInput("cambi");
  assert.equal(result.action, "edit");
  assert.equal(result.matchedKeyword, "cambi");
});

test("resolveConfirmationInput: 'edita' → edit", () => {
  const result = resolveConfirmationInput("edita");
  assert.equal(result.action, "edit");
  assert.equal(result.matchedKeyword, "edita");
});

test("resolveConfirmationInput: 'corregi' → edit", () => {
  const result = resolveConfirmationInput("corregi");
  assert.equal(result.action, "edit");
  assert.equal(result.matchedKeyword, "corregi");
});

// ---------------------------------------------------------------------------
// Unknown → "unknown"
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: unknown text → unknown", () => {
  const result = resolveConfirmationInput("hola como estas");
  assert.equal(result.action, "unknown");
  assert.equal(result.matchedKeyword, null);
});

test("resolveConfirmationInput: empty string → unknown", () => {
  const result = resolveConfirmationInput("");
  assert.equal(result.action, "unknown");
  assert.equal(result.matchedKeyword, null);
});

test("resolveConfirmationInput: whitespace only → unknown", () => {
  const result = resolveConfirmationInput("   ");
  assert.equal(result.action, "unknown");
  assert.equal(result.matchedKeyword, null);
});

// ---------------------------------------------------------------------------
// Mixed case
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'DALE' → confirm (case insensitive)", () => {
  const result = resolveConfirmationInput("DALE");
  assert.equal(result.action, "confirm");
  assert.equal(result.matchedKeyword, "DALE");
});

test("resolveConfirmationInput: 'No' → cancel (case insensitive)", () => {
  const result = resolveConfirmationInput("No");
  assert.equal(result.action, "cancel");
  assert.equal(result.matchedKeyword, "No");
});

test("resolveConfirmationInput: 'Cambi' → edit (case insensitive)", () => {
  const result = resolveConfirmationInput("Cambi");
  assert.equal(result.action, "edit");
  assert.equal(result.matchedKeyword, "Cambi");
});

// ---------------------------------------------------------------------------
// Embedded in longer text
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'sí, mandalo' → confirm (embedded)", () => {
  const result = resolveConfirmationInput("sí, mandalo");
  assert.equal(result.action, "confirm");
  assert.ok(result.matchedKeyword !== null);
});

test("resolveConfirmationInput: 'mejor no mandes' → cancel (embedded)", () => {
  const result = resolveConfirmationInput("mejor no mandes");
  assert.equal(result.action, "cancel");
  assert.ok(result.matchedKeyword !== null);
});

test("resolveConfirmationInput: 'cambiá el mensaje' → edit (embedded)", () => {
  const result = resolveConfirmationInput("cambiá el mensaje");
  assert.equal(result.action, "edit");
  assert.ok(result.matchedKeyword !== null);
});

// ---------------------------------------------------------------------------
// Edit intent overrides confirmation (E3 from spec)
// ---------------------------------------------------------------------------

test("resolveConfirmationInput: 'sí, pero cambiá el mensaje' → edit wins over confirm", () => {
  const result = resolveConfirmationInput("sí, pero cambiá el mensaje");
  assert.equal(result.action, "edit");
});
