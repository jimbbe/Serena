import assert from "node:assert/strict";
import test from "node:test";

import { GatewayWaDeliveryPort } from "./gateway-wa-delivery-port.ts";
import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";

function makeRequest(): PreparedDeliveryRequest {
  return {
    outboundDraftId: "od-1",
    tenantId: "demo",
    conversationId: "conv-1",
    requesterPersonId: "marta",
    recipientPersonId: "carlos",
    recipientDisplayName: "Carlos",
    recipientChannel: "whatsapp",
    recipientExternalId: "5491111111111",
    messageText: "hola carlos",
    requestedAt: new Date("2026-05-15T10:00:00.000Z"),
  };
}

test("posts /send with expected body and app key header", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ messageId: "msg-1", status: "sent", timestamp: "2026-05-15T10:01:00.000Z" }), { status: 200 });
  };

  const port = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local/",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn,
  });

  const result = await port.sendPreparedMessage(makeRequest());
  assert.equal(capturedUrl, "https://gateway.local/send");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>)["x-gateway-app-key"], "app-key");
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, string>;
  assert.equal(body.instanceId, "serena-main");
  assert.equal(body.to, "5491111111111");
  assert.equal(body.text, "hola carlos");
  assert.equal(result.status, "delivered");
  assert.equal(result.providerMessageId, "msg-1");
});

test("maps 400/404/502 to failed reasons", async () => {
  const req = makeRequest();

  const p400 = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn: async () => new Response(JSON.stringify({ error: "validation_error" }), { status: 400 }),
  });
  assert.equal((await p400.sendPreparedMessage(req)).failureReason, "gateway_validation_error");

  const p404 = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn: async () => new Response(JSON.stringify({ error: "instance_not_found" }), { status: 404 }),
  });
  assert.equal((await p404.sendPreparedMessage(req)).failureReason, "gateway_instance_not_found");

  const p502 = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn: async () => new Response(JSON.stringify({ error: "evolution_unreachable" }), { status: 502 }),
  });
  assert.equal((await p502.sendPreparedMessage(req)).failureReason, "gateway_unreachable");
});

test("maps timeout, invalid JSON and network errors", async () => {
  const req = makeRequest();

  const timeoutPort = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    timeoutMs: 1,
    fetchFn: async (_i, init) => {
      await new Promise((resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
      return new Response("", { status: 200 });
    },
  });
  assert.equal((await timeoutPort.sendPreparedMessage(req)).failureReason, "gateway_timeout");

  const invalidJsonPort = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn: async () => new Response("not-json", { status: 200 }),
  });
  assert.equal((await invalidJsonPort.sendPreparedMessage(req)).failureReason, "gateway_invalid_response");

  const networkPort = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn: async () => {
      throw new Error("network down");
    },
  });
  assert.equal((await networkPort.sendPreparedMessage(req)).failureReason, "gateway_network_error");
});

test("uses only gateway /send contract and never direct Evolution API paths", async () => {
  const calledUrls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    calledUrls.push(String(input));
    return new Response(JSON.stringify({ messageId: "msg-2", status: "sent", timestamp: "2026-05-15T10:02:00.000Z" }), { status: 200 });
  };

  const port = new GatewayWaDeliveryPort({
    baseUrl: "https://gateway.local/internal",
    appKey: "app-key",
    instanceId: "serena-main",
    fetchFn,
  });

  const result = await port.sendPreparedMessage(makeRequest());
  assert.equal(result.status, "delivered");
  assert.equal(calledUrls.length, 1);
  assert.equal(calledUrls[0], "https://gateway.local/internal/send");
  assert.equal(calledUrls[0].includes("/message/sendText"), false);
  assert.equal(calledUrls[0].includes("/instance/"), false);
});
