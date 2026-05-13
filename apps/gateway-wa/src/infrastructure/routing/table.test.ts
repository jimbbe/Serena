import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoutingTable } from "./table.ts";

describe("loadRoutingTable", () => {
  it("loads a route and resolves auth env", () => {
    process.env["SERENA_INTERNAL_TOKEN"] = "token-123";
    const table = loadRoutingTable({
      routingTablePath: undefined,
      routingTableJson: JSON.stringify({
        routes: [
          {
            instanceId: "serena-main",
            consumerId: "serena-core",
            internalWebhookUrl: "http://serena-core:3000/internal/webhook/whatsapp",
            auth: { header: "X-Serena-Internal-Token", env: "SERENA_INTERNAL_TOKEN" },
          },
        ],
      }),
    });

    const route = table.findRoute("serena-main");
    assert.ok(route);
    assert.equal(route.consumerId, "serena-core");
    assert.equal(route.authHeader, "X-Serena-Internal-Token");
    assert.equal(route.authValue, "token-123");
  });

  it("returns null for unknown instance", () => {
    process.env["SERENA_INTERNAL_TOKEN"] = "token-123";
    const table = loadRoutingTable({
      routingTablePath: undefined,
      routingTableJson: JSON.stringify({
        routes: [
          {
            instanceId: "serena-main",
            consumerId: "serena-core",
            internalWebhookUrl: "http://serena-core:3000/internal/webhook/whatsapp",
            auth: { header: "X-Serena-Internal-Token", env: "SERENA_INTERNAL_TOKEN" },
          },
        ],
      }),
    });

    assert.equal(table.findRoute("unknown"), null);
  });

  it("loads routes from file path", () => {
    process.env["SERENA_INTERNAL_TOKEN"] = "abc";
    const dir = mkdtempSync(join(tmpdir(), "serena-routing-"));
    const file = join(dir, "routing.json");
    writeFileSync(
      file,
      JSON.stringify({
        routes: [
          {
            instanceId: "serena-main",
            consumerId: "serena-core",
            internalWebhookUrl: "http://serena-core:3000/internal/webhook/whatsapp",
            auth: { header: "X-Serena-Internal-Token", env: "SERENA_INTERNAL_TOKEN" },
          },
        ],
      }),
      "utf-8",
    );

    const table = loadRoutingTable({ routingTablePath: file, routingTableJson: undefined });
    assert.ok(table.findRoute("serena-main"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when auth env is missing", () => {
    delete process.env["MISSING_TOKEN"];
    assert.throws(() =>
      loadRoutingTable({
        routingTablePath: undefined,
        routingTableJson: JSON.stringify({
          routes: [
            {
              instanceId: "serena-main",
              consumerId: "serena-core",
              internalWebhookUrl: "http://serena-core:3000/internal/webhook/whatsapp",
              auth: { header: "X-Serena-Internal-Token", env: "MISSING_TOKEN" },
            },
          ],
        }),
      }),
    );
  });
});
