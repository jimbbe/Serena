/**
 * T18 — Run Dry Gateway Event.
 *
 * Orchestrates the full dry-run pipeline:
 * 1. Validate MockWhatsAppEvent (messageId, from, text must be non-empty)
 * 2. Normalize event → PipelineInput
 * 3. Validate configuration (SERENA_CORE_URL, SERENA_INTERNAL_TOKEN)
 * 4. Call HTTP client with normalized payload + messageId
 * 5. Receive PipelineResult from core
 * 6. Map PipelineResult → WhatsAppGatewayAction
 * 7. Build DryRunResult with all fields
 * 8. Return DryRunResult
 *
 * Invariants:
 * - sent is ALWAYS false
 * - mode is ALWAYS "dry_run"
 * - wouldSend is populated only for draft_ready actions
 */

import type { MockWhatsAppEvent } from "../domain/mock-whatsapp-event.ts";
import type { DryRunResult } from "../domain/dry-run-result.ts";
import type { PipelineResult } from "../domain/pipeline-result.ts";
import type { WhatsAppGatewayAction } from "../domain/gateway-action.ts";
import { normalizeMockWhatsAppEvent } from "./normalize-mock-event.ts";
import { callSerenaCore, type GatewayConfig } from "./call-serena-core.ts";
import { mapPipelineResultToGatewayAction } from "./map-pipeline-result.ts";

/**
 * Run a dry-run gateway execution for the given mock event.
 *
 * @param event - The simulated WhatsApp event
 * @param config - Gateway configuration (optional; defaults to env vars)
 * @returns DryRunResult with the complete execution trace
 */
export async function runDryGatewayEvent(
  event: MockWhatsAppEvent,
  config: GatewayConfig = defaultConfig(),
): Promise<DryRunResult> {
  // 1. Validate and normalize the event
  const normalized = normalizeMockWhatsAppEvent(event);
  if (!normalized.ok) {
    return buildErrorResult(event, null, normalized.error);
  }

  const normalizedPayload = {
    messageId: event.messageId,
    senderWhatsAppId: normalized.value.senderWhatsAppId,
    messageText: normalized.value.messageText,
    receivedAt: normalized.value.receivedAt,
  };

  // 2. Validate configuration
  if (!config.coreUrl || config.coreUrl.trim() === "") {
    return buildErrorResult(event, normalizedPayload, "SERENA_CORE_URL is not configured");
  }

  if (!config.internalToken || config.internalToken.trim() === "") {
    return buildErrorResult(event, normalizedPayload, "SERENA_INTERNAL_TOKEN is not configured");
  }

  // 3. Call Serena Core
  let pipelineResult: PipelineResult;
  try {
    pipelineResult = await callSerenaCore(normalized.value, event.messageId, config);
  } catch (err) {
    return buildErrorResult(
      event,
      normalizedPayload,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. Map PipelineResult → WhatsAppGatewayAction
  const gatewayAction = mapPipelineResultToGatewayAction(pipelineResult);

  // 5. Extract wouldSend (only for draft_ready)
  const wouldSend =
    gatewayAction.action === "draft_ready"
      ? { to: gatewayAction.toWhatsAppId, text: gatewayAction.text }
      : null;

  return {
    mode: "dry_run",
    sent: false,
    inputEvent: event,
    normalizedPayload,
    pipelineResult,
    gatewayAction,
    wouldSend,
  };
}

/**
 * Build a dry-run result for error cases.
 */
function buildErrorResult(
  event: MockWhatsAppEvent,
  normalizedPayload: DryRunResult["normalizedPayload"],
  error: string,
): DryRunResult {
  return {
    mode: "dry_run",
    sent: false,
    inputEvent: event,
    normalizedPayload,
    pipelineResult: null,
    gatewayAction: null,
    wouldSend: null,
    error,
  };
}

/**
 * Default configuration from environment variables.
 */
function defaultConfig(): GatewayConfig {
  return {
    coreUrl: process.env["SERENA_CORE_URL"] ?? "",
    internalToken: process.env["SERENA_INTERNAL_TOKEN"] ?? "",
  };
}
