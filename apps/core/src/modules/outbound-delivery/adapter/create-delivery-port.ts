import type { AppEnv } from "../../../config/env.ts";
import type { DeliveryPort } from "../port/delivery-port.ts";
import { FakeDeliveryPort } from "./fake-delivery-port.ts";
import { GatewayWaDeliveryPort } from "./gateway-wa-delivery-port.ts";

export function createDeliveryPort(env: AppEnv): DeliveryPort {
  if (env.outboundDeliveryAdapter !== "gateway-wa") {
    return new FakeDeliveryPort();
  }

  return new GatewayWaDeliveryPort({
    baseUrl: env.gatewayWaBaseUrl!,
    appKey: env.gatewayWaAppKey!,
    instanceId: env.gatewayWaInstanceId!,
    timeoutMs: env.gatewayWaTimeoutMs,
  });
}
