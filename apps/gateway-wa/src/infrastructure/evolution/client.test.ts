/**
 * T4 — Evolution API client tests.
 *
 * Tests for the Evolution API fetch wrapper using fake globalThis.fetch.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createEvolutionClient, type EvolutionClient } from "./client.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validBaseUrl = "http://evo:8080";
const validApiKey = "evo-api-key";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
};

function fakeFetchWith(status: number, body: unknown, capture?: CapturedRequest): typeof globalThis.fetch {
  return ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (capture) {
      capture.url = url as string;
      capture.method = init?.method ?? "GET";
      capture.headers = (init?.headers as Record<string, string>) ?? {};
      capture.body = init?.body as string | null ?? null;
    }
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

function fakeFetchThatRejects(errorMessage: string): typeof globalThis.fetch {
  return ((_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return Promise.reject(new Error(errorMessage));
  }) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEvolutionClient — configuration", () => {
  it("fails fast when EVOLUTION_API_URL is missing", () => {
    assert.throws(
      () => createEvolutionClient({ baseUrl: "", apiKey: "key" }),
      (err: Error) => err.message.includes("EVOLUTION_API_URL"),
    );
  });

  it("fails fast when EVOLUTION_API_KEY is missing", () => {
    assert.throws(
      () => createEvolutionClient({ baseUrl: "http://evo:8080", apiKey: "" }),
      (err: Error) => err.message.includes("EVOLUTION_API_KEY"),
    );
  });

  it("creates client with valid config", () => {
    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    assert.ok(client);
    assert.equal(typeof client.createInstance, "function");
    assert.equal(typeof client.getConnectionState, "function");
    assert.equal(typeof client.connectInstance, "function");
    assert.equal(typeof client.sendText, "function");
    assert.equal(typeof client.deleteInstance, "function");
  });
});

describe("EvolutionClient — createInstance", () => {
  it("calls correct endpoint with apikey header", async () => {
    const captured: CapturedRequest = { url: "", method: "", headers: {} };
    globalThis.fetch = fakeFetchWith(201, {
      instance: { instanceName: "test", instanceId: "id1", status: "created" },
    }, captured);

    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    await client.createInstance("test-instance");

    assert.equal(captured.url, "http://evo:8080/instance/create");
    assert.equal(captured.method, "POST");
    assert.equal(captured.headers["apikey"], validApiKey);
    assert.equal(captured.headers["Content-Type"], "application/json");

    const body = JSON.parse(captured.body!);
    assert.deepEqual(body, { instanceName: "test-instance" });
  });

  it("throws on connection refused", async () => {
    globalThis.fetch = fakeFetchThatRejects("Connection refused");
    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });

    await assert.rejects(
      client.createInstance("test"),
      (err: Error) => err.message.includes("Evolution API is not reachable"),
    );
  });
});

describe("EvolutionClient — getConnectionState", () => {
  it("calls correct endpoint", async () => {
    const captured: CapturedRequest = { url: "", method: "", headers: {} };
    globalThis.fetch = fakeFetchWith(200, {
      instance: { state: "open" },
    }, captured);

    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    const result = await client.getConnectionState("test");
    assert.deepEqual(result, { state: "open" });
    assert.equal(captured.url, "http://evo:8080/instance/connectionState/test");
    assert.equal(captured.method, "GET");
    assert.equal(captured.headers["apikey"], validApiKey);
  });
});

describe("EvolutionClient — connectInstance", () => {
  it("calls correct endpoint", async () => {
    const captured: CapturedRequest = { url: "", method: "", headers: {} };
    globalThis.fetch = fakeFetchWith(200, {
      pairingCode: "ABCD1234",
    }, captured);

    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    const result = await client.connectInstance("test");
    assert.equal(captured.url, "http://evo:8080/instance/connect/test");
    assert.equal(captured.method, "GET");
    assert.ok(result.pairingCode || result.base64);
  });
});

describe("EvolutionClient — sendText", () => {
  it("calls correct endpoint with body", async () => {
    const captured: CapturedRequest = { url: "", method: "", headers: {} };
    globalThis.fetch = fakeFetchWith(200, {
      key: { id: "wamid-001", remoteJid: "5491111111111@s.whatsapp.net", fromMe: true },
      message: { conversation: "Hello" },
      messageTimestamp: "1715000000",
      status: "sent",
    }, captured);

    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    const result = await client.sendText("test", "5491111111111", "Hello");

    assert.equal(captured.url, "http://evo:8080/message/sendText/test");
    assert.equal(captured.method, "POST");
    assert.equal(captured.headers["apikey"], validApiKey);

    const body = JSON.parse(captured.body!);
    assert.deepEqual(body, { number: "5491111111111", text: "Hello" });
  });

  it("propagates 500 errors", async () => {
    globalThis.fetch = fakeFetchWith(500, { error: "Internal Error" });
    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });

    await assert.rejects(
      client.sendText("test", "123", "hi"),
      (err: Error) => err.message.includes("500"),
    );
  });
});

describe("EvolutionClient — deleteInstance", () => {
  it("calls correct endpoint", async () => {
    const captured: CapturedRequest = { url: "", method: "", headers: {} };
    globalThis.fetch = fakeFetchWith(200, {
      status: "deleted",
      message: "Instance deleted",
    }, captured);

    const client = createEvolutionClient({ baseUrl: validBaseUrl, apiKey: validApiKey });
    await client.deleteInstance("test");

    assert.equal(captured.url, "http://evo:8080/instance/delete/test");
    assert.equal(captured.method, "DELETE");
    assert.equal(captured.headers["apikey"], validApiKey);
  });
});
