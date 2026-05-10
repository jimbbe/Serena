import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";
import type { DeliveryResult } from "../domain/delivery-result.ts";

/**
 * Port for delivering prepared outbound messages.
 * Implementations handle the actual transport (WhatsApp, email, etc.).
 * The core does not know about specific channels.
 */
export type DeliveryPort = {
  sendPreparedMessage(request: PreparedDeliveryRequest): Promise<DeliveryResult>;
};
