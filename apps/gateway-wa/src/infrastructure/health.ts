/**
 * T9 — Health endpoint handler.
 *
 * GET /health — returns service status. No auth required.
 */

export type HandlerResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

/**
 * Handle GET /health requests.
 * Returns service info including current mode.
 */
export async function handleHealth(mode: string): Promise<HandlerResult> {
  return {
    status: 200,
    body: {
      status: "ok",
      service: "whatsapp-gateway",
      mode,
    },
  };
}
