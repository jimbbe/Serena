/**
 * T3 — Evolution API types and error mapping.
 *
 * Type definitions and error mapping utilities for Evolution API communication.
 */

// ---------------------------------------------------------------------------
// Request/Response types
// ---------------------------------------------------------------------------

export type CreateInstanceRequest = {
  instanceName: string;
};

export type CreateInstanceResponse = {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  qrcode?: {
    pairingCode?: string;
    base64?: string;
  };
};

export type ConnectionStateResponse = {
  instance: {
    state: "open" | "connecting" | "close";
    statusReason?: number;
  };
};

export type QrCodeResponse = {
  pairingCode?: string;
  base64?: string;
};

export type SendTextRequest = {
  number: string;
  text: string;
};

export type SendTextResponse = {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  message: {
    conversation: string;
  };
  messageTimestamp: string;
  status: string;
};

export type DeleteInstanceResponse = {
  status: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Evolution API Error
// ---------------------------------------------------------------------------

export type EvolutionApiError = {
  status: number;
  message: string;
  evolutionStatus?: number;
};

// ---------------------------------------------------------------------------
// Timeout constants
// ---------------------------------------------------------------------------

export const CONNECTION_TIMEOUT_MS = 5000;
export const RESPONSE_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Maps an error from calling Evolution API into a gateway error.
 * - Connection refused (ERR_CONNECTION_REFUSED, ECONNREFUSED) → 502
 * - Timeout/AbortError → 504
 * - 4xx Evolution errors → mapped status code
 * - 5xx Evolution errors → passthrough
 */
export function mapEvolutionError(err: unknown): EvolutionApiError {
  // Connection refused / network errors → 502
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("connection refused") ||
      msg.includes("econnrefused") ||
      msg.includes("fetch failed")
    ) {
      return {
        status: 502,
        message: "Evolution API is not reachable",
      };
    }

    // Timeout / abort → 504
    if (
      msg.includes("timeout") ||
      msg.includes("abort") ||
      (err.name === "TimeoutError") ||
      (err.name === "AbortError")
    ) {
      return {
        status: 504,
        message: "Evolution API request timed out",
      };
    }

    // Generic network error → 502
    return {
      status: 502,
      message: `Evolution API error: ${err.message}`,
    };
  }

  // Non-Error throw (shouldn't happen) → 502
  return {
    status: 502,
    message: "Evolution API unknown error",
  };
}

// ---------------------------------------------------------------------------
// Webhook payload types (from Evolution API MESSAGES_UPSERT event)
// ---------------------------------------------------------------------------

export type EvolutionWebhookPayload = {
  event: string;
  instance: string;
  data: {
    key: {
      id: string;
      remoteJid: string;
      fromMe: boolean;
    };
    pushName?: string;
    messageTimestamp: number; // unix seconds
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
      imageMessage?: unknown;
      audioMessage?: unknown;
      videoMessage?: unknown;
      documentMessage?: unknown;
      reactionMessage?: unknown;
    };
  };
};
