/**
 * T18 — Dry-Run Result.
 *
 * Represents the outcome of a dry-run gateway execution.
 * Always has `sent: false` — this is a mock, never sends real messages.
 *
 * In error cases, `pipelineResult` and `gatewayAction` are null
 * and the `error` field provides the details.
 */

import type { MockWhatsAppEvent } from "./mock-whatsapp-event.ts";
import type { PipelineResult } from "./pipeline-result.ts";
import type { WhatsAppGatewayAction } from "./gateway-action.ts";

export type DryRunResult = {
  /** Fixed literal — always dry-run mode */
  mode: "dry_run";

  /** Always false — no real messages are ever sent */
  sent: false;

  /** Reference to the original mock event */
  inputEvent: MockWhatsAppEvent;

  /** The normalized payload sent to Serena Core (includes messageId for traceability) */
  normalizedPayload: {
    messageId: string;
    senderWhatsAppId: string;
    messageText: string;
    receivedAt: string;
  } | null;

  /** The result returned by Serena Core (null on error before HTTP) */
  pipelineResult: PipelineResult | null;

  /** The action the gateway would have taken (null on error before HTTP) */
  gatewayAction: WhatsAppGatewayAction | null;

  /** Populated only for draft_ready actions; contains to and text */
  wouldSend: { to: string; text: string } | null;

  /** Error message if something went wrong (validation, config, HTTP) */
  error?: string;
};
