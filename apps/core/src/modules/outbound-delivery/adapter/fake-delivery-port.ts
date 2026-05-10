import { randomUUID } from "node:crypto";

import type { DeliveryPort } from "../port/delivery-port.ts";
import type { PreparedDeliveryRequest } from "../domain/prepared-delivery-request.ts";
import type { DeliveryResult } from "../domain/delivery-result.ts";

export type FakeDeliveryPortOptions = {
  mode?: "success" | "failure";
  failureReason?: string;
};

/**
 * Fake implementation of DeliveryPort for testing and development.
 * Makes no external calls. Stores all requests in memory for verification.
 */
export class FakeDeliveryPort implements DeliveryPort {
  private readonly mode: "success" | "failure";
  private readonly failureReason: string;
  private readonly sentRequests: PreparedDeliveryRequest[] = [];

  constructor(options?: FakeDeliveryPortOptions) {
    this.mode = options?.mode ?? "success";
    this.failureReason = options?.failureReason ?? "simulated_failure";
  }

  async sendPreparedMessage(request: PreparedDeliveryRequest): Promise<DeliveryResult> {
    this.sentRequests.push(request);

    if (this.mode === "failure") {
      return {
        status: "failed",
        failureReason: this.failureReason,
      };
    }

    return {
      status: "delivered",
      providerMessageId: `fake_msg_${randomUUID()}`,
      deliveredAt: new Date(),
    };
  }

  /** Returns all requests that have been sent through this port. */
  getSentRequests(): readonly PreparedDeliveryRequest[] {
    return [...this.sentRequests];
  }

  /** Clear stored requests (useful for test isolation). */
  clearSentRequests(): void {
    this.sentRequests.length = 0;
  }
}
