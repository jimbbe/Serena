/**
 * T12 — Message Sender.
 *
 * Validates send request fields, checks instance existence and connection
 * status, calls Evolution API sendText, and maps the response.
 */

import type { EvolutionClient } from "../evolution/client.ts";
import type { InstanceManager } from "../instances/manager.ts";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type SendResult =
  | {
      ok: true;
      value: {
        messageId: string;
        status: string;
        timestamp: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      fields?: string[];
      name?: string;
      message?: string;
    };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_INSTANCE_NAME = /^[a-zA-Z0-9-]+$/;
const VALID_TO = /^[0-9]+$/;

function validateSendRequest(
  instanceId: string,
  to: string,
  text: string,
): string[] | null {
  const fields: string[] = [];

  if (!instanceId || instanceId.trim().length === 0) {
    fields.push("instanceId");
  } else if (!VALID_INSTANCE_NAME.test(instanceId.trim())) {
    fields.push("instanceId");
  }

  if (!to || to.trim().length === 0) {
    fields.push("to");
  } else if (!VALID_TO.test(to.trim())) {
    fields.push("to");
  }

  if (!text || text.trim().length === 0) {
    fields.push("text");
  }

  return fields.length > 0 ? fields : null;
}

// ---------------------------------------------------------------------------
// MessageSender
// ---------------------------------------------------------------------------

export class MessageSender {
  private evoClient: EvolutionClient;
  private manager: InstanceManager;

  constructor(evoClient: EvolutionClient, manager: InstanceManager) {
    this.evoClient = evoClient;
    this.manager = manager;
  }

  /**
   * Send a text message via a WhatsApp instance.
   *
   * Steps:
   * 1. Validate fields (instanceId, to, text)
   * 2. Check instance exists in manager
   * 3. Check instance is connected (with stale state fallback)
   * 4. Call Evolution API sendText
   * 5. Map response
   *
   * Stale state handling (Step 3):
   * - If manager says connected/open → send directly
   * - If manager says disconnected/connecting → query Evolution API for real state
   *   - If Evolution says open/connected → update manager, proceed to send
   *   - If Evolution says disconnected/closed → block with instance_not_connected
   *   - If Evolution API unreachable → return 502 evolution_unreachable
   */
  async sendText(
    instanceId: string,
    to: string,
    text: string,
  ): Promise<SendResult> {
    // Step 1: Validate
    const validationFields = validateSendRequest(instanceId, to, text);
    if (validationFields !== null) {
      return {
        ok: false,
        status: 400,
        error: "validation_error",
        fields: validationFields,
      };
    }

    const trimmedId = instanceId.trim();

    // Step 2: Check instance exists
    if (!this.manager.exists(trimmedId)) {
      return {
        ok: false,
        status: 404,
        error: "instance_not_found",
        name: trimmedId,
      };
    }

    // Step 3: Check instance is connected (with stale state fallback)
    const instance = this.manager.get(trimmedId);
    if (!instance) {
      return {
        ok: false,
        status: 404,
        error: "instance_not_found",
        name: trimmedId,
      };
    }

    if (instance.status !== "connected" && instance.status !== "open") {
      // Manager says disconnected/connecting — check Evolution API for real state
      const evoState = await this.checkEvolutionState(trimmedId);
      if (!evoState.ok) {
        return evoState.result;
      }

      // Evolution says connected — update manager and proceed
      this.manager.updateStatus(trimmedId, evoState.status);
    }

    // Step 4: Call Evolution API
    try {
      const response = await this.evoClient.sendText(
        trimmedId,
        to.trim(),
        text.trim(),
      );

      // Step 5: Map response
      return {
        ok: true,
        value: {
          messageId: response.key.id,
          status: "sent",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        ok: false,
        status: 502,
        error: "evolution_unreachable",
        message,
      };
    }
  }

  /**
   * Check the real connection state from Evolution API.
   * Returns ok:true with status if connected, or ok:false with error result.
   */
  private async checkEvolutionState(
    instanceId: string,
  ): Promise<
    | { ok: true; status: "connected" | "open" }
    | { ok: false; result: SendResult }
  > {
    try {
      const evoState = await this.evoClient.getConnectionState(instanceId);
      const state = evoState.state.toLowerCase();

      if (state === "open" || state === "connected") {
        const gatewayStatus = state === "open" ? "open" : "connected";
        return { ok: true, status: gatewayStatus };
      }

      // Evolution confirms disconnected
      return {
        ok: false,
        result: {
          ok: false,
          status: 400,
          error: "instance_not_connected",
          name: instanceId,
          message: `Evolution API reports state: ${evoState.state}`,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        ok: false,
        result: {
          ok: false,
          status: 502,
          error: "evolution_unreachable",
          message: `Cannot verify instance state: ${message}`,
        },
      };
    }
  }
}
