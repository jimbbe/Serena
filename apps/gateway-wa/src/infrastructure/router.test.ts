/**
 * T8 — Router tests.
 *
 * Tests for URL-based route matching with path params.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Router } from "./router.ts";

describe("Router", () => {
  it("matches exact path and method", () => {
    const router = new Router<string>();
    router.register("GET", "/health", "health-handler");

    const match = router.match("GET", "/health");
    assert.ok(match);
    assert.equal(match.handler, "health-handler");
    assert.deepEqual(match.params, {});
  });

  it("returns null for unknown path", () => {
    const router = new Router<string>();
    router.register("GET", "/health", "health-handler");

    const match = router.match("GET", "/unknown");
    assert.equal(match, null);
  });

  it("returns allowedMethods when path matches but method does not", () => {
    const router = new Router<string>();
    router.register("GET", "/health", "health-handler");

    const match = router.match("POST", "/health");
    assert.ok(match);
    assert.equal(match.handler, null);
    assert.ok(match.allowedMethods);
    assert.ok(match.allowedMethods.includes("GET"));
  });

  it("extracts single path param", () => {
    const router = new Router<string>();
    router.register("GET", "/instances/:name", "get-instance");

    const match = router.match("GET", "/instances/serena-main");
    assert.ok(match);
    assert.equal(match.handler, "get-instance");
    assert.deepEqual(match.params, { name: "serena-main" });
  });

  it("extracts multiple params from complex path", () => {
    const router = new Router<string>();
    router.register("GET", "/instances/:name/qr", "get-qr");

    const match = router.match("GET", "/instances/test-instance/qr");
    assert.ok(match);
    assert.equal(match.handler, "get-qr");
    assert.deepEqual(match.params, { name: "test-instance" });
  });

  it("handles hyphens and numbers in param", () => {
    const router = new Router<string>();
    router.register("GET", "/instances/:name", "get-instance");

    const match = router.match("GET", "/instances/serena-123-main");
    assert.ok(match);
    assert.equal(match.params.name, "serena-123-main");
  });

  it("matches static path exactly, not as prefix", () => {
    const router = new Router<string>();
    router.register("GET", "/health", "health-handler");

    // /healthcheck should NOT match /health
    const match = router.match("GET", "/healthcheck");
    assert.equal(match, null);
  });

  it("distinguishes methods for same path", () => {
    const router = new Router<string>();
    router.register("GET", "/instances", "list-instances");
    router.register("POST", "/instances", "create-instance");

    const getMatch = router.match("GET", "/instances");
    assert.ok(getMatch);
    assert.equal(getMatch.handler, "list-instances");

    const postMatch = router.match("POST", "/instances");
    assert.ok(postMatch);
    assert.equal(postMatch.handler, "create-instance");
  });

  it("collects multiple allowed methods", () => {
    const router = new Router<string>();
    router.register("GET", "/instances", "get-handler");
    router.register("POST", "/instances", "post-handler");

    // PUT is not registered for /instances
    const match = router.match("PUT", "/instances");
    assert.ok(match);
    assert.equal(match.handler, null);
    assert.ok(match.allowedMethods.includes("GET"));
    assert.ok(match.allowedMethods.includes("POST"));
  });

  it("param routes are registered before their static variants", () => {
    const router = new Router<string>();
    // /instances/:name/qr before /instances
    router.register("GET", "/instances/:name/qr", "get-qr");
    router.register("GET", "/instances", "list-instances");

    const staticMatch = router.match("GET", "/instances");
    assert.ok(staticMatch);
    assert.equal(staticMatch.handler, "list-instances");
    assert.deepEqual(staticMatch.params, {});
  });
});
