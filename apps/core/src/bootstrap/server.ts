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

type InternalAuthResult =
  | { ok: true }
  | { ok: false; statusCode: number; body: { error: string; detail: string } };

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

function validateInternalToken(
  req: IncomingMessage,
  internalToken: string | undefined,
): InternalAuthResult {
  if (internalToken === undefined || internalToken === "") {
    return {
      ok: false,
      statusCode: 500,
      body: {
        error: "internal_token_not_configured",
        detail: "SERENA_INTERNAL_TOKEN is not set on the server",
      },
    };
  }

  const providedToken = req.headers["x-serena-internal-token"] as string | undefined;
  if (!providedToken) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        error: "missing_token",
        detail: "X-Serena-Internal-Token header is required",
      },
    };
  }

  if (providedToken !== internalToken) {
    return {
      ok: false,
      statusCode: 403,
      body: {
        error: "invalid_token",
        detail: "X-Serena-Internal-Token header does not match",
      },
    };
  }

  return { ok: true };
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
  outboundDeliveryHandler?: PipelineRequestHandler,
  whatsappWebhookHandler?: PipelineRequestHandler,
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

    if (url.pathname.startsWith("/internal/")) {
      const auth = validateInternalToken(req, internalToken);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.body);
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

      if (url.pathname === "/internal/webhook/whatsapp") {
        if (req.method !== "POST") {
          sendJson(res, 405, {
            error: "method_not_allowed",
            detail: `Method ${req.method} not allowed. Use POST.`,
          });
          return;
        }

        if (whatsappWebhookHandler) {
          try {
            await whatsappWebhookHandler(req, res);
          } catch {
            if (!res.writableEnded) {
              sendJson(res, 500, { error: "internal_server_error" });
            }
          }
          return;
        }

        sendJson(res, 500, { error: "webhook_not_configured" });
        return;
      }

      sendJson(res, 404, {
        error: "not_found",
        detail: `No route matches ${req.method} ${url.pathname}`,
      });
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

    // POST /dev/simulate/outbound-delivery — dev-only delivery simulation endpoint
    if (url.pathname === "/dev/simulate/outbound-delivery") {
      if (outboundDeliveryHandler) {
        try {
          await outboundDeliveryHandler(req, res);
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
