/**
 * T7 — HTTP Server with middleware chain.
 *
 * Creates a node:http server with: auth → route match → body buffer →
 * JSON parse → handler → error handler.
 *
 * Zero npm dependencies — uses node:http built-in.
 */

import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { GatewayRuntimeConfig } from "./config.ts";
import type { Router } from "./router.ts";
import { validateAuth } from "./auth/middleware.ts";
import type { HandlerResult } from "./health.ts";

export type { HandlerResult };

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Request context built by middleware chain
// ---------------------------------------------------------------------------

export type RequestContext = {
  body: unknown;
  params: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  res.writeHead(status, headers);
  res.end(payload);
}

function getPath(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  const idx = raw.indexOf("?");
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

// ---------------------------------------------------------------------------
// Body buffering with size limit
// ---------------------------------------------------------------------------

function bufferBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "DELETE") {
      resolve(null);
      return;
    }

    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      reject({ status: 415, body: { error: "unsupported_media_type" } });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let exceeded = false;

    req.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        exceeded = true;
        // Don't reject here — wait for 'end' so the request is fully consumed
        // before we send the response (prevents ECONNRESET on client)
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (exceeded) {
        reject({ status: 413, body: { error: "payload_too_large" } });
        return;
      }
      if (chunks.length === 0) {
        resolve("");
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", (err) => {
      if (!exceeded) {
        reject({ status: 500, body: { error: "internal_error", message: err.message } });
      }
    });
  });
}

function parseBody(raw: string | null): unknown {
  if (raw === null || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw { status: 400, body: { error: "invalid_json" } };
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Create an HTTP server with full middleware chain.
 *
 * Middleware chain:
 * 1. Auth — validate API key for the requested path
 * 2. Route match — match method+path, return 404/405 if no match
 * 3. Body buffer — collect request chunks, enforce size limit and content-type
 * 4. JSON parse — parse body for POST/PUT requests
 * 5. Handler — call the matched handler
 * 6. Error handler — catch errors from any step
 */
export function createServer(
  config: GatewayRuntimeConfig,
  router: Router<(ctx: RequestContext, req: IncomingMessage) => Promise<HandlerResult>>,
): Server {
  const server = httpCreateServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = getPath(req);
    const method = (req.method ?? "GET").toUpperCase();

    try {
      // Step 1: Auth middleware
      const authResult = validateAuth(req, path, config);
      if (!authResult.ok) {
        sendJson(res, authResult.status, authResult.body);
        return;
      }

      // Step 2: Route match (before body parsing)
      const match = router.match(method, path);

      if (match === null) {
        sendJson(res, 404, { error: "not_found", path });
        return;
      }

      if (match.handler === null) {
        sendJson(res, 405, {
          error: "method_not_allowed",
          allowedMethods: match.allowedMethods,
        });
        return;
      }

      // Step 3: Buffer body (content-type check + size limit here)
      let rawBody: string | null;
      try {
        rawBody = await bufferBody(req);
      } catch (err: unknown) {
        const e = err as { status: number; body: unknown };
        sendJson(res, e.status, e.body);
        return;
      }

      // Step 4: Parse JSON body
      let body: unknown;
      try {
        body = parseBody(rawBody);
      } catch (err: unknown) {
        const e = err as { status: number; body: unknown };
        sendJson(res, e.status, e.body);
        return;
      }

      const ctx: RequestContext = { body, params: match.params };

      // Step 5: Call handler
      const result = await match.handler(ctx, req);
      sendJson(res, result.status, result.body, result.headers);

    } catch (err: unknown) {
      // Step 6: Error handler (catch-all)
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, { error: "internal_error", message });
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

export function startServer(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr !== null ? addr.port : port;
      resolve(actualPort);
    });
  });
}

export function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
