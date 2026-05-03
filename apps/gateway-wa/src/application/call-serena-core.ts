/**
 * T18 — Call Serena Core (HTTP client).
 *
 * Makes an HTTP POST to Serena Core's internal pipeline endpoint.
 * Validates configuration before attempting the HTTP call.
 * Uses Node 22 built-in fetch — zero npm dependencies.
 *
 * Endpoint contract:
 * - POST {coreUrl}/internal/pipeline/process
 * - Headers: Content-Type: application/json, X-Serena-Internal-Token: {token}
 * - Body: { messageId, senderWhatsAppId, messageText, receivedAt }
 */

import type { PipelineResult, PipelineInput } from "../domain/pipeline-result.ts";

export type GatewayConfig = {
  coreUrl: string;
  internalToken: string;
};

/**
 * Call Serena Core's internal pipeline endpoint.
 *
 * @param payload - Normalized pipeline input from the mock event
 * @param messageId - Original message ID (sent separately for idempotency)
 * @param config - Gateway configuration (URL and token)
 * @returns The PipelineResult from Serena Core
 * @throws On config errors (missing URL/token), HTTP errors (non-2xx), or network errors
 */
export async function callSerenaCore(
  payload: PipelineInput,
  messageId: string,
  config: GatewayConfig,
): Promise<PipelineResult> {
  // Validate configuration BEFORE making any HTTP call
  if (!config.coreUrl || config.coreUrl.trim() === "") {
    throw new Error("SERENA_CORE_URL is not configured. Set the SERENA_CORE_URL environment variable.");
  }

  if (!config.internalToken || config.internalToken.trim() === "") {
    throw new Error("SERENA_INTERNAL_TOKEN is not configured. Set the SERENA_INTERNAL_TOKEN environment variable.");
  }

  const url = `${config.coreUrl}/internal/pipeline/process`;

  const body = {
    messageId,
    senderWhatsAppId: payload.senderWhatsAppId,
    messageText: payload.messageText,
    receivedAt: payload.receivedAt,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Serena-Internal-Token": config.internalToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Network error calling Serena Core at ${config.coreUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch {
      // Ignore body read errors
    }
    throw new Error(
      `Serena Core returned HTTP ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
    );
  }

  const result = (await response.json()) as PipelineResult;
  return result;
}
