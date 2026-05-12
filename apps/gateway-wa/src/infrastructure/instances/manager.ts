/**
 * T10 — Instance Manager.
 *
 * In-memory Map<string, InstanceState> tracking instance lifecycle.
 * Wraps the Evolution client for CRUD operations.
 * Evolution API is the source of truth — cache is for routing metadata only.
 */

import type { EvolutionClient } from "../evolution/client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstanceStatus = "disconnected" | "connecting" | "connected" | "open";

export type InstanceState = {
  name: string;
  status: InstanceStatus;
  qr: string | null;
  connectedAt: string | null;
};

export type InstanceQueryResult = {
  found: true;
  qr: string | null;
  status: InstanceStatus;
} | {
  found: false;
};

export type DeleteResult = {
  name: string;
  deleted: true;
};

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class InstanceManager {
  private _instances: Map<string, InstanceState> = new Map();
  private evoClient: EvolutionClient;

  constructor(evoClient: EvolutionClient) {
    this.evoClient = evoClient;
  }

  /**
   * Create a new WhatsApp instance via Evolution API.
   * Creates + connects the instance, stores state, returns the QR code.
   */
  async createInstance(name: string): Promise<InstanceState> {
    if (this._instances.has(name)) {
      throw Object.assign(
        new Error(`Instance "${name}" already exists`),
        { status: 409 },
      );
    }

    // Call Evolution API to create the instance
    await this.evoClient.createInstance(name);

    // Get QR/pairing code
    const qrResponse = await this.evoClient.connectInstance(name);
    const qrCode = qrResponse.pairingCode ?? null;

    const state: InstanceState = {
      name,
      status: "disconnected",
      qr: qrCode,
      connectedAt: null,
    };

    this._instances.set(name, state);
    return state;
  }

  /**
   * List all tracked instances with their current status.
   */
  listInstances(): Array<{ name: string; status: InstanceStatus; connectedAt: string | null }> {
    const result: Array<{ name: string; status: InstanceStatus; connectedAt: string | null }> = [];
    for (const [, state] of this._instances) {
      result.push({
        name: state.name,
        status: state.status,
        connectedAt: state.connectedAt,
      });
    }
    return result;
  }

  /**
   * Get QR code for an instance.
   * If the instance is connected/open, returns a "connected" message instead of QR.
   */
  getQrCode(name: string): InstanceQueryResult {
    const state = this._instances.get(name);
    if (!state) {
      return { found: false };
    }

    if (state.status === "connected" || state.status === "open") {
      return { found: true, qr: null, status: state.status };
    }

    return { found: true, qr: state.qr, status: state.status };
  }

  /**
   * Delete an instance via Evolution API and remove from tracking.
   */
  async deleteInstance(name: string): Promise<DeleteResult> {
    const state = this._instances.get(name);
    if (!state) {
      throw Object.assign(
        new Error(`Instance "${name}" not found`),
        { status: 404 },
      );
    }

    await this.evoClient.deleteInstance(name);
    this._instances.delete(name);

    return { name, deleted: true };
  }

  /**
   * Check if an instance exists in the manager.
   */
  exists(name: string): boolean {
    return this._instances.has(name);
  }

  /**
   * Get an instance state by name.
   */
  get(name: string): InstanceState | undefined {
    return this._instances.get(name);
  }

  /**
   * Update the connection status of a tracked instance.
   * Called when a connection.update webhook arrives from Evolution API.
   * If the instance is not tracked, it is silently ignored (no crash).
   */
  updateStatus(name: string, status: InstanceStatus): void {
    const existing = this._instances.get(name);
    if (!existing) return; // untracked instance — ignore

    existing.status = status;
    if (status === "connected" || status === "open") {
      existing.connectedAt = new Date().toISOString();
    }
  }
}
