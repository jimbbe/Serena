import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";
import type { DeliveryResult } from "../domain/delivery-result.ts";
import type { DeliveryPort } from "../port/delivery-port.ts";

type FetchLike = typeof fetch;

export type GatewayWaDeliveryPortOptions = {
  baseUrl: string;
  appKey: string;
  instanceId: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
};

export class GatewayWaDeliveryPort implements DeliveryPort {
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly instanceId: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;

  constructor(options: GatewayWaDeliveryPortOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.appKey = options.appKey;
    this.instanceId = options.instanceId;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async sendPreparedMessage(request: PreparedDeliveryRequest): Promise<DeliveryResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-app-key": this.appKey,
        },
        body: JSON.stringify({
          instanceId: this.instanceId,
          to: request.recipientExternalId,
          text: request.messageText,
        }),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      const parsed = safeParseJson(rawBody);

      if (response.status === 200) {
        if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") {
          return { status: "failed", failureReason: "gateway_invalid_response", raw: { status: response.status } };
        }

        const value = parsed.value as Record<string, unknown>;
        const providerMessageId = typeof value.messageId === "string" ? value.messageId : undefined;
        const deliveredAt = typeof value.timestamp === "string" ? new Date(value.timestamp) : new Date();
        return {
          status: "delivered",
          ...(providerMessageId !== undefined ? { providerMessageId } : {}),
          deliveredAt,
          raw: { status: response.status },
        };
      }

      if (response.status === 400) {
        const error = getErrorCode(parsed.value);
        if (error === "instance_not_connected") {
          return { status: "failed", failureReason: "gateway_instance_not_connected", raw: { status: 400, error } };
        }
        return { status: "failed", failureReason: "gateway_validation_error", raw: { status: 400, error } };
      }

      if (response.status === 404) {
        return { status: "failed", failureReason: "gateway_instance_not_found", raw: { status: 404 } };
      }

      if (response.status === 502) {
        return { status: "failed", failureReason: "gateway_unreachable", raw: { status: 502 } };
      }

      return { status: "failed", failureReason: "gateway_unexpected_status", raw: { status: response.status } };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { status: "failed", failureReason: "gateway_timeout" };
      }
      return { status: "failed", failureReason: "gateway_network_error" };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; value: undefined } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function getErrorCode(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const code = (payload as Record<string, unknown>).error;
  return typeof code === "string" ? code : undefined;
}
