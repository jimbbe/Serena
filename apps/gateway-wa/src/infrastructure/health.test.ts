/**
 * T9 — Health endpoint handler tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHealth } from "./health.ts";

describe("handleHealth", () => {
  it("returns 200 with correct shape in production mode", async () => {
    const result = await handleHealth("production");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      status: "ok",
      service: "whatsapp-gateway",
      mode: "production",
    });
  });

  it("returns mode from parameter", async () => {
    const result = await handleHealth("dry_run");
    assert.equal(result.status, 200);
    assert.equal((result.body as Record<string, unknown>).mode, "dry_run");
  });
});
