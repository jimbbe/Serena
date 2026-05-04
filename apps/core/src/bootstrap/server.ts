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
  internalToken?: string,
  simulationHandler?: PipelineRequestHandler,
  scenarioHandler?: PipelineRequestHandler,
) {
  return createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    // GET /health — liveness probe (public, no token required)
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

      // Token check BEFORE body parsing (fail fast)
      if (internalToken === undefined || internalToken === "") {
        sendJson(res, 500, {
          error: "internal_token_not_configured",
          detail: "SERENA_INTERNAL_TOKEN is not set on the server",
        });
        return;
      }

      const providedToken = req.headers["x-serena-internal-token"] as string | undefined;

      if (!providedToken) {
        sendJson(res, 401, {
          error: "missing_token",
          detail: "X-Serena-Internal-Token header is required",
        });
        return;
      }

      if (providedToken !== internalToken) {
        sendJson(res, 403, {
          error: "invalid_token",
          detail: "X-Serena-Internal-Token header does not match",
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

    // POST /dev/simulate/inbound-message — dev-only simulation endpoint
    if (url.pathname === "/dev/simulate/inbound-message") {
      if (simulationHandler) {
        try {
          await simulationHandler(req, res);
        } catch {
          if (!res.writableEnded) {
            sendJson(res, 500, { error: "internal_server_error" });
          }
        }
        return;
      }

      sendJson(res, 404, {
        error: "simulation_not_enabled",
        detail: "Set ENABLE_SIMULATION_ENDPOINTS=true to enable dev simulation endpoints",
      });
      return;
    }

    // POST /dev/simulate/scenario — dev-only multi-step scenario endpoint
    if (url.pathname === "/dev/simulate/scenario") {
      if (scenarioHandler) {
        try {
          await scenarioHandler(req, res);
        } catch {
          if (!res.writableEnded) {
            sendJson(res, 500, { error: "internal_server_error" });
          }
        }
        return;
      }

      sendJson(res, 404, {
        error: "simulation_not_enabled",
        detail: "Set ENABLE_SIMULATION_ENDPOINTS=true to enable dev simulation endpoints",
      });
      return;
    }

    // Unknown route — no token check
    sendJson(res, 404, {
      error: "not_found",
      detail: `No route matches ${req.method} ${url.pathname}`,
    });
  });
}
