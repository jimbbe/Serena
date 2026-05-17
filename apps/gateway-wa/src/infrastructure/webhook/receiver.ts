/**
 * T14 — Webhook receiver: full handler (dedup + filter + normalize + route).
 *
 * Chains dedup → filter → normalize → route to configured consumer for incoming
 * Evolution API webhook payloads.
 *
 * Also handles connection.update events to keep InstanceManager state in sync.
 */

import type { IncomingMessage } from "node:http";
import type { RequestContext, HandlerResult } from "../server.ts";
import type { GatewayRuntimeConfig } from "../config.ts";
import type { InstanceManager } from "../instances/manager.ts";
import type {
  EvolutionWebhookPayload,
  EvolutionConnectionUpdatePayload,
} from "../evolution/types.ts";
import { shouldDiscard } from "./filter.ts";
import { normalizeEvolutionPayload } from "./normalizer.ts";
import { dedupTracker } from "./dedup.ts";
import { mapEvolutionStateToGatewayStatus } from "../evolution/types.ts";
import type { RoutingTable } from "../routing/table.ts";

/**
 * Handle POST /webhook/evolution.
 *
 * Flow for MESSAGES_UPSERT:
 * 1. Parse body as Evolution webhook payload
 * 2. Dedup: silently accept duplicate messageIds (200 OK)
 * 3. Filter: discard self-messages and non-text
 * 4. Normalize: Evolution payload → NormalizedWhatsAppInboundMessage
 * 5. Route: POST to configured consumer webhook
 *
 * Flow for connection.update:
 * 1. Parse body as connection update payload
 * 2. Map Evolution state to gateway status
 * 3. Update InstanceManager (no-op if instance not tracked)
 * 4. Return 200 OK
 */
export async function handleWebhook(
  ctx: RequestContext,
  config: GatewayRuntimeConfig,
  manager: InstanceManager,
  routingTable?: RoutingTable,
): Promise<HandlerResult> {
  const body = ctx.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== "object") {
    return {
      status: 400,
      body: { error: "invalid_webhook_payload" },
    };
  }

  const event = body.event as string | undefined;

  // --- connection.update: update instance status ---
  if (event === "connection.update") {
    return handleConnectionUpdate(
      body as EvolutionConnectionUpdatePayload,
      manager,
    );
  }

  // --- MESSAGES_UPSERT and other message events ---
  const payload = body as EvolutionWebhookPayload;

  let route: ReturnType<RoutingTable["findRoute"]> | null = null;
  let instanceId = payload.instance ?? "unknown";

  if (routingTable) {
    if (typeof payload.instance !== "string" || payload.instance.trim().length === 0) {
      return {
        status: 400,
        body: { error: "invalid_webhook_payload" },
      };
    }

    instanceId = payload.instance.trim();
    route = routingTable.findRoute(instanceId) ?? null;
    if (!route) {
      return {
        status: 200,
        body: {
          ignored: true,
          reason: "routing_not_configured",
          instanceId,
        },
      };
    }
  }

  if (!payload.data || typeof payload.data !== "object") {
    return {
      status: 400,
      body: { error: "invalid_webhook_payload" },
    };
  }

  // Step 2: Deduplication — silently accept duplicates within 5 min window
  const data = payload.data as Record<string, unknown>;
  const key = data.key as Record<string, unknown> | undefined;
  const messageId = key?.id as string | undefined;
  if (messageId && dedupTracker.isDuplicate(messageId)) {
    return {
      status: 200,
      body: {
        received: true,
        duplicate: true,
      },
    };
  }

  // Step 3: Filter
  const discard = shouldDiscard(payload);
  if (discard.discard) {
    return {
      status: 200,
      body: {
        ignored: true,
        reason: discard.reason,
      },
    };
  }

  // Step 4: Normalize
  const normalized = normalizeEvolutionPayload(payload, instanceId);

  // Step 5: Route using instanceId -> consumer mapping
  if (!route && (!config.coreUrl || !config.internalToken)) {
    console.error("[gateway-wa] No routing configured for webhook forwarding");
    return {
      status: 200,
      body: { received: true },
    };
  }

  if (!route && routingTable) {
    return {
      status: 200,
      body: {
        ignored: true,
        reason: "routing_not_configured",
        instanceId,
      },
    };
  }

  try {
    const coreUrl = route
      ? route.internalWebhookUrl
      : `${config.coreUrl}/internal/webhook/whatsapp`;
    const authHeader = route ? route.authHeader : "X-Serena-Internal-Token";
    const authValue = route ? route.authValue : (config.internalToken ?? "");

    const response = await fetch(coreUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [authHeader]: authValue,
      },
      body: JSON.stringify(normalized),
    });

    if (!response.ok) {
      console.error(
        `[gateway-wa] consumer webhook returned HTTP ${response.status} when routing webhook${route ? ` (consumerId=${route.consumerId})` : " (legacy Serena fallback)"}`,
      );
      return {
        status: 200,
        body: { received: true },
      };
    }

    return {
      status: 200,
      body: {
        received: true,
        routedTo: route?.consumerId ?? "serena-core",
      },
    };
  } catch (err: unknown) {
    console.error(
      `[gateway-wa] Failed to route webhook to configured consumer${route ? ` (consumerId=${route.consumerId})` : " (legacy Serena fallback)"}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      status: 200,
      body: { received: true },
    };
  }
}

/**
 * Handle a connection.update webhook from Evolution API.
 * Updates the InstanceManager status for the affected instance.
 */
function handleConnectionUpdate(
  payload: EvolutionConnectionUpdatePayload,
  manager: InstanceManager,
): HandlerResult {
  const instanceName = payload.instance;
  const state = payload.data?.state;

  if (!instanceName || !state) {
    return {
      status: 200,
      body: { received: true, ignored: true, reason: "invalid_connection_update" },
    };
  }

  const gatewayStatus = mapEvolutionStateToGatewayStatus(state);
  manager.updateStatus(instanceName, gatewayStatus);

  console.log(
    `[gateway-wa] connection.update: instance="${instanceName}" state="${state}" → status="${gatewayStatus}"`,
  );

  return {
    status: 200,
    body: {
      received: true,
      instance: instanceName,
      status: gatewayStatus,
    },
  };
}
