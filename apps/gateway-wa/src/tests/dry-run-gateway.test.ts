/**
 * T18 — Tests for Mock WhatsApp Gateway / Dry-Run Adapter.
 *
 * Covers:
 * - normalizeMockWhatsAppEvent: valid, trimming, missing fields
 * - mapPipelineResultToGatewayAction: all 8 variants (via integration)
 * - callSerenaCore: config errors, HTTP errors
 * - runDryGatewayEvent: full dry-run flow for all 8 variants, wouldSend, sent always false
 *
 * Uses fake fetch to simulate Serena Core HTTP responses.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { MockWhatsAppEvent } from "../domain/mock-whatsapp-event.ts";
import type { PipelineResult, PipelineInput } from "../domain/pipeline-result.ts";
import type { WhatsAppGatewayAction } from "../domain/gateway-action.ts";
import { normalizeMockWhatsAppEvent } from "../application/normalize-mock-event.ts";
import { mapPipelineResultToGatewayAction } from "../application/map-pipeline-result.ts";
import { callSerenaCore } from "../application/call-serena-core.ts";
import { runDryGatewayEvent } from "../application/run-dry-gateway-event.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validEvent: MockWhatsAppEvent = {
  provider: "mock",
  instanceId: "serena-main",
  messageId: "mock-001",
  from: "5491111111111",
  text: "Hola, avisale a Carlos que llego tarde",
  timestamp: "2026-05-02T22:00:00.000Z",
};

const validConfig = {
  coreUrl: "http://localhost:3000",
  internalToken: "test-token",
};

// PipelineResult fixtures for all 8 variants
const discardResult: PipelineResult = {
  type: "discard",
  reason: "Sender not in authorized list",
};

const conversationPendingResult: PipelineResult = {
  type: "conversation_pending",
  senderId: "5491111111111",
};

const riskReviewRequiredResult: PipelineResult = {
  type: "risk_review_required",
  senderId: "5491111111111",
  matchedSignals: ["urgent", "health_emergency"],
};

const mediationNotUnderstoodResult: PipelineResult = {
  type: "mediation_not_understood",
  senderId: "5491111111111",
};

const recipientNotFoundResult: PipelineResult = {
  type: "recipient_not_found",
  senderId: "5491111111111",
  recipientName: "Unknown Person",
};

const mediationStartedResult: PipelineResult = {
  type: "mediation_started",
  sessionId: "s1",
  requesterId: "maria-id",
  requesterDisplayName: "Maria",
  recipientId: "carlos-id",
  recipientDisplayName: "Carlos",
  rewordedText: "Carlos, Maria informa que llegara tarde.",
};

const mediationReplyRecordedResult: PipelineResult = {
  type: "mediation_reply_recorded",
  sessionId: "s1",
  fromParticipantId: "carlos-id",
  fromDisplayName: "Carlos",
  toParticipantId: "maria-id",
  toDisplayName: "Maria",
  rewordedText: "Maria, Carlos dice que no hay problema.",
};

const ambiguousActiveSessionResult: PipelineResult = {
  type: "ambiguous_active_session",
  senderId: "5491111111111",
  activeSessionIds: ["s1", "s2"],
};

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

/**
 * Create a fake fetch that returns a successful JSON response with the given body.
 */
function fakeFetchWith(status: number, body: unknown): typeof globalThis.fetch {
  return ((_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }) as typeof globalThis.fetch;
}

/**
 * Create a fake fetch that rejects (simulates network error).
 */
function fakeFetchThatRejects(errorMessage: string): typeof globalThis.fetch {
  return ((_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return Promise.reject(new Error(errorMessage));
  }) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Test lifecycle — restore fetch after each test
// ---------------------------------------------------------------------------

afterEach(() => {
  // This is a placeholder since we set fetch per test.
  // We ensure beforeEach restores it cleanly.
});

// ---------------------------------------------------------------------------
// 1 — normalizeMockWhatsAppEvent (unit)
// ---------------------------------------------------------------------------

describe("normalizeMockWhatsAppEvent", () => {
  it("normalizes a valid event correctly", () => {
    const result = normalizeMockWhatsAppEvent(validEvent);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.value.senderWhatsAppId, "5491111111111");
      assert.equal(result.value.messageText, "Hola, avisale a Carlos que llego tarde");
      assert.equal(result.value.receivedAt, "2026-05-02T22:00:00.000Z");
    }
  });

  it("trims whitespace from from and text fields", () => {
    const event: MockWhatsAppEvent = {
      ...validEvent,
      from: "  5491111111111  ",
      text: "  Hola  ",
    };
    const result = normalizeMockWhatsAppEvent(event);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.value.senderWhatsAppId, "5491111111111");
      assert.equal(result.value.messageText, "Hola");
    }
  });

  it("rejects empty messageId", () => {
    const event: MockWhatsAppEvent = { ...validEvent, messageId: "" };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("messageId"));
    }
  });

  it("rejects whitespace-only messageId", () => {
    const event: MockWhatsAppEvent = { ...validEvent, messageId: "   " };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("messageId"));
    }
  });

  it("rejects empty from", () => {
    const event: MockWhatsAppEvent = { ...validEvent, from: "" };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("from"));
    }
  });

  it("rejects whitespace-only from", () => {
    const event: MockWhatsAppEvent = { ...validEvent, from: "   " };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("from"));
    }
  });

  it("rejects empty text", () => {
    const event: MockWhatsAppEvent = { ...validEvent, text: "" };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("text"));
    }
  });

  it("rejects whitespace-only text", () => {
    const event: MockWhatsAppEvent = { ...validEvent, text: "   " };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("text"));
    }
  });

  it("reports all missing fields when multiple are empty", () => {
    const event: MockWhatsAppEvent = { ...validEvent, messageId: "", from: "" };
    const result = normalizeMockWhatsAppEvent(event);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("messageId"), "Should mention messageId");
      assert.ok(result.error.includes("from"), "Should mention from");
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — mapPipelineResultToGatewayAction (unit — copied function)
// ---------------------------------------------------------------------------

describe("mapPipelineResultToGatewayAction", () => {
  it("discard → ignore", () => {
    const action = mapPipelineResultToGatewayAction(discardResult);
    assert.equal(action.action, "ignore");
    assert.equal(action.resultType, "discard");
    assert.equal(action.reason, "Sender not in authorized list");
  });

  it("conversation_pending → no_auto_send", () => {
    const action = mapPipelineResultToGatewayAction(conversationPendingResult);
    assert.equal(action.action, "no_auto_send");
    assert.equal(action.resultType, "conversation_pending");
    assert.ok(action.reason.includes("conversational"));
  });

  it("risk_review_required → manual_review_required with matchedSignals", () => {
    const action = mapPipelineResultToGatewayAction(riskReviewRequiredResult);
    assert.equal(action.action, "manual_review_required");
    assert.equal(action.resultType, "risk_review_required");
    if (action.action === "manual_review_required") {
      assert.deepEqual(action.matchedSignals, ["urgent", "health_emergency"]);
    }
  });

  it("mediation_not_understood → no_auto_send", () => {
    const action = mapPipelineResultToGatewayAction(mediationNotUnderstoodResult);
    assert.equal(action.action, "no_auto_send");
    assert.equal(action.resultType, "mediation_not_understood");
  });

  it("recipient_not_found → no_auto_send with recipient name", () => {
    const action = mapPipelineResultToGatewayAction(recipientNotFoundResult);
    assert.equal(action.action, "no_auto_send");
    assert.equal(action.resultType, "recipient_not_found");
    assert.ok(action.reason.includes("Unknown Person"));
  });

  it("mediation_started → draft_ready", () => {
    const action = mapPipelineResultToGatewayAction(mediationStartedResult);
    assert.equal(action.action, "draft_ready");
    assert.equal(action.resultType, "mediation_started");
    if (action.action === "draft_ready") {
      assert.equal(action.toWhatsAppId, "carlos-id");
      assert.equal(action.text, "Carlos, Maria informa que llegara tarde.");
      assert.equal(action.sessionId, "s1");
      assert.equal(action.fromDisplayName, "Maria");
      assert.equal(action.toDisplayName, "Carlos");
    }
  });

  it("mediation_reply_recorded → draft_ready", () => {
    const action = mapPipelineResultToGatewayAction(mediationReplyRecordedResult);
    assert.equal(action.action, "draft_ready");
    assert.equal(action.resultType, "mediation_reply_recorded");
    if (action.action === "draft_ready") {
      assert.equal(action.toWhatsAppId, "maria-id");
      assert.equal(action.text, "Maria, Carlos dice que no hay problema.");
      assert.equal(action.sessionId, "s1");
      assert.equal(action.fromDisplayName, "Carlos");
      assert.equal(action.toDisplayName, "Maria");
    }
  });

  it("ambiguous_active_session → manual_review_required with activeSessionIds", () => {
    const action = mapPipelineResultToGatewayAction(ambiguousActiveSessionResult);
    assert.equal(action.action, "manual_review_required");
    assert.equal(action.resultType, "ambiguous_active_session");
    if (action.action === "manual_review_required") {
      assert.deepEqual(action.activeSessionIds, ["s1", "s2"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — callSerenaCore (unit with fake fetch)
// ---------------------------------------------------------------------------

describe("callSerenaCore", () => {
  it("throws configuration error when SERENA_CORE_URL is missing", async () => {
    await assert.rejects(
      callSerenaCore(
        { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
        "mock-001",
        { coreUrl: "", internalToken: "token" }
      ),
      /SERENA_CORE_URL/,
    );
  });

  it("throws configuration error when SERENA_INTERNAL_TOKEN is missing", async () => {
    await assert.rejects(
      callSerenaCore(
        { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
        "mock-001",
        { coreUrl: "http://localhost:3000", internalToken: "" }
      ),
      /SERENA_INTERNAL_TOKEN/,
    );
  });

  it("sends correct POST request and returns PipelineResult", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const expectedResult: PipelineResult = { type: "discard", reason: "test" };

    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      captured.url = url as string;
      if (init !== undefined) {
        captured.init = init;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(expectedResult),
        text: () => Promise.resolve(JSON.stringify(expectedResult)),
      } as Response);
    }) as typeof globalThis.fetch;

    try {
      const result = await callSerenaCore(
        { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
        "mock-001",
        validConfig
      );
      assert.deepEqual(result, expectedResult);
      assert.equal(captured.url, "http://localhost:3000/internal/pipeline/process");
      assert.equal((captured.init!.headers as Record<string, string>)["Content-Type"], "application/json");
      assert.equal((captured.init!.headers as Record<string, string>)["X-Serena-Internal-Token"], "test-token");
      assert.equal(captured.init!.method, "POST");

      const body = JSON.parse(captured.init!.body as string);
      assert.equal(body.messageId, "mock-001");
      assert.equal(body.senderWhatsAppId, "5491111111111");
      assert.equal(body.messageText, "hola");
      assert.equal(body.receivedAt, "2026-05-02T22:00:00.000Z");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates HTTP 401 error from core", async () => {
    globalThis.fetch = fakeFetchWith(401, { error: "missing_token" });
    try {
      await assert.rejects(
        callSerenaCore(
          { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
          "mock-001",
          validConfig
        ),
        /401/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates HTTP 403 error from core", async () => {
    globalThis.fetch = fakeFetchWith(403, { error: "invalid_token" });
    try {
      await assert.rejects(
        callSerenaCore(
          { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
          "mock-001",
          validConfig
        ),
        /403/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates HTTP 500 error from core", async () => {
    globalThis.fetch = fakeFetchWith(500, "Internal Server Error");
    try {
      await assert.rejects(
        callSerenaCore(
          { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
          "mock-001",
          validConfig
        ),
        /500/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates network error", async () => {
    globalThis.fetch = fakeFetchThatRejects("Connection refused");
    try {
      await assert.rejects(
        callSerenaCore(
          { senderWhatsAppId: "5491111111111", messageText: "hola", receivedAt: "2026-05-02T22:00:00.000Z" },
          "mock-001",
          validConfig
        ),
        /Connection refused/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — runDryGatewayEvent (integration — full flow)
// ---------------------------------------------------------------------------

describe("runDryGatewayEvent", () => {
  it("returns validation error for invalid event (before HTTP call)", async () => {
    const event: MockWhatsAppEvent = { ...validEvent, messageId: "" };
    // Ensure fetch is the original so we can verify it's NOT called
    globalThis.fetch = fakeFetchThatRejects("SHOULD NOT BE CALLED");
    try {
      const result = await runDryGatewayEvent(event, validConfig);
      assert.equal(result.mode, "dry_run");
      assert.equal(result.sent, false);
      assert.ok(result.error, "Should have error field");
      assert.ok(result.error!.includes("messageId"));
      assert.equal(result.normalizedPayload, null);
      assert.equal(result.pipelineResult, null);
      assert.equal(result.gatewayAction, null);
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns config error for missing core URL", async () => {
    const result = await runDryGatewayEvent(validEvent, { coreUrl: "", internalToken: "token" });
    assert.equal(result.mode, "dry_run");
    assert.equal(result.sent, false);
    assert.ok(result.error);
    assert.ok(result.error!.includes("SERENA_CORE_URL"));
    // normalizedPayload IS preserved because normalization succeeded before config validation failed
    assert.ok(result.normalizedPayload, "normalizedPayload should be preserved for debugging");
    assert.equal(result.normalizedPayload!.messageId, "mock-001");
    assert.equal(result.pipelineResult, null);
    assert.equal(result.gatewayAction, null);
    assert.equal(result.wouldSend, null);
  });

  it("returns config error for missing internal token", async () => {
    const result = await runDryGatewayEvent(validEvent, { coreUrl: "http://localhost:3000", internalToken: "" });
    assert.equal(result.mode, "dry_run");
    assert.equal(result.sent, false);
    assert.ok(result.error);
    assert.ok(result.error!.includes("SERENA_INTERNAL_TOKEN"));
  });

  // ---- All 8 PipelineResult variants through full dry-run flow ----

  it("full dry-run: discard → ignore, wouldSend null, sent false", async () => {
    globalThis.fetch = fakeFetchWith(200, discardResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.mode, "dry_run");
      assert.equal(result.sent, false);
      assert.deepEqual(result.pipelineResult, discardResult);
      assert.ok(result.gatewayAction);
      assert.equal(result.gatewayAction!.action, "ignore");
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: conversation_pending → no_auto_send, wouldSend null", async () => {
    globalThis.fetch = fakeFetchWith(200, conversationPendingResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "no_auto_send");
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: risk_review_required → manual_review_required, wouldSend null", async () => {
    globalThis.fetch = fakeFetchWith(200, riskReviewRequiredResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "manual_review_required");
      assert.equal(result.wouldSend, null);
      if (result.gatewayAction!.action === "manual_review_required") {
        assert.deepEqual(result.gatewayAction!.matchedSignals, ["urgent", "health_emergency"]);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: mediation_not_understood → no_auto_send, wouldSend null", async () => {
    globalThis.fetch = fakeFetchWith(200, mediationNotUnderstoodResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "no_auto_send");
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: recipient_not_found → no_auto_send, wouldSend null", async () => {
    globalThis.fetch = fakeFetchWith(200, recipientNotFoundResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "no_auto_send");
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: mediation_started → draft_ready, wouldSend populated", async () => {
    globalThis.fetch = fakeFetchWith(200, mediationStartedResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.mode, "dry_run");
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "draft_ready");
      assert.ok(result.wouldSend, "wouldSend should be populated for draft_ready");
      assert.equal(result.wouldSend!.to, "carlos-id");
      assert.equal(result.wouldSend!.text, "Carlos, Maria informa que llegara tarde.");
      if (result.gatewayAction!.action === "draft_ready") {
        assert.equal(result.gatewayAction!.toWhatsAppId, "carlos-id");
        assert.equal(result.gatewayAction!.text, "Carlos, Maria informa que llegara tarde.");
        assert.equal(result.gatewayAction!.sessionId, "s1");
        assert.equal(result.gatewayAction!.fromDisplayName, "Maria");
        assert.equal(result.gatewayAction!.toDisplayName, "Carlos");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: mediation_reply_recorded → draft_ready, wouldSend populated", async () => {
    globalThis.fetch = fakeFetchWith(200, mediationReplyRecordedResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "draft_ready");
      assert.ok(result.wouldSend, "wouldSend should be populated for draft_ready");
      assert.equal(result.wouldSend!.to, "maria-id");
      assert.equal(result.wouldSend!.text, "Maria, Carlos dice que no hay problema.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("full dry-run: ambiguous_active_session → manual_review_required, wouldSend null", async () => {
    globalThis.fetch = fakeFetchWith(200, ambiguousActiveSessionResult);
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.sent, false);
      assert.equal(result.gatewayAction!.action, "manual_review_required");
      assert.equal(result.wouldSend, null);
      if (result.gatewayAction!.action === "manual_review_required") {
        assert.deepEqual(result.gatewayAction!.activeSessionIds, ["s1", "s2"]);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sent is ALWAYS false for every PipelineResult variant", async () => {
    const allResults: PipelineResult[] = [
      discardResult,
      conversationPendingResult,
      riskReviewRequiredResult,
      mediationNotUnderstoodResult,
      recipientNotFoundResult,
      mediationStartedResult,
      mediationReplyRecordedResult,
      ambiguousActiveSessionResult,
    ];

    for (const pr of allResults) {
      globalThis.fetch = fakeFetchWith(200, pr);
      try {
        const result = await runDryGatewayEvent(validEvent, validConfig);
        assert.equal(result.sent, false, `sent should be false for ${pr.type}`);
        assert.equal(result.mode, "dry_run", `mode should be dry_run for ${pr.type}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  it("propagates HTTP error from core into DryRunResult.error", async () => {
    globalThis.fetch = fakeFetchWith(500, "Database connection lost");
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.mode, "dry_run");
      assert.equal(result.sent, false);
      assert.ok(result.error);
      assert.ok(result.error!.includes("500") || result.error!.includes("Database"));
      assert.ok(result.normalizedPayload, "Should preserve normalizedPayload on error");
      assert.equal(result.pipelineResult, null);
      assert.equal(result.gatewayAction, null);
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates network error into DryRunResult.error", async () => {
    globalThis.fetch = fakeFetchThatRejects("Connection refused");
    try {
      const result = await runDryGatewayEvent(validEvent, validConfig);
      assert.equal(result.mode, "dry_run");
      assert.equal(result.sent, false);
      assert.ok(result.error);
      assert.ok(result.error!.includes("Connection refused"));
      assert.ok(result.normalizedPayload);
      assert.equal(result.pipelineResult, null);
      assert.equal(result.gatewayAction, null);
      assert.equal(result.wouldSend, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
