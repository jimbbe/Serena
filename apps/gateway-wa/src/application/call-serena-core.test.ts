/**
 * T30A — Tests for callSerenaCore validation hardening.
 *
 * Covers:
 * - validatePipelineResultShape: strict type checking for all PipelineResult variants
 * - Non-JSON 2xx response error handling with body snippet
 * - Timeout error handling
 * - Token redaction in error messages
 *
 * Uses node:test + node:assert/strict — zero npm dependencies.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { PipelineResult } from "../domain/pipeline-result.ts";
import { callSerenaCore } from "./call-serena-core.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validConfig = {
  coreUrl: "http://localhost:3000",
  internalToken: "test-token",
};

const validPayload = {
  senderWhatsAppId: "5491111111111",
  messageText: "Hola, avisale a Carlos que llego tarde",
  receivedAt: "2026-05-02T22:00:00.000Z",
};

const validMessageId = "mock-001";

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

/**
 * Create a fake fetch that returns a response with the given status and body.
 *
 * When body is a string (simulating non-JSON response), json() rejects
 * but text() returns the string — simulating real fetch behavior.
 */
function fakeFetchWith(status: number, body: unknown): typeof globalThis.fetch {
  return ((_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: () =>
        typeof body === "string"
          ? Promise.reject(new Error("Not JSON"))
          : Promise.resolve(body),
      text: () => Promise.resolve(bodyStr),
    } as Response);
  }) as typeof globalThis.fetch;
}

/**
 * Create a fake fetch that throws a DOMException with name "TimeoutError",
 * simulating an AbortSignal timeout.
 */
function fakeFetchThatTimesOut(): typeof globalThis.fetch {
  return ((_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return Promise.reject(err);
  }) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Test lifecycle — restore fetch after each test
// ---------------------------------------------------------------------------

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 1 — validatePipelineResultShape (through callSerenaCore)
// ---------------------------------------------------------------------------

describe("validatePipelineResultShape", () => {
  it("accepts conversation_pending with valid senderId", async () => {
    globalThis.fetch = fakeFetchWith(200, {
      type: "conversation_pending",
      senderId: "5491111111111",
    });

    const result = await callSerenaCore(validPayload, validMessageId, validConfig);
    assert.equal(result.type, "conversation_pending");
    assert.equal((result as { senderId: string }).senderId, "5491111111111");
  });

  it("rejects conversation_pending without senderId", async () => {
    globalThis.fetch = fakeFetchWith(200, { type: "conversation_pending" });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("missing required field") &&
        err.message.includes("senderId"),
      "Should mention missing senderId",
    );
  });

  it("accepts risk_review_required with senderId and matchedSignals string[]", async () => {
    globalThis.fetch = fakeFetchWith(200, {
      type: "risk_review_required",
      senderId: "5491111111111",
      matchedSignals: ["urgent"],
    });

    const result = await callSerenaCore(validPayload, validMessageId, validConfig);
    assert.equal(result.type, "risk_review_required");
    assert.deepEqual(
      (result as { matchedSignals: readonly string[] }).matchedSignals,
      ["urgent"],
    );
  });

  it("rejects risk_review_required with matchedSignals as string", async () => {
    globalThis.fetch = fakeFetchWith(200, {
      type: "risk_review_required",
      senderId: "5491111111111",
      matchedSignals: "urgent",
    });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("matchedSignals") &&
        err.message.includes("string array"),
      "Should mention matchedSignals must be string array",
    );
  });

  it("rejects recipient_not_found without recipientName", async () => {
    globalThis.fetch = fakeFetchWith(200, {
      type: "recipient_not_found",
      senderId: "5491111111111",
    });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("missing required field") &&
        err.message.includes("recipientName"),
      "Should mention missing recipientName",
    );
  });

  it("rejects ambiguous_active_session with activeSessionIds that is not string[]", async () => {
    globalThis.fetch = fakeFetchWith(200, {
      type: "ambiguous_active_session",
      senderId: "5491111111111",
      activeSessionIds: "s1",
    });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("activeSessionIds") &&
        err.message.includes("string array"),
      "Should mention activeSessionIds must be string array",
    );
  });

  it("rejects unknown type", async () => {
    globalThis.fetch = fakeFetchWith(200, { type: "unknown_type", reason: "test" });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("Unknown PipelineResult type"),
      "Should mention unknown type",
    );
  });

  it("rejects response without type field", async () => {
    globalThis.fetch = fakeFetchWith(200, { reason: "something" });

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes('missing required "type"'),
      "Should mention missing type field",
    );
  });

  it("rejects JSON body that is not an object (array)", async () => {
    globalThis.fetch = fakeFetchWith(200, ["not", "an", "object"]);

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Invalid PipelineResult") &&
        err.message.includes("not a JSON object"),
      "Should mention not a JSON object",
    );
  });
});

// ---------------------------------------------------------------------------
// 2 — callSerenaCore HTTP error handling
// ---------------------------------------------------------------------------

describe("callSerenaCore HTTP error handling", () => {
  it("rejects non-JSON 2xx response with body snippet in error", async () => {
    const nonJsonBody = "<html>Server Error</html>";
    globalThis.fetch = fakeFetchWith(200, nonJsonBody);

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) =>
        err.message.includes("Serena Core response was not valid JSON") &&
        err.message.includes(nonJsonBody),
      "Error should include body snippet",
    );
  });

  it("timeout returns clear error", async () => {
    globalThis.fetch = fakeFetchThatTimesOut();

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) => err.message.includes("timed out"),
      "Error should mention timeout",
    );
  });

  it("body with SERENA_INTERNAL_TOKEN is redacted in error", async () => {
    const token = validConfig.internalToken; // "test-token"
    const bodyWithToken = `Some error text containing ${token} in the middle`;
    globalThis.fetch = fakeFetchWith(200, bodyWithToken);

    await assert.rejects(
      callSerenaCore(validPayload, validMessageId, validConfig),
      (err: Error) => {
        // Error must NOT contain the raw token
        if (err.message.includes(token)) {
          throw new assert.AssertionError({
            message: `Error message should NOT contain the token "${token}" but got: ${err.message}`,
          });
        }
        // Error must contain [REDACTED]
        if (!err.message.includes("[REDACTED]")) {
          throw new assert.AssertionError({
            message: `Error message should contain "[REDACTED]" but got: ${err.message}`,
          });
        }
        return true;
      },
    );
  });
});
