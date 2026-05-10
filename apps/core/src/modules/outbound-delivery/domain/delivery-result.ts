/**
 * Result of a delivery attempt via DeliveryPort.
 */
export type DeliveryResult = {
  readonly status: "accepted" | "delivered" | "failed";
  readonly providerMessageId?: string;
  readonly failureReason?: string;
  readonly deliveredAt?: Date;
  readonly raw?: Record<string, unknown>;
};
