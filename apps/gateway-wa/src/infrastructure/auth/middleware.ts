/**
 * T2 — Auth middleware: 3-tier API key validation.
 *
 * Extracts API keys from request headers, validates against env-stored keys
 * using constant-time comparison (node:crypto.timingSafeEqual), and maps
 * endpoints to required tiers.
 *
 * Tiers:
 * - Admin  (GATEWAY_ADMIN_KEY): /instances*
 * - App     (GATEWAY_APP_KEY):  /send
 * - Evo     (GATEWAY_EVO_KEY):  /webhook/evolution
 * - None:   /health
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { GatewayRuntimeConfig } from "../config.ts";

type AuthResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, string> };

/**
 * Determine which tier is required for the given path.
 * Returns the header name and expected key, or null for no-auth paths.
 */
function resolveTier(
  path: string,
  config: GatewayRuntimeConfig,
): { header: string; expectedKey: string } | null {
  // Health — no auth
  if (path === "/health") return null;

  // Webhook — Evo key
  if (path.startsWith("/webhook/evolution")) {
    return { header: "x-gateway-evo-key", expectedKey: config.evoKey };
  }

  // Send — App key
  if (path.startsWith("/send")) {
    return { header: "x-gateway-app-key", expectedKey: config.appKey };
  }

  // Instance management — Admin key
  if (path.startsWith("/instances")) {
    return { header: "x-gateway-admin-key", expectedKey: config.adminKey };
  }

  // Unknown paths — no auth required (let router handle 404)
  return null;
}

/**
 * Constant-time string comparison using node:crypto.timingSafeEqual.
 * Both buffers must have the same length — we enforce that by padding.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Use TextEncoder for UTF-8 encoding consistency
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extract an API key from request headers for a given tier.
 * Returns the raw header value found, or null if no tier-appropriate header exists.
 */
function extractKey(req: IncomingMessage): {
  header: string;
  value: string;
} | null {
  const headers = req.headers;
  // Check each possible header
  for (const headerName of [
    "x-gateway-admin-key",
    "x-gateway-app-key",
    "x-gateway-evo-key",
  ]) {
    const val = headers[headerName];
    if (val !== undefined && val !== null && val !== "") {
      const str = Array.isArray(val) ? val[0] ?? "" : val;
      if (str.length > 0) {
        return { header: headerName, value: str };
      }
    }
  }
  return null;
}

/**
 * Validate that the request has the correct API key for the requested path.
 *
 * @param req — Incoming HTTP request (headers only needed)
 * @param path — Request path (e.g. "/instances", "/send")
 * @param config — Gateway runtime config with API keys
 * @returns Auth result — ok or error with status + body
 */
export function validateAuth(
  req: IncomingMessage,
  path: string,
  config: GatewayRuntimeConfig,
): AuthResult {
  const tier = resolveTier(path, config);

  // No auth required for this path
  if (tier === null) {
    return { ok: true };
  }

  // Extract any key from the request
  const extracted = extractKey(req);

  // No key provided at all
  if (extracted === null) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "unauthorized",
        message: "API key required",
      },
    };
  }

  // Check if the key header matches the required tier
  // Wrong tier → 403 even if the key value is valid
  if (extracted.header !== tier.header) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "forbidden",
        message: "Invalid API key",
      },
    };
  }

  // Constant-time comparison
  if (!constantTimeEqual(extracted.value, tier.expectedKey)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "forbidden",
        message: "Invalid API key",
      },
    };
  }

  return { ok: true };
}
