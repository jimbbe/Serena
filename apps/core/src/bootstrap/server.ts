import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthResponse = {
  status: "ok";
  service: "serena-core";
  environment: string;
};

export type PipelineRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  response.end(payload);
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createHttpServer(
  environment: string,
  pipelineHandler?: PipelineRequestHandler,
) {
  return createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    // GET /health — liveness probe
    if (req.method === "GET" && url.pathname === "/health") {
      const body: HealthResponse = {
        status: "ok",
        service: "serena-core",
        environment,
      };
      sendJson(res, 200, body);
      return;
    }

    // POST /internal/pipeline/process — execute orchestrator pipeline
    if (url.pathname === "/internal/pipeline/process") {
      if (req.method !== "POST") {
        sendJson(res, 405, {
          error: "method_not_allowed",
          detail: `Method ${req.method} not allowed. Use POST.`,
        });
        return;
      }

      if (pipelineHandler) {
        try {
          await pipelineHandler(req, res);
        } catch {
          // If handler throws unexpectedly, ensure we respond with 500
          if (!res.writableEnded) {
            sendJson(res, 500, { error: "internal_server_error" });
          }
        }
        return;
      }

      sendJson(res, 500, { error: "pipeline_not_configured" });
      return;
    }

    // Unknown route
    sendJson(res, 404, {
      error: "not_found",
      detail: `No route matches ${req.method} ${url.pathname}`,
    });
  });
}
