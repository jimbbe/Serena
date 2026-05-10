import assert from "node:assert/strict";
import test from "node:test";

import { FakeDeliveryPort } from "../adapter/fake-delivery-port.ts";
import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";

function makeRequest(overrides?: Partial<PreparedDeliveryRequest>): PreparedDeliveryRequest {
  return {
    outboundDraftId: "od-1",
    tenantId: "demo",
    conversationId: "conv-1",
    requesterPersonId: "marta",
    recipientPersonId: "carlos",
    recipientDisplayName: "Carlos",
    recipientChannel: "whatsapp",
    recipientExternalId: "5491111111111",
    messageText: "que llego tarde",
    requestedAt: new Date("2026-05-10T10:00:00.000Z"),
    ...overrides,
  };
}

// --- Success mode ---

test("FakeDeliveryPort success mode returns delivered with providerMessageId", async () => {
  const port = new FakeDeliveryPort();
  const request = makeRequest();

  const result = await port.sendPreparedMessage(request);

  assert.equal(result.status, "delivered");
  assert.ok(result.providerMessageId?.startsWith("fake_msg_"));
  assert.ok(result.deliveredAt instanceof Date);
});

// --- Failure mode ---

test("FakeDeliveryPort failure mode returns failed with configured reason", async () => {
  const port = new FakeDeliveryPort({ mode: "failure", failureReason: "test_failure" });
  const request = makeRequest();

  const result = await port.sendPreparedMessage(request);

  assert.equal(result.status, "failed");
  assert.equal(result.failureReason, "test_failure");
});

test("FakeDeliveryPort default failure reason is simulated_failure", async () => {
  const port = new FakeDeliveryPort({ mode: "failure" });
  const request = makeRequest();

  const result = await port.sendPreparedMessage(request);

  assert.equal(result.status, "failed");
  assert.equal(result.failureReason, "simulated_failure");
});

// --- Stores requests ---

test("FakeDeliveryPort stores all requests in memory", async () => {
  const port = new FakeDeliveryPort();
  const req1 = makeRequest({ outboundDraftId: "od-1", messageText: "hello" });
  const req2 = makeRequest({ outboundDraftId: "od-2", messageText: "world" });

  await port.sendPreparedMessage(req1);
  await port.sendPreparedMessage(req2);

  const stored = port.getSentRequests();
  assert.equal(stored.length, 2);
  assert.equal(stored[0]?.messageText, "hello");
  assert.equal(stored[1]?.messageText, "world");
});

test("FakeDeliveryPort stores correct recipientExternalId", async () => {
  const port = new FakeDeliveryPort();
  const request = makeRequest({ recipientExternalId: "5499999999999" });

  await port.sendPreparedMessage(request);

  const stored = port.getSentRequests();
  assert.equal(stored[0]?.recipientExternalId, "5499999999999");
});

test("FakeDeliveryPort clearSentRequests empties the store", async () => {
  const port = new FakeDeliveryPort();
  await port.sendPreparedMessage(makeRequest());
  assert.equal(port.getSentRequests().length, 1);

  port.clearSentRequests();
  assert.equal(port.getSentRequests().length, 0);
});
