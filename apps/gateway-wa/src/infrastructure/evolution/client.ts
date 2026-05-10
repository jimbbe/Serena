/**
 * T4 — Evolution API Client.
 *
 * Wraps native `fetch` to call Evolution API endpoints. Uses AbortSignal.timeout
 * for 30s timeout. All requests include `apikey` header. Connection errors
 * mapped to clear gateway error messages.
 */

import type {
  CreateInstanceResponse,
  ConnectionStateResponse,
  QrCodeResponse,
  SendTextResponse,
  DeleteInstanceResponse,
} from "./types.ts";
import { RESPONSE_TIMEOUT_MS, mapEvolutionError } from "./types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type EvolutionClientConfig = {
  baseUrl: string;
  apiKey: string;
};

export type EvolutionClient = {
  createInstance(name: string): Promise<CreateInstanceResponse>;
  getConnectionState(name: string): Promise<{ state: string }>;
  connectInstance(name: string): Promise<QrCodeResponse>;
  sendText(
    instanceName: string,
    number: string,
    text: string,
  ): Promise<SendTextResponse>;
  deleteInstance(name: string): Promise<DeleteInstanceResponse>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an Evolution API client bound to a base URL and API key.
 * Validates config upfront — fails fast if URL or key is missing.
 */
export function createEvolutionClient(config: EvolutionClientConfig): EvolutionClient {
  if (!config.baseUrl || config.baseUrl.trim() === "") {
    throw new Error(
      "EVOLUTION_API_URL is not configured. Set the EVOLUTION_API_URL environment variable.",
    );
  }
  if (!config.apiKey || config.apiKey.trim() === "") {
    throw new Error(
      "EVOLUTION_API_KEY is not configured. Set the EVOLUTION_API_KEY environment variable.",
    );
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, ""); // strip trailing slashes
  const apiKey = config.apiKey;

  // -------------------------------------------------------------------------
  // Internal fetch helper
  // -------------------------------------------------------------------------

  async function evolutionFetch<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "apikey": apiKey,
    };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
      });

      if (!response.ok) {
        let responseBody = "";
        try {
          responseBody = await response.text();
        } catch {
          // ignore body read errors
        }
        throw new Error(
          `Evolution API returned HTTP ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      // Map fetch-level errors (connection refused, timeout, etc.)
      const mapped = mapEvolutionError(err);
      throw new Error(mapped.message);
    }
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  return {
    async createInstance(name: string): Promise<CreateInstanceResponse> {
      return evolutionFetch<CreateInstanceResponse>("POST", "/instance/create", {
        instanceName: name,
      });
    },

    async getConnectionState(name: string): Promise<{ state: string }> {
      const result = await evolutionFetch<ConnectionStateResponse>(
        "GET",
        `/instance/connectionState/${encodeURIComponent(name)}`,
      );
      return { state: result.instance.state };
    },

    async connectInstance(name: string): Promise<QrCodeResponse> {
      return evolutionFetch<QrCodeResponse>(
        "GET",
        `/instance/connect/${encodeURIComponent(name)}`,
      );
    },

    async sendText(
      instanceName: string,
      number: string,
      text: string,
    ): Promise<SendTextResponse> {
      return evolutionFetch<SendTextResponse>(
        "POST",
        `/message/sendText/${encodeURIComponent(instanceName)}`,
        { number, text },
      );
    },

    async deleteInstance(name: string): Promise<DeleteInstanceResponse> {
      return evolutionFetch<DeleteInstanceResponse>(
        "DELETE",
        `/instance/delete/${encodeURIComponent(name)}`,
      );
    },
  };
}
