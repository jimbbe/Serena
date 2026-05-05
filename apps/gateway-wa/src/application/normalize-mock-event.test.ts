/**
 * T30A — Strict UTC timestamp validation tests for normalizeMockWhatsAppEvent.
 *
 * Validates that timestamp enforces strict ISO 8601 UTC timestamps
 * with 'Z' suffix only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MockWhatsAppEvent } from "../domain/mock-whatsapp-event.ts";
import { normalizeMockWhatsAppEvent } from "../application/normalize-mock-event.ts";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const baseEvent: MockWhatsAppEvent = {
  provider: "mock",
  instanceId: "serena-main",
  messageId: "mock-001",
  from: "5491111111111",
  text: "Hola",
  timestamp: "2026-05-02T22:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeMockWhatsAppEvent — timestamp validation", () => {
  it("accepts 2026-05-05T12:34:56Z (seconds precision, Z suffix)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026-05-05T12:34:56Z",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.ok(result.ok, "Expected ok=true for valid seconds-precision UTC timestamp");
    if (result.ok) {
      assert.equal(result.value.receivedAt, "2026-05-05T12:34:56Z");
    }
  });

  it("accepts 2026-05-05T12:34:56.789Z (milliseconds precision, Z suffix)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026-05-05T12:34:56.789Z",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.ok(result.ok, "Expected ok=true for valid milliseconds-precision UTC timestamp");
    if (result.ok) {
      assert.equal(result.value.receivedAt, "2026-05-05T12:34:56.789Z");
    }
  });

  it("rejects empty timestamp", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (required, non-empty)"),
        `Expected error to include 'timestamp (required, non-empty)', got: ${result.error}`,
      );
    }
  });

  it("rejects May 2 2026 (English locale, not ISO 8601)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "May 2 2026",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (must be a valid ISO 8601 UTC timestamp)"),
        `Expected error to include 'UTC timestamp', got: ${result.error}`,
      );
    }
  });

  it("rejects 2026/05/02 (slashes, not ISO 8601)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026/05/02",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (must be a valid ISO 8601 UTC timestamp)"),
        `Expected error to include 'UTC timestamp', got: ${result.error}`,
      );
    }
  });

  it("rejects timestamp without timezone (2026-05-05T12:34:56)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026-05-05T12:34:56",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (must be a valid ISO 8601 UTC timestamp)"),
        `Expected error to include 'UTC timestamp', got: ${result.error}`,
      );
    }
  });

  it("rejects 2026-02-31T00:00:00.000Z (impossible date)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026-02-31T00:00:00.000Z",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (must be a valid ISO 8601 UTC timestamp)"),
        `Expected error to include 'UTC timestamp', got: ${result.error}`,
      );
    }
  });

  it("rejects timestamp with timezone offset (+03:00)", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "2026-05-05T12:34:56+03:00",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (must be a valid ISO 8601 UTC timestamp)"),
        `Expected error to include 'UTC timestamp', got: ${result.error}`,
      );
    }
  });

  it("rejects whitespace-only timestamp", () => {
    const event: MockWhatsAppEvent = {
      ...baseEvent,
      timestamp: "   ",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("timestamp (required, non-empty)"),
        `Expected error to include 'required, non-empty', got: ${result.error}`,
      );
    }
  });
});
