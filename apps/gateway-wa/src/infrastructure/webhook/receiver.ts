/**
 * T14 — Webhook receiver: full handler (dedup + filter + normalize + route).
 *
 * Chains dedup → filter → normalize → route to Serena Core for incoming
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

/**
 * Handle POST /webhook/evolution.
 *
 * Flow for MESSAGES_UPSERT:
 * 1. Parse body as Evolution webhook payload
 * 2. Dedup: silently accept duplicate messageIds (200 OK)
 * 3. Filter: discard self-messages and non-text
 * 4. Normalize: Evolution payload → NormalizedWhatsAppInboundMessage
 * 5. Route: POST to Serena Core /internal/webhook/whatsapp
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
        ignored: true,
        reason: "duplicate",
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
  const instanceId = payload.instance ?? "unknown";
  const normalized = normalizeEvolutionPayload(payload, instanceId);

  // Step 5: Route to Serena Core
  if (!config.coreUrl || config.coreUrl.trim() === "") {
    console.error("[gateway-wa] SERENA_CORE_URL is not configured — cannot route webhook");
    return {
      status: 200,
      body: { received: true },
    };
  }

  try {
    const coreUrl = `${config.coreUrl}/internal/webhook/whatsapp`;

    const response = await fetch(coreUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Serena-Internal-Token": config.internalToken,
      },
      body: JSON.stringify(normalized),
    });

    if (!response.ok) {
      console.error(
        `[gateway-wa] Serena Core returned HTTP ${response.status} when routing webhook`,
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
        routedTo: "serena-core",
      },
    };
  } catch (err: unknown) {
    console.error(
      `[gateway-wa] Failed to route webhook to Serena Core: ${err instanceof Error ? err.message : String(err)}`,
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
