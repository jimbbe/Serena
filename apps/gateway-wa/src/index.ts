/**
 * T15 — Entry point and bootstrap: WhatsApp Gateway server.
 *
 * Reads GATEWAY_MODE from env. In production mode (or unset), starts the
 * HTTP server with all routes registered. In dry_run mode, only the
 * dry-run CLI path is available — no HTTP server starts.
 */

import { loadConfig } from "./infrastructure/config.ts";
import { createServer, startServer, type RequestContext } from "./infrastructure/server.ts";
import { Router } from "./infrastructure/router.ts";
import { handleHealth, type HandlerResult } from "./infrastructure/health.ts";
import { createEvolutionClient } from "./infrastructure/evolution/client.ts";
import { InstanceManager } from "./infrastructure/instances/manager.ts";
import { MessageSender } from "./infrastructure/messages/sender.ts";
import {
  createInstanceHandler,
  listInstancesHandler,
  getQrCodeHandler,
  deleteInstanceHandler,
} from "./infrastructure/instances/handlers.ts";
import { sendMessageHandler } from "./infrastructure/messages/handler.ts";
import { handleWebhook } from "./infrastructure/webhook/receiver.ts";
import type { IncomingMessage } from "node:http";
import { loadRoutingTable } from "./infrastructure/routing/table.ts";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();

  // Dry-run mode — no HTTP server
  if (config.mode === "dry_run") {
    console.log("[gateway-wa] Running in dry_run mode — HTTP server disabled.");
    console.log("[gateway-wa] Use the dry-run CLI or import modules for testing.");
    return;
  }

  // Production mode — create services
  console.log(`[gateway-wa] Starting in production mode...`);

  const evoClient = createEvolutionClient({
    baseUrl: config.evolutionApiUrl,
    apiKey: config.evolutionApiKey,
  });

  const instanceManager = new InstanceManager(evoClient);
  const messageSender = new MessageSender(evoClient, instanceManager);
  const routingTable = loadRoutingTable({
    routingTablePath: config.routingTablePath,
    routingTableJson: config.routingTableJson,
  });

  // Build router
  const router = new Router<
    (ctx: RequestContext, req: IncomingMessage) => Promise<HandlerResult>
  >();

  // GET /health
  router.register("GET", "/health", async () => {
    return handleHealth(config.mode);
  });

  // POST /instances
  router.register("POST", "/instances", async (ctx: RequestContext) => {
    return createInstanceHandler(ctx, instanceManager, config.appKey);
  });

  // GET /instances
  router.register("GET", "/instances", async (ctx: RequestContext) => {
    return listInstancesHandler(ctx, instanceManager);
  });

  // GET /instances/:name/qr
  router.register("GET", "/instances/:name/qr", async (ctx: RequestContext) => {
    return getQrCodeHandler(ctx, instanceManager, ctx.params.name ?? "");
  });

  // DELETE /instances/:name
  router.register("DELETE", "/instances/:name", async (ctx: RequestContext) => {
    return deleteInstanceHandler(ctx, instanceManager, ctx.params.name ?? "");
  });

  // POST /send
  router.register("POST", "/send", async (ctx: RequestContext) => {
    return sendMessageHandler(ctx, messageSender);
  });

  // POST /webhook/evolution
  router.register("POST", "/webhook/evolution", async (ctx: RequestContext) => {
    return handleWebhook(ctx, config, instanceManager, routingTable);
  });

  // Create and start server
  const server = createServer(config, router);

  const port = await startServer(server, config.port);
  console.log(`[gateway-wa] HTTP server listening on port ${port}`);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[gateway-wa] Received ${signal} — shutting down...`);
    server.close(() => {
      console.log("[gateway-wa] Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function getPath(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  const idx = raw.indexOf("?");
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("[gateway-wa] Fatal startup error:", err.message);
  process.exit(1);
});
